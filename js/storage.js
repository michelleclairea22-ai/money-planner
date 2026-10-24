// Penyimpanan tempatan yang selamat. KEY mesti kekal stabil merentas versi.
export const KEY = "money-planner-v1";
export const BACKUP_KEY = "money-planner-backup";
const LEGACY_KEYS = ["money-planner", "money-planner-v2", "money-planner-v3", "moneyPlanner"];

const parse = (raw) => { if (!raw) return null; try { const d = JSON.parse(raw); return d && typeof d === "object" && !Array.isArray(d) ? d : null; } catch { return null; } };
const score = (d) => (d ? (d.txs?.length || 0) * 1000 + (d.budgets?.length || 0) + 1 : 0);

// Muat data: utama -> sandaran -> kunci lama. Tidak pernah tulis ganti data sedia ada dengan lalai.
export function loadState(ls, defaults) {
  const main = parse(ls.getItem(KEY));
  let best = main, from = main ? KEY : null;
  for (const k of [BACKUP_KEY, ...LEGACY_KEYS]) {
    const d = parse(ls.getItem(k));
    if (!main && d && score(d) > score(best)) { best = d; from = k; }
  }
  if (!best) return { state: defaults(), recoveredFrom: null, fresh: true };
  const state = { ...defaults(), ...best };
  if (from !== KEY) {
    const raw = ls.getItem(KEY);
    if (raw && !main) { try { ls.setItem(KEY + "-corrupt-" + Date.now(), raw); } catch {} }
    writeState(ls, state);
  }
  return { state, recoveredFrom: from !== KEY ? from : null, fresh: false };
}

export function writeState(ls, state) {
  const json = JSON.stringify(state);
  ls.setItem(KEY, json);
  // Sandaran hanya dikemas kini bila ada data, supaya "padam" tidak sentuh sandaran kosong secara tak sengaja.
  if (state.txs?.length || !ls.getItem(BACKUP_KEY)) { try { ls.setItem(BACKUP_KEY, json); } catch {} }
}

export function restoreBackup(ls, defaults) {
  const d = parse(ls.getItem(BACKUP_KEY)); if (!d) return null;
  const state = { ...defaults(), ...d }; ls.setItem(KEY, JSON.stringify(state)); return state;
}
