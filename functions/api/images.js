export async function onRequest(context) {
  const { env } = context;

  if (!env.DB) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "D1 images read",
        error: "D1 binding DB is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
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

    return Response.json({
      ok: true,
      app: "FotoDeck",
      stack: "Cloudflare",
      service: "D1 images read",
      images: result.results || [],
      count: result.results ? result.results.length : 0,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "D1 images read",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
