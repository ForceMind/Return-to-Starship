export const defaults = Object.freeze({ theme: 'auto', font: 20, line: 2, width: 720 });
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value))
  ? Math.min(max, Math.max(min, Number(value))) : fallback;
export function settings(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return { theme: ['auto', 'light', 'dark'].includes(value.theme) ? value.theme : defaults.theme,
    font: clamp(value.font, 16, 30, defaults.font),
    line: clamp(value.line, 1.5, 2.6, defaults.line),
    width: clamp(value.width, 560, 960, defaults.width) };
}
export function progress(value, chapters) {
  if (!value || !chapters.some(c => c.id === value.id)) return null;
  const result = { id: value.id, ratio: clamp(value.ratio, 0, 1, 0),
    anchor: /^p-[a-f0-9]{12}-\d+$/.test(value.anchor) ? value.anchor : null,
    offset: clamp(value.offset, 0, 1, 0) };
  // Preserve a position in the chapter heading separately from body progress.
  if (typeof value.heading === 'number' && Number.isFinite(value.heading)) {
    result.heading = clamp(value.heading, 0, 1, 0);
  }
  return result;
}
export function readJSON(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}
export function writeJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
