export async function onRequest(context) {
  const { env } = context;

  if (!env.DISPLAY_BUCKET) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "R2 write proof",
        error: "R2 binding DISPLAY_BUCKET is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  try {
    const checkedAt = new Date().toISOString();
    const key = `proof/r2-write-proof-${Date.now()}.txt`;
    const body = `FotoDeck R2 write proof created at ${checkedAt}`;

    await env.DISPLAY_BUCKET.put(key, body, {
      httpMetadata: {
        contentType: "text/plain"
      }
    });

    const object = await env.DISPLAY_BUCKET.head(key);

    if (!object) {
      return Response.json(
        {
          ok: false,
          app: "FotoDeck",
          stack: "Cloudflare",
          service: "R2 write proof",
          error: "Object was not found after write",
          key,
          checkedAt
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      app: "FotoDeck",
      stack: "Cloudflare",
      service: "R2 write proof",
      key,
      size: object.size,
      uploaded: object.uploaded,
      contentType: object.httpMetadata?.contentType || null,
      checkedAt
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "R2 write proof",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
