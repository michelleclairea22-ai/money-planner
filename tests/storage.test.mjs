import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEY, BACKUP_KEY, loadState, writeState, restoreBackup } from "../js/storage.js";

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const defaults = () => ({ txs: [], budgets: [], accounts: [], categories: [], deleted: [], settings: {} });
const v1Data = { txs: [{ id: "t1", amount: 5 }, { id: "t2", amount: 7 }], budgets: [], accounts: [{ id: "a" }], categories: [], deleted: [], settings: {} };

test("bug: app.js mesti boleh dihurai (v2 ada '}' lebih -> skrin kosong)", () => {
  const d = mkdtempSync(join(tmpdir(), "mp-")); const f = join(d, "app.mjs");
  writeFileSync(f, readFileSync(new URL("../js/app.js", import.meta.url)));
  execFileSync(process.execPath, ["--check", f]);
});
test("data v1 sedia ada dimuat tanpa ditulis ganti", () => {
  const ls = mem({ [KEY]: JSON.stringify(v1Data) });
  const r = loadState(ls, defaults);
  assert.equal(r.state.txs.length, 2); assert.equal(JSON.parse(ls.getItem(KEY)).txs.length, 2);
});
test("simpan menulis kunci utama dan sandaran", () => {
  const ls = mem(); writeState(ls, v1Data);
  assert.equal(JSON.parse(ls.getItem(BACKUP_KEY)).txs.length, 2);
});
test("JSON utama rosak -> pulih dari sandaran, data rosak disimpan berasingan", () => {
  const ls = mem({ [KEY]: "{rosak", [BACKUP_KEY]: JSON.stringify(v1Data) });
  const r = loadState(ls, defaults);
  assert.equal(r.recoveredFrom, BACKUP_KEY); assert.equal(r.state.txs.length, 2);
  assert.equal(JSON.parse(ls.getItem(KEY)).txs.length, 2);
  assert.ok([...ls.m.keys()].some((k) => k.startsWith(KEY + "-corrupt-")));
});
test("kunci utama hilang -> pulih dari kunci lama", () => {
  const ls = mem({ "money-planner": JSON.stringify(v1Data) });
  assert.equal(loadState(ls, defaults).state.txs.length, 2);
});
test("pengguna baru dapat lalai, tiada tulis", () => { const ls = mem(); const r = loadState(ls, defaults); assert.ok(r.fresh); assert.equal(ls.getItem(KEY), null); });
test("padam semua tidak dipulihkan automatik, tetapi sandaran boleh dipulihkan manual", () => {
  const ls = mem(); writeState(ls, v1Data); writeState(ls, defaults());
  assert.equal(loadState(ls, defaults).state.txs.length, 0);
  assert.equal(restoreBackup(ls, defaults).txs.length, 2);
});
