import * as C from "./calc.js";
import { callApi, cleanWebAppUrl } from "./api.js";
import { parseImport } from "./importer.js";
import { KEY, loadState, writeState, restoreBackup } from "./storage.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const rm = (n) => "RM" + (Number(n) || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BULAN = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
const HARI = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const COLORS = ["#F4608F", "#f8a5bf", "#ffb86b", "#ffd86b", "#8fd6a8", "#7cc6f2", "#b9a6f5", "#f59ad8", "#a0e0d8", "#d4b48c"];

const DEF_CATS = [
  ["Makan", "🍜", "Belanja"], ["Minyak", "⛽", "Belanja"], ["Bil", "🧾", "Belanja"], ["Loan", "🚗", "Belanja"],
  ["Shopping", "🛍️", "Belanja"], ["Hutang", "💳", "Belanja"], ["Rumah", "🏠", "Belanja"], ["Kesihatan", "💊", "Belanja"],
  ["Anak", "🧸", "Belanja"], ["Lain-lain", "📦", "Belanja"],
  ["Gaji", "💰", "Pendapatan"], ["Bonus", "🎁", "Pendapatan"], ["Sampingan", "💼", "Pendapatan"], ["Lain-lain", "✨", "Pendapatan"],
];
const DEF_ACCS = [["Cash", "💵"], ["Bank", "🏦"], ["eWallet", "📱"]];

function defaults() {
  const t = now();
  return {
    txs: [], budgets: [],
    accounts: DEF_ACCS.map(([name, emoji], i) => ({ id: "acc" + i, name, emoji, opening: 0, updatedAt: t })),
    categories: DEF_CATS.map(([name, emoji, type], i) => ({ id: "cat" + i, name, emoji, type, updatedAt: t })),
    deleted: [], settings: { webAppUrl: "", accessKey: "", lastSync: "" },
  };
}
const boot = loadState(localStorage, defaults);
let S = boot.state;
const persist = () => writeState(localStorage, S);
const save = () => { persist(); scheduleSync(); };
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

let tab = "rekod", ym = todayIso().slice(0, 7), anaMode = "belanja", lagiMode = "kategori", selDay = todayIso();

const catOf = (id) => S.categories.find((c) => c.id === id) || { name: "?", emoji: "❔" };
const accOf = (id) => S.accounts.find((a) => a.id === id) || { name: "?", emoji: "❔" };
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 2200); };
const malayDate = (iso) => { const d = new Date(iso + "T00:00"); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`; };

function txRow(t) {
  const isT = t.type === "Pindah";
  const c = isT ? { emoji: "🔁", name: "Pindah" } : catOf(t.category);
  const sub = isT ? `${accOf(t.account).name} → ${accOf(t.toAccount).name}` : accOf(t.account).name + (t.note ? " · " + t.note : "");
  const cls = t.type === "Pendapatan" ? "in" : t.type === "Belanja" ? "out" : "mute";
  return `<button class="tx" data-tx="${t.id}"><div class="ico">${c.emoji}</div><div class="grow"><div>${esc(isT && t.note ? t.note : c.name)}</div><div class="mute">${esc(sub)}</div></div><div class="amt ${cls}">${t.type === "Belanja" ? "-" : ""}${rm(t.amount)}</div></button>`;
}
const dayCard = (g) => `<div class="card"><div class="day"><span>${malayDate(g.date)}</span><span><span class="in">${g.income ? "+" + rm(g.income) : ""}</span> <span class="out">${g.expense ? "-" + rm(g.expense) : ""}</span></span></div>${g.items.map(txRow).join("")}</div>`;
const sumCard = (tt) => `<div class="card sum"><div><span class="mute">Pendapatan</span><b class="in">${rm(tt.income)}</b></div><div><span class="mute">Belanja</span><b class="out">${rm(tt.expense)}</b></div><div><span class="mute">Baki</span><b>${rm(tt.net)}</b></div></div>`;

function donut(rows, size = 200) {
  const r = 70, c = 2 * Math.PI * r; let off = 0;
  const segs = rows.map((x, i) => { const len = (x.pct / 100) * c; const s = `<circle r="${r}" cx="100" cy="100" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="34" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join("");
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" style="transform:rotate(-90deg)"><circle r="${r}" cx="100" cy="100" fill="none" stroke="#fde4ec" stroke-width="34"/>${segs}</svg>`;
}
function ring(pct) {
  const r = 70, c = 2 * Math.PI * r, len = Math.min(pct, 100) / 100 * c;
  return `<div style="position:relative;width:180px;margin:0 auto"><svg viewBox="0 0 200 200" width="180" height="180" style="transform:rotate(-90deg)"><circle r="${r}" cx="100" cy="100" fill="none" stroke="#fde4ec" stroke-width="36"/><circle r="${r}" cx="100" cy="100" fill="none" stroke="${pct > 100 ? "#e5484d" : "#F4608F"}" stroke-width="36" stroke-linecap="round" stroke-dasharray="${len} ${c}"/></svg><b style="position:absolute;inset:0;display:grid;place-items:center;font-size:22px">${pct}%</b></div>`;
}

