function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
}

function safeText(value, fallback) {
  const text = value ? String(value).trim() : "";
  return text || fallback;
}

function safeFileName(value) {
  return String(value || "photo.jpg")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function centsFromPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.round(number * 100);
}

function getRequestOrigin(request) {
  const url = new URL(request.url);
  return url.origin;
}

function makeMoneyAmount(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

async function ensureStripeTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS stripe_orders (
      id TEXT PRIMARY KEY,
      stripe_session_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS stripe_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      display_key TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
}

async function getCartImagesFromDb(env, collectionId, eventId, imageIds) {
  const cleanImageIds = Array.from(new Set(
    (imageIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));

  if (cleanImageIds.length === 0) {
    throw new Error("At least one image is required");
  }

  if (cleanImageIds.length > 100) {
    throw new Error("Too many images in cart");
  }

  const placeholders = cleanImageIds.map(() => "?").join(", ");

  const result = await env.DB.prepare(`
    SELECT
      images.id,
      images.file_name,
      images.display_key,
      images.price_cents,
      images.collection_id,
      images.event_id,
      events.name AS event_name,
      collections.name AS collection_name
    FROM images
    JOIN events ON images.event_id = events.id
    JOIN collections ON images.collection_id = collections.id
    WHERE images.collection_id = ?
    AND images.event_id = ?
    AND images.id IN (${placeholders})
  `).bind(collectionId, eventId, ...cleanImageIds).all();

  const images = result.results || [];

  if (images.length !== cleanImageIds.length) {
    throw new Error("One or more cart images could not be found");
  }

  return images;
}

async function handleStripeCreateCheckout(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Stripe create checkout",
        error: "Use POST"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Stripe create checkout",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Stripe create checkout",
        error: "Stripe secret key is missing"
      },
      500
    );
  }

  try {
    const body = await request.json();

    const collectionId = body && body.collectionId ? String(body.collectionId).trim() : "";
    const eventId = body && body.eventId ? String(body.eventId).trim() : "";
    const buyerEmail = body && body.buyerEmail ? String(body.buyerEmail).trim().toLowerCase() : "";
    const imageIds = body && Array.isArray(body.imageIds) ? body.imageIds : [];

    if (!collectionId || !eventId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Stripe create checkout",
          error: "collectionId and eventId are required"
        },
        400
      );
    }

    if (!buyerEmail || !buyerEmail.includes("@")) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Stripe create checkout",
          error: "Valid buyerEmail is required"
        },
        400
      );
    }

    await ensureStripeTables(env);

    const images = await getCartImagesFromDb(env, collectionId, eventId, imageIds);
    const amountCents = images.reduce((total, image) => total + Number(image.price_cents || 0), 0);

    if (amountCents <= 0) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Stripe create checkout",
          error: "Cart total must be greater than zero"
        },
        400
      );
    }

    const checkedAt = new Date().toISOString();
    const origin = getRequestOrigin(request);
    const localOrderId = crypto.randomUUID();

    const successUrl = `${origin}/view?collectionId=${encodeURIComponent(collectionId)}&eventId=${encodeURIComponent(eventId)}&stripe=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/view?collectionId=${encodeURIComponent(collectionId)}&eventId=${encodeURIComponent(eventId)}&stripe=cancel`;

    const stripeParams = new URLSearchParams();

    stripeParams.append("mode", "payment");
    stripeParams.append("success_url", successUrl);
    stripeParams.append("cancel_url", cancelUrl);
    stripeParams.append("customer_email", buyerEmail);
    stripeParams.append("client_reference_id", localOrderId);
    stripeParams.append("payment_method_types[0]", "card");
    stripeParams.append("metadata[local_order_id]", localOrderId);
    stripeParams.append("metadata[collection_id]", collectionId);
    stripeParams.append("metadata[event_id]", eventId);
    stripeParams.append("metadata[buyer_email]", buyerEmail);
    stripeParams.append("payment_intent_data[metadata][local_order_id]", localOrderId);
    stripeParams.append("payment_intent_data[metadata][collection_id]", collectionId);
    stripeParams.append("payment_intent_data[metadata][event_id]", eventId);
    stripeParams.append("payment_intent_data[metadata][buyer_email]", buyerEmail);

    images.forEach((image, index) => {
      const imageName = image.file_name || "FOTODECK photo";
      const cleanPriceCents = Number(image.price_cents || 0);

      stripeParams.append(`line_items[${index}][quantity]`, "1");
      stripeParams.append(`line_items[${index}][price_data][currency]`, "nzd");
      stripeParams.append(`line_items[${index}][price_data][unit_amount]`, String(cleanPriceCents));
      stripeParams.append(`line_items[${index}][price_data][product_data][name]`, imageName);
      stripeParams.append(`line_items[${index}][price_data][product_data][description]`, `${image.collection_name || "FOTODECK"} / ${image.event_name || "Event"}`);
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: stripeParams.toString()
    });

    const stripeResult = await stripeResponse.json();

    if (!stripeResponse.ok || !stripeResult.id || !stripeResult.url) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Stripe create checkout",
          error: stripeResult.error && stripeResult.error.message
            ? stripeResult.error.message
            : "Stripe Checkout Session could not be created",
          stripe: stripeResult
        },
        502
      );
    }

    await env.DB.prepare(`
      INSERT INTO stripe_orders (
        id,
        stripe_session_id,
        collection_id,
        event_id,
        buyer_email,
        amount_cents,
        currency,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      localOrderId,
      stripeResult.id,
      collectionId,
      eventId,
      buyerEmail,
      amountCents,
      "NZD",
      "CREATED",
      checkedAt
    ).run();

    for (const image of images) {
      await env.DB.prepare(`
        INSERT INTO stripe_order_items (
          id,
          order_id,
          image_id,
          file_name,
          display_key,
          price_cents,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        localOrderId,
        image.id,
        image.file_name,
        image.display_key,
        Number(image.price_cents || 0),
        checkedAt
      ).run();
    }

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Stripe create checkout",
      order: {
        id: localOrderId,
        stripe_session_id: stripeResult.id,
        buyer_email: buyerEmail,
        amount_cents: amountCents,
        amount: makeMoneyAmount(amountCents),
        currency: "NZD",
        photo_count: images.length,
        status: "CREATED"
      },
      checkoutUrl: stripeResult.url,
      checkedAt
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Stripe create checkout",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      500
    );
  }
}

