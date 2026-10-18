const prefix = "ds-bot:cache:";
function key(scope: string, name: string) {
  return prefix + JSON.stringify([scope, name]);
}
export async function readCache<T>(
  scope: string,
  name: string,
): Promise<T | null> {
  try {
    const value = localStorage.getItem(key(scope, name));
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}
export async function writeCache(scope: string, name: string, value: unknown) {
  try {
    localStorage.setItem(key(scope, name), JSON.stringify(value));
  } catch {
    /* Browser preview may disable storage. */
  }
}
// Browser preview has one JS owner. Native send ownership uses SQLite CAS.
export async function writeSendCache(scope: string, name: string, value: unknown, expectedRequestId: string | null) {
  const storageKey = key(scope, name);
  const previous = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (expectedRequestId === null ? previous !== null : previous?.requestId !== expectedRequestId) return false;
  localStorage.setItem(storageKey, JSON.stringify(value));
  return true;
}
export async function clearCache(scope: string) {
  for (const value of Object.keys(localStorage))
    if (value.startsWith(prefix + JSON.stringify([scope]).slice(0, -1) + ","))
      localStorage.removeItem(value);
}

export async function clearCachedContent(scope: string) {
  const entries = Object.keys(localStorage).filter((value) =>
    value.startsWith(prefix),
  );
  for (const entry of entries) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.slice(prefix.length));
    } catch {
      continue;
    }
    if (
      !Array.isArray(parsed) ||
      parsed[0] !== scope ||
      typeof parsed[1] !== "string"
    )
      continue;
    const name = parsed[1];
    if (name.startsWith("pending:") || name.startsWith("outgoing:") || name.startsWith("archive:")) continue;
    if (
      name.startsWith("draft:") &&
      ((await readCache(scope, "pending:" + name.slice(6))) || (await readCache(scope, "outgoing:" + name.slice(6))))
    )
      continue;
    localStorage.removeItem(entry);
  }
}
