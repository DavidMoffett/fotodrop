export async function onRequest(context) {
  const { env } = context;

  if (!env.DISPLAY_BUCKET) {
    return Response.json(
      {
        ok: false,
        app: "FotoDeck",
        stack: "Cloudflare",
        service: "R2 display bucket",
        error: "R2 binding DISPLAY_BUCKET is missing",
        checkedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    app: "FotoDeck",
    stack: "Cloudflare",
    service: "R2 display bucket",
    binding: "DISPLAY_BUCKET",
    checkedAt: new Date().toISOString()
  });
}