async function handleImages(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "D1 images read",
        error: "Use GET"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "D1 images read",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  try {
    const url = new URL(request.url);
    const collectionId = url.searchParams.get("collectionId");
    const eventId = url.searchParams.get("eventId");

    let query = `
      SELECT
        images.id,
        images.file_name,
        images.display_key,
        images.watermark_text,
        images.price_cents,
        images.event_id,
        events.name AS event_name,
        images.collection_id,
        collections.name AS collection_name,
        images.created_at
      FROM images
      JOIN events ON images.event_id = events.id
      JOIN collections ON images.collection_id = collections.id
    `;

    const filters = [];
    const values = [];

    if (collectionId) {
      filters.push("images.collection_id = ?");
      values.push(collectionId);
    }

    if (eventId) {
      filters.push("images.event_id = ?");
      values.push(eventId);
    }

    if (filters.length > 0) {
      query += ` WHERE ${filters.join(" AND ")}`;
    }

    query += ` ORDER BY images.created_at DESC`;

    const prepared = env.DB.prepare(query);
    const result = values.length > 0
      ? await prepared.bind(...values).all()
      : await prepared.all();

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "D1 images read",
      collectionId: collectionId || null,
      eventId: eventId || null,
      images: result.results || [],
      count: result.results ? result.results.length : 0,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "D1 images read",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      500
    );
  }
}

async function handleCollectionsEvents(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "D1 collections and events read",
        error: "Use GET"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "D1 collections and events read",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        display_key TEXT NOT NULL,
        watermark_text TEXT,
        price_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    const collectionsResult = await env.DB.prepare(`
      SELECT
        collections.id,
        collections.name,
        collections.created_at,
        COUNT(images.id) AS photo_count
      FROM collections
      LEFT JOIN images ON collections.id = images.collection_id
      GROUP BY collections.id, collections.name, collections.created_at
      ORDER BY collections.created_at DESC
    `).all();

    const eventsResult = await env.DB.prepare(`
      SELECT
        events.id,
        events.collection_id,
        events.name,
        events.created_at,
        COUNT(images.id) AS photo_count
      FROM events
      LEFT JOIN images ON events.id = images.event_id
      GROUP BY events.id, events.collection_id, events.name, events.created_at
      ORDER BY events.created_at DESC
    `).all();

    const collections = collectionsResult.results || [];
    const events = eventsResult.results || [];

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "D1 collections and events read",
      collections,
      events,
      collectionCount: collections.length,
      eventCount: events.length,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "D1 collections and events read",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      500
    );
  }
}

