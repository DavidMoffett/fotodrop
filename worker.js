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

function makeDownloadFileName(fileName) {
  const cleanName = safeFileName(fileName || "fotodeck-photo.jpg");

  if (cleanName.includes(".")) {
    return cleanName;
  }

  return `${cleanName}.jpg`;
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function makePaidDownloadPageUrl(request, order) {
  const origin = getRequestOrigin(request);
  const collectionId = encodeURIComponent(order.collection_id);
  const eventId = encodeURIComponent(order.event_id);
  const sessionId = encodeURIComponent(order.stripe_session_id);

  return `${origin}/view?collectionId=${collectionId}&eventId=${eventId}&stripe=success&session_id=${sessionId}`;
}

function makeStripeWebhookPayload(timestamp, rawBody) {
  return `${timestamp}.${rawBody}`;
}

function parseStripeSignatureHeader(signatureHeader) {
  const parts = String(signatureHeader || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed = {
    timestamp: "",
    signatures: []
  };

  for (const part of parts) {
    const equalIndex = part.indexOf("=");

    if (equalIndex === -1) {
      continue;
    }

    const key = part.slice(0, equalIndex);
    const value = part.slice(equalIndex + 1);

    if (key === "t") {
      parsed.timestamp = value;
    }

    if (key === "v1") {
      parsed.signatures.push(value);
    }
  }

  return parsed;
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");

  if (leftText.length !== rightText.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < leftText.length; index += 1) {
    result |= leftText.charCodeAt(index) ^ rightText.charCodeAt(index);
  }

  return result === 0;
}

async function makeStripeWebhookSignature(secret, payload) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  return bytesToHex(signature);
}

async function verifyStripeWebhookSignature(request, rawBody, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  }

  const signatureHeader = request.headers.get("stripe-signature") || "";
  const parsedSignature = parseStripeSignatureHeader(signatureHeader);

  if (!parsedSignature.timestamp || parsedSignature.signatures.length === 0) {
    throw new Error("Stripe webhook signature header is invalid");
  }

  const timestampNumber = Number(parsedSignature.timestamp);

  if (!Number.isFinite(timestampNumber)) {
    throw new Error("Stripe webhook timestamp is invalid");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = Math.abs(nowSeconds - timestampNumber);

  if (ageSeconds > 300) {
    throw new Error("Stripe webhook timestamp is too old");
  }

  const payload = makeStripeWebhookPayload(parsedSignature.timestamp, rawBody);
  const expectedSignature = await makeStripeWebhookSignature(env.STRIPE_WEBHOOK_SECRET, payload);

  const isValid = parsedSignature.signatures.some((signature) => (
    timingSafeEqualHex(signature, expectedSignature)
  ));

  if (!isValid) {
    throw new Error("Stripe webhook signature verification failed");
  }
}

async function ensureColumn(env, tableName, columnName, columnDefinition) {
  try {
    await env.DB.prepare(`
      ALTER TABLE ${tableName}
      ADD COLUMN ${columnName} ${columnDefinition}
    `).run();
  } catch (error) {
    const message = String(error && error.message ? error.message : "");

    if (
      message.includes("duplicate column name") ||
      message.includes("already exists")
    ) {
      return;
    }

    throw error;
  }
}

async function ensureCoreTables(env) {
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

  await ensureColumn(env, "images", "delivery_key", "TEXT");
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

  await ensureColumn(env, "stripe_order_items", "delivery_key", "TEXT");
  await ensureColumn(env, "stripe_orders", "download_email_sent_at", "TEXT");
  await ensureColumn(env, "stripe_orders", "download_email_resend_id", "TEXT");
  await ensureColumn(env, "stripe_orders", "download_email_error", "TEXT");
}

async function getStripeSession(env, sessionId) {
  const stripeResponse = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`
      }
    }
  );

  const stripeSession = await stripeResponse.json();

  if (!stripeResponse.ok || !stripeSession || !stripeSession.id) {
    const message = stripeSession && stripeSession.error && stripeSession.error.message
      ? stripeSession.error.message
      : "Stripe session could not be verified";

    throw new Error(message);
  }

  return stripeSession;
}

async function getPaidOrderFromSession(env, sessionId) {
  await ensureStripeTables(env);

  const stripeSession = await getStripeSession(env, sessionId);

  if (stripeSession.payment_status !== "paid") {
    const error = new Error("Stripe session is not paid");
    error.status = 402;
    throw error;
  }

  const order = await env.DB.prepare(`
    SELECT
      id,
      stripe_session_id,
      collection_id,
      event_id,
      buyer_email,
      amount_cents,
      currency,
      status,
      created_at,
      download_email_sent_at,
      download_email_resend_id,
      download_email_error
    FROM stripe_orders
    WHERE stripe_session_id = ?
  `).bind(sessionId).first();

  if (!order) {
    const error = new Error("Paid order was not found in FOTODECK");
    error.status = 404;
    throw error;
  }

  if (order.status !== "PAID") {
    await env.DB.prepare(`
      UPDATE stripe_orders
      SET status = ?
      WHERE id = ?
    `).bind("PAID", order.id).run();

    order.status = "PAID";
  }

  return {
    order,
    stripeSession
  };
}

async function getStripeOrderBySessionId(env, sessionId) {
  await ensureStripeTables(env);

  const order = await env.DB.prepare(`
    SELECT
      id,
      stripe_session_id,
      collection_id,
      event_id,
      buyer_email,
      amount_cents,
      currency,
      status,
      created_at,
      download_email_sent_at,
      download_email_resend_id,
      download_email_error
    FROM stripe_orders
    WHERE stripe_session_id = ?
  `).bind(sessionId).first();

  if (!order) {
    return null;
  }

  return order;
}

async function getStripeOrderItems(env, orderId) {
  await ensureStripeTables(env);

  const itemsResult = await env.DB.prepare(`
    SELECT
      id,
      order_id,
      image_id,
      file_name,
      display_key,
      delivery_key,
      price_cents,
      created_at
    FROM stripe_order_items
    WHERE order_id = ?
    ORDER BY created_at ASC
  `).bind(orderId).all();

  return itemsResult.results || [];
}

async function sendPaidDownloadEmail(request, env, order, items) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing");
  }

  if (!order || !order.buyer_email) {
    throw new Error("Buyer email is missing");
  }

  const checkedAt = new Date().toISOString();
  const downloadPageUrl = makePaidDownloadPageUrl(request, order);
  const photoCount = items.length;
  const subject = photoCount === 1
    ? "Your FOTODECK image download"
    : "Your FOTODECK image downloads";

  const safeBuyerEmail = htmlEscape(order.buyer_email);
  const safeDownloadPageUrl = htmlEscape(downloadPageUrl);
  const safeAmount = htmlEscape(`${order.currency || "NZD"} ${makeMoneyAmount(order.amount_cents)}`);

  const imageRows = items.map((item) => {
    const safeName = htmlEscape(item.file_name || "FOTODECK image");

    return `<li>${safeName}</li>`;
  }).join("");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Your FOTODECK images are ready</h2>
      <p>Thank you for your payment.</p>
      <p>
        <a href="${safeDownloadPageUrl}" style="display: inline-block; padding: 12px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
          Download your images
        </a>
      </p>
      <p>If the button does not open, copy and paste this link into your browser:</p>
      <p><a href="${safeDownloadPageUrl}">${safeDownloadPageUrl}</a></p>
      <p><strong>Order:</strong> ${htmlEscape(order.stripe_session_id)}</p>
      <p><strong>Email:</strong> ${safeBuyerEmail}</p>
      <p><strong>Total:</strong> ${safeAmount}</p>
      <p><strong>Images:</strong> ${photoCount}</p>
      <ul>${imageRows}</ul>
      <p style="font-size: 12px; color: #6b7280;">This email was sent by FOTODECK.</p>
    </div>
  `;

  const text = [
    "Your FOTODECK images are ready.",
    "",
    "Download your images here:",
    downloadPageUrl,
    "",
    `Order: ${order.stripe_session_id}`,
    `Email: ${order.buyer_email}`,
    `Total: ${order.currency || "NZD"} ${makeMoneyAmount(order.amount_cents)}`,
    `Images: ${photoCount}`,
    "",
    ...items.map((item) => `- ${item.file_name || "FOTODECK image"}`)
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "FOTODECK <downloads@fotodeck.app>",
      to: [order.buyer_email],
      subject,
      html,
      text
    })
  });

  const result = await response.json();

  if (!response.ok) {
    const message = result && result.message
      ? result.message
      : "Resend email failed";

    await env.DB.prepare(`
      UPDATE stripe_orders
      SET download_email_error = ?
      WHERE id = ?
    `).bind(message, order.id).run();

    throw new Error(message);
  }

  await env.DB.prepare(`
    UPDATE stripe_orders
    SET download_email_sent_at = ?,
        download_email_resend_id = ?,
        download_email_error = NULL
    WHERE id = ?
  `).bind(
    checkedAt,
    result.id || "",
    order.id
  ).run();

  return {
    sent: true,
    resend_id: result.id || null,
    sent_at: checkedAt,
    download_page_url: downloadPageUrl
  };
}

