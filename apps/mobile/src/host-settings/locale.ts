import { language, tr as sharedTranslation } from "../i18n";
import chinese from "./locale.zh.json";
const entries: Record<string, string> = chinese;
export function tr(text: string, params?: Record<string, string | number>) {
  const value = language() === "zh" ? (Object.hasOwn(entries,text) ? entries[text] : sharedTranslation(text)) : text;
  return params ? value.replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match) : value;
}
