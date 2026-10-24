// Logik kira tulen (diuji dalam tests/). Tiada DOM.
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const monthKey = (iso) => String(iso || "").slice(0, 7);

export function accountBalances(accounts, txs) {
  const bal = {};
  for (const a of accounts) bal[a.id] = round2(a.opening || 0);
  for (const t of txs) {
    const amt = Number(t.amount) || 0;
    if (t.type === "Belanja" && t.account in bal) bal[t.account] -= amt;
    else if (t.type === "Pendapatan" && t.account in bal) bal[t.account] += amt;
    else if (t.type === "Pindah") {
      if (t.account in bal) bal[t.account] -= amt;
      if (t.toAccount in bal) bal[t.toAccount] += amt;
    }
  }
  for (const k in bal) bal[k] = round2(bal[k]);
  return bal;
}

export function totals(txs) {
  let income = 0, expense = 0;
  for (const t of txs) {
    if (t.type === "Pendapatan") income += Number(t.amount) || 0;
    else if (t.type === "Belanja") expense += Number(t.amount) || 0;
  }
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
}

export const inMonth = (txs, ym) => txs.filter((t) => monthKey(t.date) === ym);

export function byDay(txs) {
  const map = {};
  for (const t of txs) (map[t.date] ||= []).push(t);
  return Object.keys(map).sort().reverse().map((date) => ({ date, items: map[date], ...totals(map[date]) }));
}

export function spendingByCategory(txs) {
  const sums = {};
  let total = 0;
  for (const t of txs) {
    if (t.type !== "Belanja") continue;
    const a = Number(t.amount) || 0;
    sums[t.category] = (sums[t.category] || 0) + a;
    total += a;
  }
  return Object.entries(sums)
    .map(([category, amount]) => ({ category, amount: round2(amount), pct: total ? round2((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function budgetProgress(budgets, txs, ym) {
  const spent = {};
  for (const r of spendingByCategory(inMonth(txs, ym))) spent[r.category] = r.amount;
  const rows = budgets.filter((b) => Number(b.amount) > 0).map((b) => {
    const s = spent[b.category] || 0;
    const amt = Number(b.amount);
    return { category: b.category, budget: round2(amt), spent: s, left: round2(amt - s), pct: Math.round((s / amt) * 100) };
  });
  const tb = round2(rows.reduce((x, r) => x + r.budget, 0));
  const ts = round2(rows.reduce((x, r) => x + r.spent, 0));
  return { rows, budget: tb, spent: ts, pct: tb ? Math.round((ts / tb) * 100) : 0 };
}

// Kalkulator ringkas: "12+3*2" ikut kiri ke kanan seperti kalkulator telefon.
export function evalKeypad(expr) {
  const parts = String(expr || "").match(/(\d*\.?\d+|[+\-×÷*/])/g);
  if (!parts) return 0;
  let acc = 0, op = "+";
  for (const p of parts) {
    if (/[+\-×÷*/]/.test(p)) { op = p; continue; }
    const n = Number(p);
    if (op === "+") acc += n; else if (op === "-") acc -= n;
    else if (op === "×" || op === "*") acc *= n; else if (n) acc /= n;
  }
  return round2(acc);
}

export function monthGrid(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
