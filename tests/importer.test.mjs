import test from "node:test";
import assert from "node:assert/strict";
import { parseImport } from "../js/importer.js";

const good = { txs: [{ id: "t1", type: "Belanja", amount: 5, date: "2026-10-01", account: "a", category: "c" }], budgets: [], accounts: [{ id: "a", name: "Cash" }], categories: [{ id: "c", name: "Makan" }], deleted: [], settings: { webAppUrl: "" } };

test("terima eksport yang sah", () => { const r = parseImport(JSON.stringify(good)); assert.equal(r.txs.length, 1); assert.deepEqual(r.budgets, []); });
test("tolak bukan JSON", () => assert.throws(() => parseImport("{oops"), /JSON/));
test("tolak objek tanpa txs/akaun", () => assert.throws(() => parseImport("{}"), /bukan eksport/));
test("tolak array", () => assert.throws(() => parseImport("[]")));
test("tolak transaksi rosak", () => assert.throws(() => parseImport(JSON.stringify({ ...good, txs: [{ id: "x", amount: "abc", date: "2026-01-01" }] })), /transaksi/));
test("budgets hilang jadi []", () => { const { budgets, ...g } = good; assert.deepEqual(parseImport(JSON.stringify(g)).budgets, []); });
