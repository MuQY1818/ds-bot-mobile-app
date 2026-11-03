// Adapted verbatim from Fei2411/DS-Bot 0.2.6 src/host/secrets.js, Apache-2.0.
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/
export const MIN_VALUE = 4
export const WHOLE_VALUE = 8

// encodeURIComponent leaves ' as is, but new URL() turns it into %27 in a query, so the
// URL sent out would hold a form the redactor does not know. Encoding these characters
// too keeps the sent URL equal to the text the redactor looks for.
export const encodeUrlComponent = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())

// One function that replaces every known value in a string, longest first so a value
// that contains another is replaced whole. JSON-escaped and URL-encoded forms are covered too.
export function redactor(entries) {
  const pairs = []
  for (const { name, value } of entries) {
    if (typeof value !== 'string' || value.length < MIN_VALUE) continue
    const label = `[secret:${name}]`
    const short = value.length < WHOLE_VALUE
    pairs.push([value, label, short])
    const escaped = JSON.stringify(value).slice(1, -1)
    if (escaped !== value) pairs.push([escaped, label, short])
    // encodeURIComponent throws on a lone surrogate; such a value cannot sit in a URL anyway.
    const encoded = value.isWellFormed() ? encodeUrlComponent(value) : value
    if (encoded !== value && encoded !== escaped) pairs.push([encoded, label, short])
  }
  pairs.sort((a, b) => b[0].length - a[0].length)
  if (pairs.length === 0) return text => text
  // One pass, so a label already written is never matched again.
  const labels = new Map()
  for (const [value, label] of pairs) if (!labels.has(value)) labels.set(value, label)
  const quote = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(pairs.map(([value, , short]) => (short ? `(?<![\\p{L}\\p{N}])${quote(value)}(?![\\p{L}\\p{N}])` : quote(value))).join('|'), 'gu')
  return (text) => {
    if (typeof text !== 'string' || !pairs.some(([value]) => text.includes(value))) return text
    return text.replace(pattern, match => labels.get(match) ?? match)
  }
}