async function sendPaidDownloadEmailForSession(request, env, sessionId) {
  await ensureStripeTables(env);

  const order = await getStripeOrderBySessionId(env, sessionId);

  if (!order) {
    return {
      sent: false,
      skipped: true,
      reason: "Order was not found for Stripe session",
      stripe_session_id: sessionId
    };
  }

  if (order.download_email_sent_at) {
    return {
      sent: false,
      skipped: true,
      reason: "Download email was already sent",
      stripe_session_id: sessionId,
      sent_at: order.download_email_sent_at,
      resend_id: order.download_email_resend_id || null
    };
  }

  if (order.status !== "PAID") {
    await env.DB.prepare(`
      UPDATE stripe_orders
      SET status = ?
      WHERE id = ?
    `).bind("PAID", order.id).run();

    order.status = "PAID";
  }

  const items = await getStripeOrderItems(env, order.id);

  if (items.length === 0) {
    throw new Error("Paid order has no image items");
  }

  return sendPaidDownloadEmail(request, env, order, items);
}

async function getCartImagesFromDb(env, collectionId, eventId, imageIds) {
  await ensureCoreTables(env);

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
      images.delivery_key,
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
          delivery_key,
          price_cents,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        localOrderId,
        image.id,
        image.file_name,
        image.display_key,
        image.delivery_key || image.display_key,
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

async function handlePurchasedImages(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Purchased images",
        error: "Use GET with sessionId"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Purchased images",
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
        service: "Purchased images",
        error: "Stripe secret key is missing"
      },
      500
    );
  }

  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Purchased images",
          error: "sessionId is required"
        },
        400
      );
    }

    await ensureStripeTables(env);

    const paidOrder = await getPaidOrderFromSession(env, sessionId);
    const order = paidOrder.order;

    const items = await getStripeOrderItems(env, order.id);

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Purchased images",
      order: {
        id: order.id,
        stripe_session_id: order.stripe_session_id,
        collection_id: order.collection_id,
        event_id: order.event_id,
        buyer_email: order.buyer_email,
        amount_cents: order.amount_cents,
        amount: makeMoneyAmount(order.amount_cents),
        currency: order.currency,
        status: "PAID",
        photo_count: items.length,
        created_at: order.created_at
      },
      images: items.map((item) => ({
        image_id: item.image_id,
        file_name: item.file_name,
        price_cents: item.price_cents,
        price: makeMoneyAmount(item.price_cents),
        download_url: `/api/download-purchased-image?sessionId=${encodeURIComponent(sessionId)}&imageId=${encodeURIComponent(item.image_id)}`
      })),
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Purchased images",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      error.status || 500
    );
  }
}

