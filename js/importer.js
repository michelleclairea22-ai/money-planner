// Validate and normalise an exported Money Planner JSON (same shape as Eksport).
const ARR = ["txs", "budgets", "accounts", "categories", "deleted"];
export function parseImport(text) {
  let d;
  try { d = typeof text === "string" ? JSON.parse(text) : text; } catch { throw new Error("Fail bukan JSON yang sah"); }
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("Format fail tidak dikenali");
  for (const k of ARR) if (d[k] !== undefined && !Array.isArray(d[k])) throw new Error(`Medan "${k}" tidak sah`);
  if (!Array.isArray(d.txs) || !Array.isArray(d.accounts) || !Array.isArray(d.categories)) throw new Error("Fail ini bukan eksport Money Planner");
  for (const t of d.txs) {
    if (!t || typeof t !== "object" || !t.id || !/^\d{4}-\d{2}-\d{2}/.test(String(t.date || "")) || !Number.isFinite(Number(t.amount))) throw new Error("Ada transaksi tidak sah dalam fail");
  }
  for (const a of [...d.accounts, ...d.categories]) if (!a || !a.id || !a.name) throw new Error("Ada akaun/kategori tidak sah dalam fail");
  return {
    txs: d.txs, budgets: d.budgets || [], accounts: d.accounts, categories: d.categories, deleted: d.deleted || [],
    settings: d.settings && typeof d.settings === "object" ? d.settings : null,
  };
}
