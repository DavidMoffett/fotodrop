export async function onRequest() {
  return Response.json({
    ok: true,
    app: 'FotoDeck',
    stack: 'Cloudflare',
    service: 'Pages Function',
    message: 'FotoDeck Cloudflare health check is alive',
    checkedAt: new Date().toISOString(),
  })
}
