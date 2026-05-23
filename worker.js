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
    const result = await env.DB.prepare(`
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
      ORDER BY images.created_at DESC
    `).all();

    return jsonResponse({
      ok: true,
      app: "FOTODECK",
      service: "D1 images read",
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/images") {
      return handleImages(request, env);
    }

    if (url.pathname === "/api/display-image") {
      return handleDisplayImage(request, env);
    }

    if (url.pathname === "/api/upload-display") {
      return handleUploadDisplay(request, env);
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
