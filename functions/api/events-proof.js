export async function onRequest(context) {
  await context.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run()

  await context.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
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

  await context.env.DB.prepare(
    `INSERT OR IGNORE INTO events (id, collection_id, name, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(
    'demo-event-001',
    'demo-collection-001',
    'Champagne Breakfast',
    new Date().toISOString()
  ).run()

  const event = await context.env.DB.prepare(
    `SELECT events.id, events.name, events.collection_id, collections.name AS collection_name, events.created_at
     FROM events
     JOIN collections ON collections.id = events.collection_id
     WHERE events.id = ?`
  ).bind('demo-event-001').first()

  return Response.json({
    ok: true,
    app: 'FotoDeck',
    stack: 'Cloudflare',
    service: 'D1 events',
    event,
    checkedAt: new Date().toISOString(),
  })
}
