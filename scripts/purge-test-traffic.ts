/**
 * Remove internal test traffic (channel "admin-test": eval runs, "Test it")
 * from the persistent question log and staff notifications.
 *
 *   npm run purge:test
 */
import "./load-env";
import { neon } from "@neondatabase/serverless";

type Row = { key: string; value: { channel?: string }[] };

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.log("No DATABASE_URL; nothing to purge (memory store).");
    return;
  }
  const sql = neon(url);
  const rows = (await sql`
    SELECT key, value FROM afd_kv WHERE key IN ('afd:questions', 'afd:notifications')
  `) as Row[];
  for (const r of rows) {
    const after = r.value.filter((x) => x.channel !== "admin-test");
    await sql`
      UPDATE afd_kv SET value = ${JSON.stringify(after)}::jsonb, updated_at = now()
      WHERE key = ${r.key}
    `;
    console.log(`${r.key}: ${r.value.length} → ${after.length}`);
  }
}

main();
