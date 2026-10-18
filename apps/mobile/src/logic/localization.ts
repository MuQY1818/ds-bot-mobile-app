export function resolveLanguage(preference: string, host: string | undefined, system: string): "en" | "zh" {
  const explicit = preference === "host" ? host : preference === "system" ? system : preference;
  const resolved = explicit && /^(en|zh)(?:[-_]|$)/i.test(explicit) ? explicit : system;
  return resolved.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function translate(key: string, catalog: Record<string, string>, locale: string, params?: Record<string, string | number>) {
  const text = locale === "zh" && Object.hasOwn(catalog, key) ? catalog[key] : key;
  return params ? text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match) : text;
}

export function localizedText(value: string | Record<string, string> | undefined, locale: "en" | "zh") {
  if (typeof value === "string") return value;
  const languages = locale === "zh" ? ["zh-CN", "zh", "en-US", "en"] : ["en-US", "en", "zh-CN", "zh"];
  return languages.map(key => value?.[key]).find(text => !!text?.trim()) || Object.values(value || {}).find(text => !!text?.trim()) || "";
}