async function handleDisplayImage(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Display photo read",
        error: "Use GET with a display photo key"
      },
      405
    );
  }

  if (!env.DISPLAY_BUCKET) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Display photo read",
        error: "R2 binding DISPLAY_BUCKET is missing"
      },
      500
    );
  }

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key || !key.startsWith("display/")) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo read",
          error: "Valid display photo key is required"
        },
        400
      );
    }

    const object = await env.DISPLAY_BUCKET.get(key);

    if (!object) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo read",
          error: "Display photo was not found",
          key
        },
        404
      );
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=60");

    return new Response(object.body, { headers });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Display photo read",
        error: error.message
      },
      500
    );
  }
}

async function handleUploadDisplay(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Display photo upload",
        error: "Use POST with one photo file"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Display photo upload",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  if (!env.DISPLAY_BUCKET) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Display photo upload",
        error: "R2 binding DISPLAY_BUCKET is missing"
      },
      500
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo upload",
          error: "No photo file was provided"
        },
        400
      );
    }

    const contentType = file.type || "application/octet-stream";

    if (!contentType.startsWith("image/")) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo upload",
          error: "Uploaded file must be an image"
        },
        400
      );
    }

    const checkedAt = new Date().toISOString();

    const collectionId = safeText(formData.get("collectionId"), "default-collection");
    const collectionName = safeText(formData.get("collectionName"), "Untitled Collection");
    const eventId = safeText(formData.get("eventId"), "default-event");
    const eventName = safeText(formData.get("eventName"), "Untitled Event");
    const watermarkText = safeText(formData.get("watermarkText"), "FOTODECK");
    const priceCents = centsFromPrice(formData.get("price"));

    const imageId = crypto.randomUUID();
    const originalName = safeFileName(file.name);
    const displayKey = `display/${collectionId}/${eventId}/${imageId}-${originalName}`;
    const fileBuffer = await file.arrayBuffer();

    await env.DISPLAY_BUCKET.put(displayKey, fileBuffer, {
      httpMetadata: {
        contentType
      }
    });

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        display_key TEXT NOT NULL,
        watermark_text TEXT,
        price_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      INSERT OR REPLACE INTO collections (id, name, created_at)
      VALUES (?, ?, ?)
    `).bind(collectionId, collectionName, checkedAt).run();

    await env.DB.prepare(`
      INSERT OR REPLACE INTO events (id, collection_id, name, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(eventId, collectionId, eventName, checkedAt).run();

    await env.DB.prepare(`
      INSERT INTO images (
        id,
        collection_id,
        event_id,
        file_name,
        display_key,
        watermark_text,
        price_cents,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      imageId,
      collectionId,
      eventId,
      file.name || originalName,
      displayKey,
      watermarkText,
      priceCents,
      checkedAt
    ).run();

    const image = await env.DB.prepare(`
      SELECT
        images.id,
        images.file_name,
        images.display_key,
        images.watermark_text,
        images.price_cents,
        images.event_id,
        events.name AS event_name,
        images.collection_id,
        collections.name AS collection_name,
        images.created_at
      FROM images
      JOIN events ON images.event_id = events.id
      JOIN collections ON images.collection_id = collections.id
      WHERE images.id = ?
    `).bind(imageId).first();

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Display photo upload",
      image,
      checkedAt
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Display photo upload",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      500
    );
  }
}

async function handleDeleteImage(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete single photo",
        error: "Use POST with an imageId"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete single photo",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  if (!env.DISPLAY_BUCKET) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete single photo",
        error: "R2 binding DISPLAY_BUCKET is missing"
      },
      500
    );
  }

  try {
    const body = await request.json();
    const imageId = body && body.imageId ? String(body.imageId).trim() : "";

    if (!imageId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete single photo",
          error: "imageId is required"
        },
        400
      );
    }

    const image = await env.DB.prepare(`
      SELECT
        id,
        file_name,
        display_key,
        collection_id,
        event_id
      FROM images
      WHERE id = ?
    `).bind(imageId).first();

    if (!image) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete single photo",
          error: "Photo was not found",
          imageId
        },
        404
      );
    }

    if (image.display_key) {
      await env.DISPLAY_BUCKET.delete(image.display_key);
    }

    await env.DB.prepare(`
      DELETE FROM images
      WHERE id = ?
    `).bind(imageId).run();

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Delete single photo",
      deleted: {
        id: image.id,
        file_name: image.file_name,
        display_key: image.display_key,
        collection_id: image.collection_id,
        event_id: image.event_id
      },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete single photo",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      500
    );
  }
}

async function handleDeleteEvent(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete event",
        error: "Use POST with collectionId, eventId, confirmText"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete event",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  if (!env.DISPLAY_BUCKET) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete event",
        error: "R2 binding DISPLAY_BUCKET is missing"
      },
      500
    );
  }

  try {
    const body = await request.json();

    const collectionId = body && body.collectionId ? String(body.collectionId).trim() : "";
    const eventId = body && body.eventId ? String(body.eventId).trim() : "";
    const confirmText = body && body.confirmText ? String(body.confirmText).trim() : "";

    if (!collectionId || !eventId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete event",
          error: "collectionId and eventId are required"
        },
        400
      );
    }

    if (confirmText !== "DELETE EVENT") {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete event",
          error: "confirmText must be DELETE EVENT"
        },
        400
      );
    }

    const event = await env.DB.prepare(`
      SELECT
        id,
        collection_id,
        name
      FROM events
      WHERE id = ?
      AND collection_id = ?
    `).bind(eventId, collectionId).first();

    if (!event) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete event",
          error: "Event was not found",
          collectionId,
          eventId
        },
        404
      );
    }

    const imagesResult = await env.DB.prepare(`
      SELECT
        id,
        file_name,
        display_key
      FROM images
      WHERE collection_id = ?
      AND event_id = ?
    `).bind(collectionId, eventId).all();

    const images = imagesResult.results || [];

    for (const image of images) {
      if (image.display_key) {
        await env.DISPLAY_BUCKET.delete(image.display_key);
      }
    }

    await env.DB.prepare(`
      DELETE FROM images
      WHERE collection_id = ?
      AND event_id = ?
    `).bind(collectionId, eventId).run();

    await env.DB.prepare(`
      DELETE FROM events
      WHERE collection_id = ?
      AND id = ?
    `).bind(collectionId, eventId).run();

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Delete event",
      deleted: {
        collection_id: collectionId,
        event_id: eventId,
        event_name: event.name,
        photo_count: images.length
      },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete event",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      500
    );
  }
}

async function handleUpdateEventPrice(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Update event price",
        error: "Use POST with collectionId, eventId, price"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Update event price",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  try {
    const body = await request.json();

    const collectionId = body && body.collectionId ? String(body.collectionId).trim() : "";
    const eventId = body && body.eventId ? String(body.eventId).trim() : "";
    const priceCents = centsFromPrice(body && body.price);

    if (!collectionId || !eventId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Update event price",
          error: "collectionId and eventId are required"
        },
        400
      );
    }

    const event = await env.DB.prepare(`
      SELECT
        id,
        collection_id,
        name
      FROM events
      WHERE id = ?
      AND collection_id = ?
    `).bind(eventId, collectionId).first();

    if (!event) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Update event price",
          error: "Event was not found",
          collectionId,
          eventId
        },
        404
      );
    }

    const result = await env.DB.prepare(`
      UPDATE images
      SET price_cents = ?
      WHERE collection_id = ?
      AND event_id = ?
    `).bind(priceCents, collectionId, eventId).run();

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Update event price",
      updated: {
        collection_id: collectionId,
        event_id: eventId,
        event_name: event.name,
        price_cents: priceCents,
        price: makeMoneyAmount(priceCents),
        changed_rows: result.meta && typeof result.meta.changes === "number" ? result.meta.changes : null
      },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Update event price",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      500
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/images") {
      return handleImages(request, env);
    }

    if (url.pathname === "/api/collections-events") {
      return handleCollectionsEvents(request, env);
    }

    if (url.pathname === "/api/display-image") {
      return handleDisplayImage(request, env);
    }

    if (url.pathname === "/api/upload-display") {
      return handleUploadDisplay(request, env);
    }

    if (url.pathname === "/api/delete-image") {
      return handleDeleteImage(request, env);
    }

    if (url.pathname === "/api/delete-event") {
      return handleDeleteEvent(request, env);
    }

    if (url.pathname === "/api/update-event-price") {
      return handleUpdateEventPrice(request, env);
    }

    if (url.pathname === "/api/stripe-create-checkout") {
      return handleStripeCreateCheckout(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        error: "Route not found"
      },
      404
    );
  }
};