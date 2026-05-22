export async function onRequest(context) {
  const { env } = context;

  if (!env.DISPLAY_BUCKET) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "R2 image proof",
        error: "R2 binding DISPLAY_BUCKET is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  try {
    const checkedAt = new Date().toISOString();
    const key = `display/proof/r2-image-proof-${Date.now()}.jpg`;

    const imageBytes = Uint8Array.from([
      255, 216,
      255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 72, 0, 72, 0, 0,
      255, 219, 0, 67, 0,
      255, 217
    ]);

    await env.DISPLAY_BUCKET.put(key, imageBytes, {
      httpMetadata: {
        contentType: "image/jpeg"
      }
    });

    const object = await env.DISPLAY_BUCKET.head(key);

    if (!object) {
      return Response.json(
        {
          ok: false,
          app: "FotoDeck",
          stack: "Cloudflare",
          service: "R2 image proof",
          error: "Image object was not found after write",
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
      service: "R2 image proof",
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
        service: "R2 image proof",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
