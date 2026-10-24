/**
 * Money Planner — backend Google Sheet (pilihan).
 *
 * 1. Buat Google Sheet baru > Extensions > Apps Script. Tampal fail ini ke Code.gs.
 * 2. Tampal appsscript.json (Project Settings > tunjuk fail manifest).
 * 3. Project Settings > Script properties: ACCESS_KEY = kunci rahsia anda.
 * 4. Jalankan fungsi setup sekali (buat tab Transaksi, Akaun, Kategori, Bajet).
 * 5. Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 * 6. Salin URL /exec ke Tetapan dalam app bersama kunci yang sama.
 *
 * POST text/plain JSON: { action, key, ... }. Jawapan { ok: true, ... } atau { ok: false, error }.
 * Tindakan: ping, list, upsert, delete (transaksi),
 *   accountsList, accountUpsert, accountDelete,
 *   categoriesList, categoryUpsert, categoryDelete,
 *   budgetsList, budgetUpsert, budgetDelete.
 */

var ENTITIES = {
  tx: { sheet: "Transaksi", headers: ["id", "date", "type", "amount", "category", "account", "toAccount", "note", "updatedAt"] },
  account: { sheet: "Akaun", headers: ["id", "name", "emoji", "opening", "updatedAt"] },
  category: { sheet: "Kategori", headers: ["id", "name", "emoji", "type", "updatedAt"] },
  budget: { sheet: "Bajet", headers: ["id", "category", "amount", "updatedAt"] }
};

var ACTIONS = {
  list: ["tx", "list"], upsert: ["tx", "upsert"], "delete": ["tx", "delete"],
  accountsList: ["account", "list"], accountUpsert: ["account", "upsert"], accountDelete: ["account", "delete"],
  categoriesList: ["category", "list"], categoryUpsert: ["category", "upsert"], categoryDelete: ["category", "delete"],
  budgetsList: ["budget", "list"], budgetUpsert: ["budget", "upsert"], budgetDelete: ["budget", "delete"]
};

function setup() {
  Object.keys(ENTITIES).forEach(function (k) { sheet_(k); });
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  return json_(route_({ action: p.action || "ping", key: p.key || "" }));
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    return json_(route_(JSON.parse(raw)));
  } catch (err) {
    return json_({ ok: false, error: "bad_request" });
  }
}

function route_(body) {
  if (!isAuthorized_(body.key)) return { ok: false, error: "unauthorized" };
  if (body.action === "ping") return { ok: true, time: new Date().toISOString() };
  var a = ACTIONS[body.action];
  if (!a) return { ok: false, error: "unknown_action" };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (a[1] === "list") return { ok: true, items: readAll_(a[0]) };
    if (a[1] === "upsert") return upsert_(a[0], body.item);
    return remove_(a[0], String(body.id || ""));
  } finally {
    lock.releaseLock();
  }
}

function isAuthorized_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty("ACCESS_KEY") || "";
  return expected !== "" && String(key || "") === expected;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(kind) {
  var def = ENTITIES[kind];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("A:A").setNumberFormat("@");
  }
  return sh;
}

function readAll_(kind) {
  var sh = sheet_(kind), h = ENTITIES[kind].headers, last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, h.length).getDisplayValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}

function upsert_(kind, item) {
  if (!item || !item.id) return { ok: false, error: "missing_id" };
  var sh = sheet_(kind), h = ENTITIES[kind].headers;
  var row = h.map(function (k) { var v = item[k]; return v === undefined || v === null ? "" : v; });
  var at = findRow_(sh, String(item.id));
  var range = at > 0 ? sh.getRange(at, 1, 1, h.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, h.length);
  range.setNumberFormat("@").setValues([row.map(String)]);
  return { ok: true, id: item.id };
}

function remove_(kind, id) {
  var sh = sheet_(kind), at = findRow_(sh, id);
  if (at > 0) sh.deleteRow(at);
  return { ok: true, id: id };
}
