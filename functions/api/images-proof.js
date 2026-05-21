export async function onRequest(context) {
  const { env } = context;

  if (!env.DB) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "D1 images",
        error: "D1 binding DB is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
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

    const checkedAt = new Date().toISOString();

    await env.DB.prepare(`
      INSERT OR REPLACE INTO collections (id, name, created_at)
      VALUES (?, ?, ?)
    `).bind(
      "demo-collection-001",
      "Brackenfield",
      checkedAt
    ).run();

    await env.DB.prepare(`
      INSERT OR REPLACE INTO events (id, collection_id, name, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      "demo-event-001",
      "demo-collection-001",
      "Champagne Breakfast",
      checkedAt
    ).run();

    await env.DB.prepare(`
      INSERT OR REPLACE INTO images (
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
      "demo-image-001",
      "demo-collection-001",
      "demo-event-001",
      "champagne-breakfast-001.jpg",
      "display/demo-collection-001/demo-event-001/champagne-breakfast-001.jpg",
      "FotoDeck",
      700,
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
    `).bind("demo-image-001").first();

    return Response.json({
      ok: true,
      app: "FotoDeck",
      stack: "Cloudflare",
      service: "D1 images",
      image,
      checkedAt
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "D1 images",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
