export const BRAND_BLUE = "#3964FE";

export function luminance(hex: string) {
  return [1, 3, 5]
    .map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

export function contrastText(background: string) {
  const light = 1.05 / (luminance(background) + 0.05);
  const dark = (luminance(background) + 0.05) / (luminance("#141414") + 0.05);
  if (dark >= light && dark >= 4.5) return "#141414";
  if (light >= 4.5) return "#ffffff";
  return "#000000";
}
