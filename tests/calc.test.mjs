import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/calc.js";

const accounts = [{ id: "cash", opening: 100 }, { id: "bank", opening: 1000 }];
const txs = [
  { type: "Belanja", amount: 20.5, category: "Makan", account: "cash", date: "2026-10-01" },
  { type: "Belanja", amount: 79.5, category: "Minyak", account: "bank", date: "2026-10-02" },
  { type: "Pendapatan", amount: 3000, category: "Gaji", account: "bank", date: "2026-10-01" },
  { type: "Pindah", amount: 200, account: "bank", toAccount: "cash", date: "2026-10-03" },
  { type: "Belanja", amount: 50, category: "Makan", account: "cash", date: "2026-09-30" },
];

test("baki akaun termasuk pindahan", () => {
  assert.deepEqual(C.accountBalances(accounts, txs), { cash: 229.5, bank: 3720.5 });
});
test("jumlah bulan", () => {
  assert.deepEqual(C.totals(C.inMonth(txs, "2026-10")), { income: 3000, expense: 100, net: 2900 });
});
test("analisis kategori peratus", () => {
  const r = C.spendingByCategory(C.inMonth(txs, "2026-10"));
  assert.equal(r[0].category, "Minyak"); assert.equal(r[0].pct, 79.5); assert.equal(r[1].pct, 20.5);
});
test("bajet", () => {
  const b = C.budgetProgress([{ category: "Makan", amount: 100 }, { category: "Minyak", amount: 100 }], txs, "2026-10");
  assert.equal(b.budget, 200); assert.equal(b.spent, 100); assert.equal(b.pct, 50);
  assert.equal(b.rows[0].left, 79.5);
});
test("kalkulator & kalendar", () => {
  assert.equal(C.evalKeypad("10+5×2"), 30);
  assert.equal(C.evalKeypad("7÷2"), 3.5);
  assert.equal(C.monthGrid("2026-10").length % 7, 0);
  assert.equal(C.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(C.byDay(txs)[0].date, "2026-10-03");
});
