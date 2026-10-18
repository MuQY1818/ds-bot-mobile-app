// ScrollView.contentOffset is an initial/restoration command, not live state.
// Keep its object/value stable during native drag and momentum events.
export function createHomeScrollRestoration() {
  let saved = 0;
  let offset = { x: 0, y: 0 };
  return {
    get initialOffset() { return offset; },
    observe(y: number) { if (Number.isFinite(y)) saved = Math.max(0, y); },
    restore() { offset = { x: 0, y: saved }; return offset; },
    reset() { saved = 0; offset = { x: 0, y: 0 }; },
  };
}