const views = {
  rekod() {
    const m = C.inMonth(S.txs, ym);
    const days = C.byDay(m);
    return sumCard(C.totals(m)) + (days.length ? days.map(dayCard).join("") : `<div class="empty">Tiada rekod bulan ini.<br>Tekan ＋ untuk tambah.</div>`);
  },
  kalendar() {
    const m = C.inMonth(S.txs, ym), grid = C.monthGrid(ym), today = todayIso();
    const per = {}; for (const g of C.byDay(m)) per[g.date] = g;
    if (selDay.slice(0, 7) !== ym) selDay = ym === today.slice(0, 7) ? today : ym + "-01";
    const cells = grid.map((d) => d ? `<button data-day="${d}" class="${d === today ? "today" : ""} ${d === selDay ? "sel" : ""}"><b>${+d.slice(8)}</b>${per[d]?.income ? `<small class="in">+${C.round2(per[d].income)}</small>` : ""}${per[d]?.expense ? `<small class="out">-${C.round2(per[d].expense)}</small>` : ""}</button>` : "<span></span>").join("");
    const g = per[selDay];
    return sumCard(C.totals(m)) + `<div class="cal">${["Ah", "Is", "Se", "Ra", "Kh", "Ju", "Sa"].map((h) => `<div class="h">${h}</div>`).join("")}${cells}</div>
      <div class="row between" style="margin:14px 2px 8px"><h3 style="margin:0">${malayDate(selDay)}</h3><button class="btn" data-addon="${selDay}">＋ Tambah</button></div>
      ${g ? dayCard(g) : `<div class="empty" style="padding:16px">Tiada transaksi hari ini.</div>`}`;
  },
  akaun() {
    const bal = C.accountBalances(S.accounts, S.txs);
    const total = C.round2(Object.values(bal).reduce((a, b) => a + b, 0));
    return `<div class="card sum"><div><span class="mute">Jumlah Aset</span><b class="${total < 0 ? "out" : "in"}">${rm(total)}</b></div></div>
      <div class="card">${S.accounts.map((a) => `<button class="tx" data-acc="${a.id}"><div class="ico">${a.emoji}</div><div class="grow">${esc(a.name)}</div><div class="amt ${bal[a.id] < 0 ? "out" : ""}">${rm(bal[a.id])}</div></button>`).join("")}</div>
      <div class="row"><button class="btn" data-acc="new">＋ Akaun</button><button class="btn ghost" data-transfer="1">🔁 Pindah wang</button></div>`;
  },
  analisis() {
    const m = C.inMonth(S.txs, ym), tt = C.totals(m);
    const seg = `<div class="seg"><button data-ana="belanja" class="${anaMode === "belanja" ? "on" : ""}">Belanja</button><button data-ana="bajet" class="${anaMode === "bajet" ? "on" : ""}">Bajet</button></div>`;
    if (anaMode === "bajet") {
      const b = C.budgetProgress(S.budgets, S.txs, ym);
      const exp = S.categories.filter((c) => c.type === "Belanja");
      const rows = exp.map((c) => { const r = b.rows.find((x) => x.category === c.id); const bud = S.budgets.find((x) => x.category === c.id);
        const p = r ? r.pct : 0;
        return `<button class="tx" data-bud="${c.id}"><div class="ico">${c.emoji}</div><div style="width:84px"><div>${esc(c.name)}</div><div class="mute">${r ? C.round2(r.spent) : "—"}</div></div><div class="bar"><i style="width:${Math.min(p, 100)}%;${p > 100 ? "background:#f59a9d" : ""}"></i><span><span>${bud && bud.amount ? rm(bud.amount) : "Tetapkan"}</span><span>${r ? p + "%" : ""}</span><span class="${r && r.left < 0 ? "out" : ""}" style="color:${r && r.left >= 0 ? "#F4608F" : ""}">${r ? rm(r.left) : ""}</span></span></div></button>`; }).join("");
      return seg + `<div class="card" style="text-align:center">${ring(b.pct)}<b style="color:var(--pink)">${rm(b.spent)} / ${rm(b.budget)}</b><div class="mute">Bajet bulanan · tekan kategori untuk ubah</div></div><div class="card">${rows}</div>`;
    }
    const rows = C.spendingByCategory(m);
    return seg + sumCard(tt) + (rows.length ? `<div class="card" style="text-align:center">${donut(rows)}<div class="mute">Belanja ikut kategori</div></div><div class="card legend">${rows.map((r, i) => { const c = catOf(r.category); return `<div class="row"><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span><span>${c.emoji}</span><span style="flex:1">${esc(c.name)}</span><span class="mute">${r.pct}%</span><b style="width:100px;text-align:right">${rm(r.amount)}</b></div>`; }).join("")}</div>` : `<div class="empty">Tiada belanja bulan ini.</div>`);
  },
  lagi() {
    const seg = `<div class="seg"><button data-lagi="kategori" class="${lagiMode === "kategori" ? "on" : ""}">Kategori</button><button data-lagi="tetapan" class="${lagiMode === "tetapan" ? "on" : ""}">Tetapan</button></div>`;
    if (lagiMode === "kategori") {
      const list = (type) => `<h3>${type}</h3><div class="card">${S.categories.filter((c) => c.type === type).map((c) => `<button class="tx" data-cat="${c.id}"><div class="ico">${c.emoji}</div><div class="grow">${esc(c.name)}</div><span class="mute">Ubah ›</span></button>`).join("")}</div>`;
      return seg + list("Belanja") + list("Pendapatan") + `<button class="btn" data-cat="new">＋ Kategori</button>`;
    }
    const st = S.settings;
    return seg + `<div class="card form"><h3>Segerak Google Sheet (pilihan)</h3><div class="mute">Data disimpan dalam telefon dahulu. Isi jika mahu salinan dalam Google Sheet.</div>
      <label>URL Web App</label><input id="sUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(st.webAppUrl)}">
      <label>Kunci akses (ACCESS_KEY)</label><input id="sKey" type="password" value="${esc(st.accessKey)}">
      <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn" id="sSave">Simpan</button><button class="btn ghost" id="sTest">Uji sambungan</button><button class="btn ghost" id="sSync">Segerak sekarang</button></div>
      <div class="mute" style="margin-top:8px">${st.lastSync ? "Segerak terakhir: " + new Date(st.lastSync).toLocaleString("ms-MY") : "Belum pernah segerak."}</div></div>
      <div class="card form"><h3>Data</h3><div class="row" style="flex-wrap:wrap"><button class="btn ghost" id="exp">Eksport JSON</button><button class="btn ghost" id="imp">Import JSON</button><input type="file" id="impFile" accept=".json,application/json" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"><button class="btn ghost" id="restore">Pulihkan sandaran</button><button class="btn danger" id="wipe">Padam semua data</button></div></div>
      <div class="mute" style="text-align:center">Money Planner v3</div>`;
  },
};

