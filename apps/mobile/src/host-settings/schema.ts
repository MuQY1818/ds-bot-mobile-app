export interface SettingsNamespace {
  ns: string;
  autoGenerate: boolean;
  schema: unknown;
  value: unknown;
  base?: unknown;
  user?: unknown;
  applies: "live";
  secrets: Array<{ path: string[]; set: boolean }>;
  revision: number;
}
export interface SettingsDescription {
  writable: boolean;
  hasDocument: boolean;
  namespaces: SettingsNamespace[];
}
export interface ConfigField {
  path: string[];
  kind: "string" | "number" | "boolean" | "enum" | "unsupported";
  label: string;
  description?: string;
  secret: boolean;
  configured: boolean;
  choices?: Array<string | number | boolean | null>;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
  reason?: string;
}

const unsafe = new Set(["__proto__", "prototype", "constructor"]);
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
export function pathValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (
      unsafe.has(key) ||
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, key)
    )
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// Read the documented Schemastery wire envelope as data. Never evaluate schema
// callbacks, template strings, or plugin code in the phone process.
export function configFields(namespace: SettingsNamespace): ConfigField[] {
  const envelope = object(namespace.schema) || {};
  const refs = object(envelope.refs) || {};
  const fields = new Map<string, ConfigField>();
  const resolve = (value: unknown): Record<string, unknown> | undefined =>
    object(
      typeof value === "number" || typeof value === "string"
        ? refs[String(value)]
        : value,
    );
  function visit(
    raw: unknown,
    path: string[],
    depth: number,
    parents: Set<unknown>,
    inheritedDisabled = false,
  ) {
    const node = resolve(raw);
    if (
      !node ||
      depth > 12 ||
      path.some((key) => unsafe.has(key)) ||
      parents.has(node)
    )
      return;
    const meta = object(node.meta) || {};
    if (meta.hidden === true) return;
    const secretState = namespace.secrets.find(
      (entry) => entry.path.join("\0") === path.join("\0"),
    );
    const secret = meta.role === "secret" || !!secretState;
    const description =
      typeof meta.description === "string"
        ? meta.description
        : (object(meta.description)?.["en-US"] ?? object(meta.description)?.en);
    const base = {
      path,
      label:
        typeof meta.title === "string"
          ? meta.title
          : path.join(" · ") || namespace.ns,
      ...(typeof description === "string" ? { description } : {}),
      secret,
      configured: secretState?.set === true,
      ...(typeof meta.min === "number" ? { min: meta.min } : {}),
      ...(typeof meta.max === "number" ? { max: meta.max } : {}),
      required: meta.required === true,
      disabled: inheritedDisabled || meta.disabled === true,
    };
    const add = (field: ConfigField) => fields.set(path.join("\0"), field);
    if (secret) {
      add({ ...base, kind: "string" });
      return;
    }
    const next = new Set(parents).add(node);
    if (node.type === "object") {
      for (const [key, child] of Object.entries(object(node.dict) || {}))
        visit(child, [...path, key], depth + 1, next, base.disabled);
      return;
    }
    if (node.type === "intersect") {
      for (const child of Array.isArray(node.list) ? node.list : [])
        visit(child, path, depth + 1, next, base.disabled);
      return;
    }
    if (node.type === "array" || node.type === "dict") {
      const values = pathValue(namespace.value, path);
      const keys =
        node.type === "array" && Array.isArray(values)
          ? values.map((_, index) => String(index))
          : Object.keys(object(values) || {});
      add({
        ...base,
        kind: "unsupported",
        reason: keys.length
          ? "Existing entries can be edited below. Add or remove entries in Harness on your host."
          : "Add entries in Harness on your host. This collection is empty.",
      });
      for (const key of keys)
        visit(node.inner, [...path, key], depth + 1, next, base.disabled);
      return;
    }
    if (node.type === "union") {
      const choices = (Array.isArray(node.list) ? node.list : []).map(resolve);
      if (
        choices.length &&
        choices.every(
          (choice) =>
            choice?.type === "const" &&
            (choice.value === null ||
              ["string", "number", "boolean"].includes(typeof choice.value)),
        )
      ) {
        add({
          ...base,
          kind: "enum",
          choices: choices.map(
            (choice) => choice!.value as string | number | boolean | null,
          ),
        });
      } else
        add({
          ...base,
          kind: "unsupported",
          reason:
            "This field uses a conditional form. Edit it in Harness on your host.",
        });
      return;
    }
    if (node.type === "const") {
      add({
        ...base,
        kind: "unsupported",
        reason: "This value is fixed by the host schema.",
      });
      return;
    }
    if (["string", "number", "boolean"].includes(String(node.type))) {
      add({ ...base, kind: node.type as "string" | "number" | "boolean" });
    } else
      add({
        ...base,
        kind: "unsupported",
        reason: `The ${String(node.type || "custom")} field uses a host-specific editor. Open Harness settings on the host to change it.`,
      });
  }
  visit(envelope.refs ? envelope.uid : envelope, [], 0, new Set());
  return [...fields.values()].filter((field) => field.path.length > 0);
}

export function credentialReferences(
  namespaces: SettingsNamespace[],
): string[] {
  const refs = new Set<string>();
  function visit(value: unknown, depth: number) {
    if (depth > 12 || value === null || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (unsafe.has(key)) continue;
      if (
        key === "apiKeyEnv" &&
        typeof item === "string" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(item)
      )
        refs.add(item);
      else if (typeof item === "object") visit(item, depth + 1);
    }
  }
  for (const namespace of namespaces) visit(namespace.value, 0);
  return [...refs].sort();
}

export function fieldValue(
  field: ConfigField,
  draft: string,
): string | number | boolean | null {
  if (field.kind === "number") {
    const value = Number(draft);
    if (!draft.trim() || !Number.isFinite(value))
      throw new Error("Enter a valid number.");
    if (field.min !== undefined && value < field.min)
      throw new Error(`Enter a number of at least ${field.min}.`);
    if (field.max !== undefined && value > field.max)
      throw new Error(`Enter a number no greater than ${field.max}.`);
    return value;
  }
  if (field.kind === "boolean") return draft === "true";
  if (field.kind === "enum") {
    const found = field.choices?.find(
      (value) => JSON.stringify(value) === draft,
    );
    if (found === undefined)
      throw new Error("Choose one of the available options.");
    return found;
  }
  if (field.required && draft.trim() === "")
    throw new Error("This field is required.");
  return draft;
}
