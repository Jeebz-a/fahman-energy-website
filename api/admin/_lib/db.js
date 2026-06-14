// Postgres wrapper for the admin inbox.
// Uses @neondatabase/serverless (HTTP transport, ideal for Vercel functions).
// Schema is created lazily via CREATE TABLE IF NOT EXISTS on first use,
// cached per cold-instance so we only do the round-trip once.

import { neon } from '@neondatabase/serverless';

let _sql = null;
let _schemaReady = null;

function connectionString() {
  // Neon's Vercel integration injects DATABASE_URL (pooled) by default,
  // sometimes also POSTGRES_URL or POSTGRES_PRISMA_URL aliases. Prefer pooled.
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ''
  );
}

export function getSql() {
  if (_sql) return _sql;
  const url = connectionString();
  if (!url) throw new Error('No Postgres connection string set (DATABASE_URL).');
  _sql = neon(url);
  return _sql;
}

export async function ensureSchema() {
  if (_schemaReady) return _schemaReady;
  _schemaReady = (async () => {
    const sql = getSql();

    await sql`CREATE TABLE IF NOT EXISTS messages (
      id          BIGSERIAL PRIMARY KEY,
      name        TEXT        NOT NULL,
      org         TEXT,
      email       TEXT        NOT NULL,
      phone       TEXT,
      role        TEXT,
      message     TEXT        NOT NULL,
      status      TEXT        NOT NULL DEFAULT 'unread',
      source      TEXT        NOT NULL DEFAULT 'contact',
      ip          INET,
      user_agent  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS messages_status_created_idx
              ON messages (status, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS messages_created_idx
              ON messages (created_at DESC)`;

    await sql`CREATE TABLE IF NOT EXISTS replies (
      id          BIGSERIAL PRIMARY KEY,
      message_id  BIGINT      NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      body        TEXT        NOT NULL,
      sent_by     TEXT        NOT NULL,
      resend_id   TEXT,
      sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS replies_message_idx
              ON replies (message_id, sent_at DESC)`;

    await sql`CREATE TABLE IF NOT EXISTS gas_alerts (
      id           BIGSERIAL PRIMARY KEY,
      name         TEXT,
      email        TEXT        NOT NULL,
      cylinder_kg  NUMERIC,
      daily_kg     NUMERIC,
      days_left    INTEGER,
      run_out      DATE        NOT NULL,
      remind_on    DATE        NOT NULL,
      status       TEXT        NOT NULL DEFAULT 'active',
      reminded_at  TIMESTAMPTZ,
      ip           INET,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS gas_alerts_due_idx
              ON gas_alerts (remind_on, status)`;

    return true;
  })().catch((err) => {
    // Reset so a future request retries the schema setup.
    _schemaReady = null;
    throw err;
  });
  return _schemaReady;
}

/** Insert a refill-reminder signup. remindOn defaults to runOut minus 3 days. */
export async function insertGasAlert({
  name = null, email, cylinderKg = null, dailyKg = null, daysLeft = null,
  runOut, remindOn, ip = null,
}) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO gas_alerts (name, email, cylinder_kg, daily_kg, days_left, run_out, remind_on, ip)
    VALUES (${name}, ${email}, ${cylinderKg}, ${dailyKg}, ${daysLeft}, ${runOut}, ${remindOn}, ${ip})
    RETURNING id, remind_on, run_out
  `;
  return rows[0];
}

/** List reminder subscribers (most recent first) for the admin view. */
export async function listGasAlerts({ status = null, limit = 500 } = {}) {
  await ensureSchema();
  const sql = getSql();
  const lim = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  if (status && status !== 'all') {
    return sql`
      SELECT id, name, email, cylinder_kg, daily_kg, days_left, run_out, remind_on, status, reminded_at, created_at
      FROM gas_alerts WHERE status = ${status}
      ORDER BY created_at DESC LIMIT ${lim}`;
  }
  return sql`
    SELECT id, name, email, cylinder_kg, daily_kg, days_left, run_out, remind_on, status, reminded_at, created_at
    FROM gas_alerts
    ORDER BY created_at DESC LIMIT ${lim}`;
}

/** Summary counts for the reminders dashboard. */
export async function gasAlertStats() {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'reminded')::int AS reminded,
      COUNT(DISTINCT email)::int AS unique_people
    FROM gas_alerts`;
  return rows[0] || { total: 0, active: 0, reminded: 0, unique_people: 0 };
}