function render() {
  const titles = { rekod: "Rekod", kalendar: "Kalendar", akaun: "Akaun", analisis: "Analisis", lagi: "Lagi" };
  $("#title").textContent = titles[tab];
  const [y, m] = ym.split("-");
  const showMonth = !["akaun", "lagi"].includes(tab);
  $("#monthLbl").textContent = showMonth ? `${BULAN[+m - 1]} ${y}` : "";
  $("#prevM").style.visibility = $("#nextM").style.visibility = showMonth ? "visible" : "hidden";
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  $("#view").innerHTML = views[tab]();
}

// ---------- Kemasukan (keypad) ----------
function openEntry(tx, date) {
  const isNew = !tx;
  const d = tx ? { ...tx } : { id: uid(), type: "Belanja", amount: 0, category: "", account: S.accounts[0]?.id, toAccount: S.accounts[1]?.id, date: date || todayIso(), note: "" };
  let expr = d.amount ? String(d.amount) : "";
  const sh = $("#sheet");
  const draw = () => {
    const cats = S.categories.filter((c) => c.type === d.type);
    if (d.type !== "Pindah" && !cats.some((c) => c.id === d.category)) d.category = cats[0]?.id || "";
    const accOpts = (sel) => S.accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${a.emoji} ${esc(a.name)}</option>`).join("");
    sh.innerHTML = `<div class="shead"><button class="x" data-k="close">✕</button><div class="types">${["Belanja", "Pendapatan", "Pindah"].map((t) => `<button data-type="${t}" class="${d.type === t ? "on" : ""}">${t}</button>`).join("")}</div><button class="x" data-k="ok">✓</button></div>
      ${d.type === "Pindah" ? `<div class="form" style="padding:12px;flex:1"><label>Dari akaun</label><select id="eFrom">${accOpts(d.account)}</select><label>Ke akaun</label><select id="eTo">${accOpts(d.toAccount)}</select></div>`
      : `<div class="cats">${cats.map((c) => `<button data-c="${c.id}" class="${c.id === d.category ? "on" : ""}"><span>${c.emoji}</span>${esc(c.name)}</button>`).join("")}</div>`}
      <div class="pad">
        ${d.type === "Pindah" ? `<div class="op" style="border-radius:999px;display:grid;place-items:center;font-size:22px">🔁</div>` : `<select id="eAcc" class="op" style="border-radius:999px;height:46px;border:0;padding:0 6px;font-size:13px">${accOpts(d.account)}</select>`}
        <div class="disp"><input id="eNote" placeholder="Nota" value="${esc(d.note)}"><b id="eAmt">${esc(expr || "0")}</b></div>
        <input type="date" id="eDate" value="${d.date}"><button class="op" data-k="today" style="font-size:14px">HARI INI</button>
        ${isNew ? `<button class="op" data-k="back">⌫</button>` : `<button class="op" data-k="del" style="font-size:18px">🗑️</button>`}<button class="ok" data-k="ok">✓</button>
        <button class="op" data-k="×">×</button><button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button>
        <button class="op" data-k="÷">÷</button><button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button>
        <button class="op" data-k="-">−</button><button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button>
        <button class="op" data-k="+">+</button><button data-k=".">.</button><button data-k="0">0</button><button class="op" data-k="${isNew ? "clear" : "back"}">${isNew ? "C" : "⌫"}</button>
      </div>`;
  };
  const grab = () => { d.note = $("#eNote").value; d.date = $("#eDate").value || todayIso(); if ($("#eAcc")) d.account = $("#eAcc").value; if ($("#eFrom")) { d.account = $("#eFrom").value; d.toAccount = $("#eTo").value; } };
  sh.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.type) { grab(); d.type = b.dataset.type; return draw(); }
    if (b.dataset.c) { grab(); d.category = b.dataset.c; return draw(); }
    const k = b.dataset.k; if (!k) return;
    if (k === "close") return closeSheet();
    if (k === "today") { $("#eDate").value = todayIso(); return; }
    if (k === "del") { if (confirm("Padam transaksi ini?")) { S.txs = S.txs.filter((t) => t.id !== d.id); S.deleted.push({ kind: "tx", id: d.id }); save(); closeSheet(); render(); toast("Dipadam"); } return; }
    if (k === "ok") {
      grab(); const amt = C.evalKeypad(expr);
      if (!(amt > 0)) return toast("Masukkan jumlah");
      if (d.type === "Pindah" && d.account === d.toAccount) return toast("Pilih akaun berbeza");
      if (d.type !== "Pindah" && !d.category) return toast("Pilih kategori");
      const rec = { ...d, amount: amt, updatedAt: now() }; if (rec.type !== "Pindah") rec.toAccount = ""; else rec.category = "";
      S.txs = S.txs.filter((t) => t.id !== d.id).concat(rec); save(); closeSheet();
      ym = rec.date.slice(0, 7); selDay = rec.date; render(); return toast("Disimpan");
    }
    if (k === "back") expr = expr.slice(0, -1);
    else if (k === "clear") expr = "";
    else if (/[+\-×÷]/.test(k)) { if (expr && !/[+\-×÷]$/.test(expr)) expr += k; else if (expr) expr = expr.slice(0, -1) + k; }
    else expr += k;
    $("#eAmt").textContent = expr || "0";
  };
  draw(); sh.classList.remove("hidden");
}
const closeSheet = () => { const s = $("#sheet"); s.classList.add("hidden"); s.innerHTML = ""; s.onclick = null; };

// Borang ringkas (akaun / kategori / bajet)
function openForm(title, fields, onSave, onDelete) {
  const sh = $("#sheet");
  sh.innerHTML = `<div class="shead"><button class="x" data-f="close">✕</button><b>${esc(title)}</b><button class="x" data-f="ok">✓</button></div><div class="form" style="padding:12px">${fields.map((f) => `<label>${f.label}</label>${f.options ? `<select id="f_${f.k}">${f.options.map((o) => `<option ${o === f.v ? "selected" : ""}>${o}</option>`).join("")}</select>` : `<input id="f_${f.k}" type="${f.type || "text"}" ${f.type === "number" ? 'step="0.01" inputmode="decimal"' : ""} value="${esc(f.v ?? "")}">`}`).join("")}
    ${onDelete ? `<button class="btn danger" data-f="del" style="margin-top:18px">Padam</button>` : ""}</div>`;
  sh.onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; const f = b.dataset.f;
    if (f === "close") return closeSheet();
    if (f === "del") { if (confirm("Padam?")) { onDelete(); save(); closeSheet(); render(); } return; }
    const vals = {}; fields.forEach((x) => (vals[x.k] = $("#f_" + x.k).value.trim()));
    if (onSave(vals) !== false) { save(); closeSheet(); render(); toast("Disimpan"); } };
  sh.classList.remove("hidden");
}
function editAccount(id) {
  const a = S.accounts.find((x) => x.id === id) || { id: uid(), name: "", emoji: "💳", opening: 0 };
  const used = S.txs.some((t) => t.account === a.id || t.toAccount === a.id);
  openForm(id === "new" ? "Akaun baru" : "Ubah akaun", [{ k: "name", label: "Nama", v: a.name }, { k: "emoji", label: "Emoji", v: a.emoji }, { k: "opening", label: "Baki permulaan (RM)", v: a.opening, type: "number" }],
    (v) => { if (!v.name) { toast("Isi nama"); return false; } Object.assign(a, { name: v.name, emoji: v.emoji || "💳", opening: C.round2(v.opening), updatedAt: now() }); S.accounts = S.accounts.filter((x) => x.id !== a.id).concat(a); },
    id !== "new" ? () => { if (used) { alert("Akaun ini ada transaksi. Padam transaksi dahulu."); return; } S.accounts = S.accounts.filter((x) => x.id !== a.id); S.deleted.push({ kind: "account", id: a.id }); } : null);
}
function editCategory(id) {
  const c = S.categories.find((x) => x.id === id) || { id: uid(), name: "", emoji: "🏷️", type: "Belanja" };
  openForm(id === "new" ? "Kategori baru" : "Ubah kategori", [{ k: "name", label: "Nama", v: c.name }, { k: "emoji", label: "Emoji", v: c.emoji }, { k: "type", label: "Jenis", v: c.type, options: ["Belanja", "Pendapatan"] }],
    (v) => { if (!v.name) { toast("Isi nama"); return false; } Object.assign(c, { name: v.name, emoji: v.emoji || "🏷️", type: v.type, updatedAt: now() }); S.categories = S.categories.filter((x) => x.id !== c.id).concat(c); },
    id !== "new" ? () => { if (S.txs.some((t) => t.category === c.id)) { alert("Kategori ini ada transaksi. Tukar nama sahaja."); return; } S.categories = S.categories.filter((x) => x.id !== c.id); S.deleted.push({ kind: "category", id: c.id }); } : null);
}
function editBudget(catId) {
  const c = catOf(catId); const b = S.budgets.find((x) => x.category === catId) || { id: "bud_" + catId, category: catId, amount: 0 };
  openForm(`Bajet bulanan: ${c.emoji} ${c.name}`, [{ k: "amount", label: "Jumlah sebulan (RM, 0 = tiada)", v: b.amount || "", type: "number" }],
    (v) => { b.amount = C.round2(v.amount); b.updatedAt = now(); S.budgets = S.budgets.filter((x) => x.id !== b.id).concat(b); });
}

// ---------- Segerak Google Sheet ----------
const ENT = { tx: ["txs", "list", "upsert", "delete"], account: ["accounts", "accountsList", "accountUpsert", "accountDelete"], category: ["categories", "categoriesList", "categoryUpsert", "categoryDelete"], budget: ["budgets", "budgetsList", "budgetUpsert", "budgetDelete"] };
let syncTimer, syncing = false;
function scheduleSync() { if (!S.settings.webAppUrl || !S.settings.accessKey) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), 2500); }
async function syncNow(loud) {
  const st = S.settings; if (!st.webAppUrl || !st.accessKey) { if (loud) toast("Isi URL dan kunci dahulu"); return; }
  if (syncing) return; syncing = true;
  try {
    for (const del of [...S.deleted]) { await callApi(st, ENT[del.kind][3], { id: del.id }); S.deleted = S.deleted.filter((x) => x !== del); }
    for (const [kind, [prop, listA, upA]] of Object.entries(ENT)) {
      const remote = (await callApi(st, listA)).items || [];
      const map = {}; for (const r of remote) map[r.id] = r;
      const merged = {}; for (const l of S[prop]) merged[l.id] = l;
      for (const r of remote) { const l = merged[r.id]; if (!l || String(r.updatedAt) > String(l.updatedAt)) merged[r.id] = normalize(kind, r); }
      const push = S[prop].filter((l) => !map[l.id] || String(l.updatedAt) > String(map[l.id].updatedAt));
      for (const item of push) await callApi(st, upA, { item });
      S[prop] = Object.values(merged);
    }
    st.lastSync = now(); persist(); render(); if (loud) toast("Segerak berjaya ✓");
  } catch (e) { if (loud) toast(e.code === "unauthorized" ? "Kunci salah" : e.code === "network" ? "Tiada sambungan" : "Gagal: " + e.code); }
  finally { syncing = false; }
}
function normalize(kind, r) { const o = { ...r }; for (const k of ["amount", "opening"]) if (k in o) o[k] = Number(o[k]) || 0; return o; }

// ---------- Acara ----------
$("#tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; render(); scrollTo(0, 0); } };
$("#prevM").onclick = () => { ym = C.shiftMonth(ym, -1); render(); };
$("#nextM").onclick = () => { ym = C.shiftMonth(ym, 1); render(); };
$("#fab").onclick = () => openEntry(null, tab === "kalendar" ? selDay : ym === todayIso().slice(0, 7) ? todayIso() : ym + "-01");
$("#view").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return; const ds = b.dataset;
  if (ds.tx) openEntry(S.txs.find((t) => t.id === ds.tx));
  else if (ds.day) { selDay = ds.day; render(); }
  else if (ds.addon) openEntry(null, ds.addon);
  else if (ds.acc) editAccount(ds.acc);
  else if (ds.transfer) openEntry({ id: uid(), type: "Pindah", amount: 0, account: S.accounts[0]?.id, toAccount: S.accounts[1]?.id, date: todayIso(), note: "" });
  else if (ds.ana) { anaMode = ds.ana; render(); }
  else if (ds.lagi) { lagiMode = ds.lagi; render(); }
  else if (ds.bud) editBudget(ds.bud);
  else if (ds.cat) editCategory(ds.cat);
  else if (b.id === "sSave" || b.id === "sTest" || b.id === "sSync") {
    S.settings.webAppUrl = cleanWebAppUrl($("#sUrl").value); S.settings.accessKey = $("#sKey").value.trim(); persist();
    if (b.id === "sSave") toast("Tetapan disimpan");
    if (b.id === "sTest") callApi(S.settings, "ping").then(() => toast("Sambungan OK ✓"), (er) => toast(er.code === "unauthorized" ? "Kunci salah" : "Gagal: " + er.code));
    if (b.id === "sSync") syncNow(true);
  } else if (b.id === "exp") exportData();
  else if (b.id === "imp") { const f = $("#impFile"); f.value = ""; f.click(); }
  else if (b.id === "restore") { if (confirm("Pulihkan data dari sandaran?")) { const r = restoreBackup(localStorage, defaults); if (r) { S = r; render(); toast("Sandaran dipulihkan"); } else toast("Tiada sandaran"); } }
  else if (b.id === "wipe") { if (confirm("Padam SEMUA data dalam telefon ini?")) { const st = S.settings; S = defaults(); S.settings = st; localStorage.setItem(KEY, JSON.stringify(S)); render(); toast("Dipadam. Sandaran masih boleh dipulihkan."); } }
};
async function exportData() {
  const name = `money-planner-${todayIso()}.json`, json = JSON.stringify(S, null, 2);
  const file = new File([json], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && confirm("Kongsi/simpan fail (pilih 'Save to Files')? Batal = muat turun biasa.")) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$("#view").addEventListener("change", async (e) => {
  if (e.target.id !== "impFile") return; const f = e.target.files && e.target.files[0]; if (!f) return;
  let d; try { d = parseImport(await f.text()); } catch (er) { e.target.value = ""; return toast(er.message); }
  if (!confirm("Ganti semua data dalam app ini dengan data dari fail?")) { e.target.value = ""; return; }
  const st = S.settings; S = { ...defaults(), ...d, settings: st.webAppUrl ? st : { ...defaults().settings, ...(d.settings || {}) } };
  save(); render(); toast("Data berjaya diimport");
});
{ const h = location.hash.slice(1); if (views[h]) tab = h; if (h === "bajet") { tab = "analisis"; anaMode = "bajet"; } if (h === "kategori") tab = "lagi"; }
render();
if (boot.recoveredFrom) toast("Data dipulihkan dari " + boot.recoveredFrom);
if (location.hash === "#tambah") openEntry(null);
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
if (S.settings.webAppUrl) setTimeout(() => syncNow(false), 1500);
