export async function onRequest(context) {
  await context.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run()

  await context.env.DB.prepare(
    `INSERT OR IGNORE INTO collections (id, name, created_at)
     VALUES (?, ?, ?)`
  ).bind(
    'demo-collection-001',
    'Brackenfield',
    new Date().toISOString()
  ).run()

  const collection = await context.env.DB.prepare(
    `SELECT id, name, created_at
     FROM collections
     WHERE id = ?`
  ).bind('demo-collection-001').first()

  return Response.json({
    ok: true,
    app: 'FotoDeck',
    stack: 'Cloudflare',
    service: 'D1 collections',
    collection,
    checkedAt: new Date().toISOString(),
  })
}
