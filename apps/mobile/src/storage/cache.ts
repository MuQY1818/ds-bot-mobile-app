import * as SQLite from "expo-sqlite";
let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  if (!database)
    database = SQLite.openDatabaseAsync("ds-bot-mobile.db").then(
      async (value) => {
        await value.execAsync(
          "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS cache (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope, key));",
        );
        return value;
      },
    );
  return database;
}
export async function readCache<T>(
  scope: string,
  key: string,
): Promise<T | null> {
  const row = await (
    await db()
  ).getFirstAsync<{ value: string }>(
    "SELECT value FROM cache WHERE scope = ? AND key = ?",
    scope,
    key,
  );
  return row ? (JSON.parse(row.value) as T) : null;
}
export async function writeCache(scope: string, key: string, value: unknown) {
  await (
    await db()
  ).runAsync(
    "INSERT OR REPLACE INTO cache(scope,key,value) VALUES(?,?,?)",
    scope,
    key,
    JSON.stringify(value),
  );
}
export async function clearCache(scope: string) {
  await (await db()).runAsync("DELETE FROM cache WHERE scope = ?", scope);
}

/** One SQLite statement owns a send by request ID across mounted hook instances. */
export async function writeSendCache(scope: string, key: string, value: unknown, expectedRequestId: string | null) {
  const database = await db();
  const result = expectedRequestId === null
    ? await database.runAsync(
      "INSERT INTO cache(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value WHERE cache.value='null'",
      scope, key, JSON.stringify(value),
    )
    : await database.runAsync(
      "UPDATE cache SET value=? WHERE scope=? AND key=? AND json_extract(value,'$.requestId')=?",
      JSON.stringify(value), scope, key, expectedRequestId,
    );
  return result.changes === 1;
}

export async function clearCachedContent(scope: string) {
  const database = await db();
  // An unresolved submission and its editable text must survive clearing history.
  await database.runAsync(
    `DELETE FROM cache WHERE scope = ? AND key NOT LIKE 'pending:%' AND key NOT LIKE 'outgoing:%' AND key NOT LIKE 'archive:%' AND NOT (key LIKE 'draft:%' AND EXISTS (SELECT 1 FROM cache AS unresolved WHERE unresolved.scope = cache.scope AND unresolved.key IN ('pending:' || substr(cache.key, 7), 'outgoing:' || substr(cache.key, 7)) AND unresolved.value != 'null'))`,
    scope,
  );
}
