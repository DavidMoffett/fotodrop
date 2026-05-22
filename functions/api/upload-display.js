function safeText(value, fallback) {
  const text = value ? String(value).trim() : "";
  return text || fallback;
}

function safeFileName(value) {
  return String(value || "image.jpg")
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

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "Display image upload",
        error: "D1 binding DB is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  if (!env.DISPLAY_BUCKET) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "Display image upload",
        error: "R2 binding DISPLAY_BUCKET is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json(
        {
          ok: false,
          app: "FotoDeck",
          stack: "Cloudflare",
          service: "Display image upload",
          error: "No image file was provided",
          checkedAt: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    const contentType = file.type || "application/octet-stream";

    if (!contentType.startsWith("image/")) {
      return Response.json(
        {
          ok: false,
          app: "FotoDeck",
          stack: "Cloudflare",
          service: "Display image upload",
          error: "Uploaded file must be an image",
          checkedAt: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    const checkedAt = new Date().toISOString();

    const collectionId = safeText(formData.get("collectionId"), "default-collection");
    const collectionName = safeText(formData.get("collectionName"), "Untitled Collection");
    const eventId = safeText(formData.get("eventId"), "default-event");
    const eventName = safeText(formData.get("eventName"), "Untitled Event");
    const watermarkText = safeText(formData.get("watermarkText"), "FotoDeck");
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
    `).bind(
      collectionId,
      collectionName,
      checkedAt
    ).run();

    await env.DB.prepare(`
      INSERT OR REPLACE INTO events (id, collection_id, name, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      eventId,
      collectionId,
      eventName,
      checkedAt
    ).run();

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

    return Response.json({
      ok: true,
      app: "FotoDeck",
      stack: "Cloudflare",
      service: "Display image upload",
      image,
      checkedAt
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "Display image upload",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "Display image upload",
        error: "Use POST with one image file",
        checkedAt: new Date().toISOString()
      },
      { status: 405 }
    );
  }

  return onRequestPost(context);
}
