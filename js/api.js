// API contract with apps-script/Code.gs
// POST text/plain JSON to the Web App URL. No custom headers (avoids CORS preflight).
// Apps Script answers with a redirect; fetch follows it and reads the JSON body.
//
// Actions: ping, list, upsert, delete (transaksi), accountsList, accountUpsert, accountDelete,
//          categoriesList, categoryUpsert, categoryDelete, budgetsList, budgetUpsert, budgetDelete, listAll
// Body always includes { action, key }.
// Success: { ok: true, ... }  Failure: { ok: false, error }

export function cleanWebAppUrl(value) {
  let url = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  const q = url.indexOf("?");
  if (q >= 0) url = url.slice(0, q);
  url = url.replace(/\/+$/, "");
  return url;
}

export async function callApi(settings, action, extra = {}) {
  let res;
  try {
    res = await fetch(settings.webAppUrl, {
      method: "POST",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, key: settings.accessKey, ...extra }),
    });
  } catch {
    const err = new Error("network");
    err.code = "network";
    throw err;
  }
  let text = "";
  try {
    text = await res.text();
  } catch {
    const err = new Error("bad_response");
    err.code = "bad_response";
    throw err;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error("bad_response");
    err.code = "bad_response";
    throw err;
  }
  if (!data || data.ok !== true) {
    const err = new Error(data?.error || "error");
    err.code = data?.error || "error";
    throw err;
  }
  return data;
}

