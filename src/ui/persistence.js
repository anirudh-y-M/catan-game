// Autosave the game to localStorage so a refresh can resume the exact state.
const KEY = 'catan-hotseat-save-v1';

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ }
}
export function load() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