export async function deleteGasAlert(id) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM gas_alerts WHERE id = ${id} RETURNING id`;
  return rows[0] || null;
}

/** Find active alerts whose remind_on date is today or earlier (and not yet reminded). */
export async function dueGasAlerts() {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT id, name, email, cylinder_kg, daily_kg, days_left, run_out, remind_on
    FROM gas_alerts
    WHERE status = 'active' AND remind_on <= CURRENT_DATE
    ORDER BY remind_on ASC
    LIMIT 200
  `;
}

export async function markGasAlertReminded(id) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE gas_alerts SET status = 'reminded', reminded_at = NOW()
    WHERE id = ${id} RETURNING id
  `;
  return rows[0] || null;
}

/** Insert a new contact-form submission. */
export async function insertMessage({
  name, org, email, phone, role, message, source = 'contact', ip = null, userAgent = null,
}) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO messages (name, org, email, phone, role, message, source, ip, user_agent)
    VALUES (${name}, ${org || null}, ${email}, ${phone || null}, ${role || null}, ${message}, ${source}, ${ip}, ${userAgent})
    RETURNING id, created_at
  `;
  return rows[0];
}

export async function listMessages({ status = null, limit = 200 } = {}) {
  await ensureSchema();
  const sql = getSql();
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  let rows;
  if (status && status !== 'all') {
    rows = await sql`
      SELECT m.id, m.name, m.org, m.email, m.role, m.status, m.created_at,
             LEFT(m.message, 140) AS excerpt,
             (SELECT COUNT(*)::int FROM replies r WHERE r.message_id = m.id) AS reply_count
      FROM messages m
      WHERE m.status = ${status}
      ORDER BY m.created_at DESC
      LIMIT ${lim}
    `;
  } else {
    rows = await sql`
      SELECT m.id, m.name, m.org, m.email, m.role, m.status, m.created_at,
             LEFT(m.message, 140) AS excerpt,
             (SELECT COUNT(*)::int FROM replies r WHERE r.message_id = m.id) AS reply_count
      FROM messages m
      ORDER BY m.created_at DESC
      LIMIT ${lim}
    `;
  }
  return rows;
}

export async function countByStatus(status) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT COUNT(*)::int AS c FROM messages WHERE status = ${status}`;
  return rows[0]?.c ?? 0;
}

export async function getMessage(id) {
  await ensureSchema();
  const sql = getSql();
  const mRows = await sql`
    SELECT id, name, org, email, phone, role, message, status, source, created_at
    FROM messages WHERE id = ${id}
  `;
  const m = mRows[0];
  if (!m) return null;
  const rRows = await sql`
    SELECT id, body, sent_by, resend_id, sent_at
    FROM replies WHERE message_id = ${id}
    ORDER BY sent_at ASC
  `;
  return { message: m, replies: rRows };
}

export async function setMessageStatus(id, status) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE messages SET status = ${status} WHERE id = ${id} RETURNING id, status
  `;
  return rows[0] || null;
}

export async function deleteMessage(id) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM messages WHERE id = ${id} RETURNING id`;
  return rows[0] || null;
}

export async function insertReply({ messageId, body, sentBy, resendId = null }) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO replies (message_id, body, sent_by, resend_id)
    VALUES (${messageId}, ${body}, ${sentBy}, ${resendId})
    RETURNING id, body, sent_by, resend_id, sent_at
  `;
  // Update parent status to 'replied'
  await sql`UPDATE messages SET status = 'replied' WHERE id = ${messageId} AND status <> 'archived'`;
  return rows[0];
}
