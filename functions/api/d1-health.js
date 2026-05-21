export async function onRequest(context) {
  const result = await context.env.DB.prepare(
    "SELECT 'FotoDeck D1 is alive' AS message"
  ).first()

  return Response.json({
    ok: true,
    app: 'FotoDeck',
    stack: 'Cloudflare',
    service: 'D1',
    message: result.message,
    checkedAt: new Date().toISOString(),
  })
}
