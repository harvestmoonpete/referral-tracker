import pg from "pg";
import { app, type Store, type Database } from "./app.js";
import { seed } from "../src/domain.js";
const stalledDays = Number(process.env.STALLED_DAYS || 7);
if (!Number.isInteger(stalledDays) || stalledDays < 1 || stalledDays > 365) {
  throw new Error("STALLED_DAYS must be an integer between 1 and 365");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
  "CREATE TABLE IF NOT EXISTS workspace (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL)",
);
await pool.query(
  "INSERT INTO workspace (id,data) VALUES (1,$1) ON CONFLICT DO NOTHING",
  [JSON.stringify({ state: seed(), sessions: {} })],
);
const store: Store = {
  async transaction<T>(fn: (db: Database) => Promise<T> | T) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT data FROM workspace WHERE id=1 FOR UPDATE",
      );
      const db = rows[0].data as Database;
      const result = await fn(db);
      await client.query("UPDATE workspace SET data=$1 WHERE id=1", [
        JSON.stringify(db),
      ]);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
const server = await app(store);
await server.listen({ host: "0.0.0.0", port: 3000 });
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await server.close();
    await pool.end();
    process.exit(0);
  });
