export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DISPLAY_BUCKET) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "Display image read",
        error: "R2 binding DISPLAY_BUCKET is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key || !key.startsWith("display/")) {
      return Response.json(
        {
          ok: false,
          app: "FotoDeck",
          stack: "Cloudflare",
          service: "Display image read",
          error: "Valid display image key is required",
          checkedAt: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    const object = await env.DISPLAY_BUCKET.get(key);

    if (!object) {
      return Response.json(
        {
          ok: false,
          app: "FotoDeck",
          stack: "Cloudflare",
          service: "Display image read",
          error: "Display image was not found",
          key,
          checkedAt: new Date().toISOString()
        },
        { status: 404 }
      );
    }

    const headers = new Headers();

    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=60");

    return new Response(object.body, {
      headers
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "Display image read",
        error: error.message,
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "Display image read",
        error: "Use GET with a display image key",
        checkedAt: new Date().toISOString()
      },
      { status: 405 }
    );
  }

  return onRequestGet(context);
}