async function handleDownloadPurchasedImage(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Download purchased image",
        error: "Use GET with sessionId and imageId"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Download purchased image",
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
        service: "Download purchased image",
        error: "R2 binding DISPLAY_BUCKET is missing"
      },
      500
    );
  }

  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Download purchased image",
        error: "Stripe secret key is missing"
      },
      500
    );
  }

  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const imageId = url.searchParams.get("imageId");

    if (!sessionId || !imageId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Download purchased image",
          error: "sessionId and imageId are required"
        },
        400
      );
    }

    await ensureStripeTables(env);

    const paidOrder = await getPaidOrderFromSession(env, sessionId);
    const order = paidOrder.order;

    const item = await env.DB.prepare(`
      SELECT
        id,
        order_id,
        image_id,
        file_name,
        display_key,
        delivery_key,
        price_cents,
        created_at
      FROM stripe_order_items
      WHERE order_id = ?
      AND image_id = ?
    `).bind(order.id, imageId).first();

    if (!item) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Download purchased image",
          error: "Purchased image was not found for this paid order"
        },
        404
      );
    }

    const deliveryKey = item.delivery_key || item.display_key;
    const object = await env.DISPLAY_BUCKET.get(deliveryKey);

    if (!object) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Download purchased image",
          error: "Purchased image file was not found"
        },
        404
      );
    }

    const headers = new Headers();

    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=60");
    headers.set("content-disposition", `attachment; filename="${makeDownloadFileName(item.file_name)}"`);

    return new Response(object.body, { headers });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Download purchased image",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      error.status || 500
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
    await ensureCoreTables(env);

    const url = new URL(request.url);
    const collectionId = url.searchParams.get("collectionId");
    const eventId = url.searchParams.get("eventId");

    let query = `
      SELECT
        images.id,
        images.file_name,
        images.display_key,
        images.delivery_key,
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
    await ensureCoreTables(env);

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

async function handleUpdateCollection(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Update collection",
        error: "Use POST with collectionId, collectionName, price, watermarkText"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Update collection",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  try {
    await ensureCoreTables(env);

    const body = await request.json();

    const collectionId = body && body.collectionId ? String(body.collectionId).trim() : "";
    const collectionName = body && body.collectionName ? String(body.collectionName).trim() : "";
    const priceCents = centsFromPrice(body && body.price);
    const watermarkText = safeText(body && body.watermarkText, "FOTODECK");

    if (!collectionId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Update collection",
          error: "collectionId is required"
        },
        400
      );
    }

    if (!collectionName) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Update collection",
          error: "collectionName is required"
        },
        400
      );
    }

    const collection = await env.DB.prepare(`
      SELECT
        id,
        name,
        created_at
      FROM collections
      WHERE id = ?
    `).bind(collectionId).first();

    if (!collection) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Update collection",
          error: "Collection was not found",
          collectionId
        },
        404
      );
    }

    await env.DB.prepare(`
      UPDATE collections
      SET name = ?
      WHERE id = ?
    `).bind(collectionName, collectionId).run();

    const imagesResult = await env.DB.prepare(`
      UPDATE images
      SET price_cents = ?,
          watermark_text = ?
      WHERE collection_id = ?
    `).bind(priceCents, watermarkText, collectionId).run();

    const changedRows = imagesResult.meta && typeof imagesResult.meta.changes === "number"
      ? imagesResult.meta.changes
      : null;

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Update collection",
      updated: {
        collection_id: collectionId,
        previous_collection_name: collection.name,
        collection_name: collectionName,
        price_cents: priceCents,
        price: makeMoneyAmount(priceCents),
        watermark_text: watermarkText,
        changed_photo_rows: changedRows
      },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Update collection",
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
        error: "Use POST with photo files"
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
    await ensureCoreTables(env);

    const formData = await request.formData();
    const displayFile = formData.get("displayFile") || formData.get("file");
    const deliveryFile = formData.get("deliveryFile") || displayFile;

    if (!displayFile || typeof displayFile.arrayBuffer !== "function") {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo upload",
          error: "No display photo file was provided"
        },
        400
      );
    }

    if (!deliveryFile || typeof deliveryFile.arrayBuffer !== "function") {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo upload",
          error: "No delivery photo file was provided"
        },
        400
      );
    }

    const displayContentType = displayFile.type || "application/octet-stream";
    const deliveryContentType = deliveryFile.type || displayContentType || "application/octet-stream";

    if (!displayContentType.startsWith("image/")) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo upload",
          error: "Display file must be an image"
        },
        400
      );
    }

    if (!deliveryContentType.startsWith("image/")) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Display photo upload",
          error: "Delivery file must be an image"
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
    const originalName = safeFileName(deliveryFile.name || displayFile.name);
    const displayName = safeFileName(displayFile.name || originalName);
    const displayKey = `display/${collectionId}/${eventId}/${imageId}-${displayName}`;
    const deliveryKey = `delivery/${collectionId}/${eventId}/${imageId}-${originalName}`;

    const displayBuffer = await displayFile.arrayBuffer();

    await env.DISPLAY_BUCKET.put(displayKey, displayBuffer, {
      httpMetadata: {
        contentType: displayContentType
      }
    });

    if (deliveryFile === displayFile) {
      await env.DISPLAY_BUCKET.put(deliveryKey, displayBuffer, {
        httpMetadata: {
          contentType: deliveryContentType
        }
      });
    } else {
      const deliveryBuffer = await deliveryFile.arrayBuffer();

      await env.DISPLAY_BUCKET.put(deliveryKey, deliveryBuffer, {
        httpMetadata: {
          contentType: deliveryContentType
        }
      });
    }

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
        delivery_key,
        watermark_text,
        price_cents,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      imageId,
      collectionId,
      eventId,
      deliveryFile.name || displayFile.name || originalName,
      displayKey,
      deliveryKey,
      watermarkText,
      priceCents,
      checkedAt
    ).run();

    const image = await env.DB.prepare(`
      SELECT
        images.id,
        images.file_name,
        images.display_key,
        images.delivery_key,
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
    await ensureCoreTables(env);

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
        delivery_key,
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

    if (image.delivery_key && image.delivery_key !== image.display_key) {
      await env.DISPLAY_BUCKET.delete(image.delivery_key);
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
        delivery_key: image.delivery_key,
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
    await ensureCoreTables(env);

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
        display_key,
        delivery_key
      FROM images
      WHERE collection_id = ?
      AND event_id = ?
    `).bind(collectionId, eventId).all();

    const images = imagesResult.results || [];

    for (const image of images) {
      if (image.display_key) {
        await env.DISPLAY_BUCKET.delete(image.display_key);
      }

      if (image.delivery_key && image.delivery_key !== image.display_key) {
        await env.DISPLAY_BUCKET.delete(image.delivery_key);
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

async function handleDeleteCollection(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete collection",
        error: "Use POST with collectionId and confirmText"
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete collection",
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
        service: "Delete collection",
        error: "R2 binding DISPLAY_BUCKET is missing"
      },
      500
    );
  }

  try {
    await ensureCoreTables(env);

    const body = await request.json();

    const collectionId = body && body.collectionId ? String(body.collectionId).trim() : "";
    const confirmText = body && body.confirmText ? String(body.confirmText).trim() : "";

    if (!collectionId) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete collection",
          error: "collectionId is required"
        },
        400
      );
    }

    if (confirmText !== "DELETE COLLECTION") {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete collection",
          error: "confirmText must be DELETE COLLECTION"
        },
        400
      );
    }

    const collection = await env.DB.prepare(`
      SELECT
        id,
        name
      FROM collections
      WHERE id = ?
    `).bind(collectionId).first();

    if (!collection) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Delete collection",
          error: "Collection was not found",
          collectionId
        },
        404
      );
    }

    const imagesResult = await env.DB.prepare(`
      SELECT
        id,
        file_name,
        display_key,
        delivery_key,
        event_id
      FROM images
      WHERE collection_id = ?
    `).bind(collectionId).all();

    const eventsResult = await env.DB.prepare(`
      SELECT
        id,
        name
      FROM events
      WHERE collection_id = ?
    `).bind(collectionId).all();

    const images = imagesResult.results || [];
    const events = eventsResult.results || [];

    let deletedFileCount = 0;
    let missingFileCount = 0;

    for (const image of images) {
      const keysToDelete = Array.from(new Set(
        [image.display_key, image.delivery_key]
          .map((key) => String(key || "").trim())
          .filter(Boolean)
      ));

      for (const key of keysToDelete) {
        const object = await env.DISPLAY_BUCKET.get(key);

        if (object) {
          await env.DISPLAY_BUCKET.delete(key);
          deletedFileCount += 1;
        } else {
          missingFileCount += 1;
        }
      }
    }

    await env.DB.prepare(`
      DELETE FROM images
      WHERE collection_id = ?
    `).bind(collectionId).run();

    await env.DB.prepare(`
      DELETE FROM events
      WHERE collection_id = ?
    `).bind(collectionId).run();

    await env.DB.prepare(`
      DELETE FROM collections
      WHERE id = ?
    `).bind(collectionId).run();

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Delete collection",
      deleted: {
        collection_id: collectionId,
        collection_name: collection.name,
        event_count: events.length,
        photo_count: images.length,
        r2_files_deleted: deletedFileCount,
        r2_files_missing: missingFileCount
      },
      note: "Stripe order history was not deleted.",
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Delete collection",
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
    await ensureCoreTables(env);

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


async function handleAdminStats(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Admin stats",
        error: "Use GET."
      },
      405
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Admin stats",
        error: "D1 database binding DB is not available."
      },
      500
    );
  }

  await ensureStripeTables(env);

  const orderTotals = await env.DB.prepare(`
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(amount_cents), 0) AS revenue_cents
    FROM stripe_orders
    WHERE status = 'paid'
  `).first();

  const imageTotals = await env.DB.prepare(`
    SELECT
      COUNT(*) AS image_count,
      COALESCE(SUM(price_cents), 0) AS image_revenue_cents
    FROM stripe_order_items
    WHERE order_id IN (
      SELECT id
      FROM stripe_orders
      WHERE status = 'paid'
    )
  `).first();

  const byEventResult = await env.DB.prepare(`
    SELECT
      o.collection_id,
      o.event_id,
      COUNT(DISTINCT o.id) AS order_count,
      COUNT(i.id) AS image_count,
      COALESCE(SUM(i.price_cents), 0) AS revenue_cents
    FROM stripe_orders o
    LEFT JOIN stripe_order_items i ON i.order_id = o.id
    WHERE o.status = 'paid'
    GROUP BY o.collection_id, o.event_id
    ORDER BY revenue_cents DESC, order_count DESC, o.created_at DESC
  `).all();

  const recentOrdersResult = await env.DB.prepare(`
    SELECT
      id,
      stripe_session_id,
      collection_id,
      event_id,
      buyer_email,
      amount_cents,
      currency,
      status,
      created_at,
      download_email_sent_at
    FROM stripe_orders
    WHERE status = 'paid'
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  const byEvent = (byEventResult.results || []).map((row) => ({
    collection_id: row.collection_id || "",
    event_id: row.event_id || "",
    order_count: Number(row.order_count || 0),
    image_count: Number(row.image_count || 0),
    revenue_cents: Number(row.revenue_cents || 0),
    revenue: makeMoneyAmount(row.revenue_cents || 0)
  }));

  const recentOrders = (recentOrdersResult.results || []).map((row) => ({
    id: row.id || "",
    stripe_session_id: row.stripe_session_id || "",
    collection_id: row.collection_id || "",
    event_id: row.event_id || "",
    buyer_email: row.buyer_email || "",
    amount_cents: Number(row.amount_cents || 0),
    amount: makeMoneyAmount(row.amount_cents || 0),
    currency: row.currency || "NZD",
    status: row.status || "",
    created_at: row.created_at || "",
    download_email_sent_at: row.download_email_sent_at || ""
  }));

  return jsonResponse({
    ok: true,
    app: "FOTODECK",
    service: "Admin stats",
    totals: {
      order_count: Number(orderTotals?.order_count || 0),
      revenue_cents: Number(orderTotals?.revenue_cents || 0),
      revenue: makeMoneyAmount(orderTotals?.revenue_cents || 0),
      image_count: Number(imageTotals?.image_count || 0),
      image_revenue_cents: Number(imageTotals?.image_revenue_cents || 0),
      image_revenue: makeMoneyAmount(imageTotals?.image_revenue_cents || 0)
    },
    by_event: byEvent,
    recent_orders: recentOrders
  });
}
async function handleStripeWebhook(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Stripe webhook",
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
        service: "Stripe webhook",
        error: "D1 binding DB is missing"
      },
      500
    );
  }

  try {
    const rawBody = await request.text();

    await verifyStripeWebhookSignature(request, rawBody, env);

    const event = JSON.parse(rawBody);

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return jsonResponse({
        ok: true,
        app: "FOTODECK",
        service: "Stripe webhook",
        ignored: true,
        event_type: event.type || null
      });
    }

    const session = event && event.data && event.data.object
      ? event.data.object
      : null;

    if (!session || !session.id) {
      return jsonResponse(
        {
          ok: false,
          app: "FOTODECK",
          service: "Stripe webhook",
          error: "Stripe checkout session was missing"
        },
        400
      );
    }

    if (session.payment_status !== "paid") {
      return jsonResponse({
        ok: true,
        app: "FOTODECK",
        service: "Stripe webhook",
        ignored: true,
        reason: "Session is not paid",
        stripe_session_id: session.id,
        payment_status: session.payment_status || null
      });
    }

    const emailResult = await sendPaidDownloadEmailForSession(request, env, session.id);

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "Stripe webhook",
      event_type: event.type,
      stripe_session_id: session.id,
      email: emailResult,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        app: "FOTODECK",
        service: "Stripe webhook",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      400
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

    if (url.pathname === "/api/update-collection") {
      return handleUpdateCollection(request, env);
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

    if (url.pathname === "/api/delete-collection") {
      return handleDeleteCollection(request, env);
    }

    if (url.pathname === "/api/update-event-price") {
      return handleUpdateEventPrice(request, env);
    }

    if (url.pathname === "/api/admin-stats") {
      return handleAdminStats(request, env);
    }
    if (url.pathname === "/api/stripe-create-checkout") {
      return handleStripeCreateCheckout(request, env);
    }

    if (url.pathname === "/api/purchased-images") {
      return handlePurchasedImages(request, env);
    }

    if (url.pathname === "/api/download-purchased-image") {
      return handleDownloadPurchasedImage(request, env);
    }


    if (url.pathname === "/api/stripe-webhook") {
      return handleStripeWebhook(request, env);
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