// Prueba las Cloudflare Functions contra un "Supabase" falso en memoria (PostgREST minimo).
import assert from "node:assert/strict";
import { issueToken } from "../lib/auth.js";

const ENV = { AUTH_SECRET: "secreto-de-prueba", EDIT_PASSWORD: "Clave-Test-1", SUPABASE_SERVICE_KEY: "eyJ.service.key", ANTHROPIC_KEY: "x" };

// ---------- Supabase falso ----------
function makeDb(opts) {
  opts = opts || {};
  const db = { etiquetas: [], consignments: [], produccion: [], maxRows: opts.maxRows || 1000, uniqueLot: opts.uniqueLot !== false, raceOnce: false, seq: 1, calls: [] };
  globalThis.fetch = async function (url, init) {
    init = init || {};
    const u = new URL(url);
    const table = u.pathname.split("/").pop();
    const method = (init.method || "GET").toUpperCase();
    const headers = init.headers || {};
    db.calls.push({ method, url: String(url), headers });
    if (!db[table]) return new Response("{}", { status: 404 });
    const rows = db[table];
    const match = function (row) {
      for (const [k, v] of u.searchParams) {
        if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
        if (v.startsWith("eq.")) { if (String(row[k]) !== decodeURIComponent(v.slice(3))) return false; }
        else if (v === "is.null") { if (row[k] !== null && row[k] !== undefined) return false; }
      }
      return true;
    };
    const R = (obj, status) => new Response(status === 204 ? null : (typeof obj === "string" ? obj : JSON.stringify(obj)), { status: status || 200 });
    if (method === "GET") {
      const limit = Math.min(parseInt(u.searchParams.get("limit") || "1000", 10), db.maxRows);
      const off = parseInt(u.searchParams.get("offset") || "0", 10);
      return R(rows.filter(match).slice(off, off + limit));
    }
    if (method === "POST") {
      const items = [].concat(JSON.parse(init.body));
      const onConflict = u.searchParams.get("on_conflict");
      if (onConflict && !db.uniqueLot) return R({ code: "42P10" }, 400);
      for (const it of items) {
        if (table === "etiquetas" && it.coil && (rows.some(r => r.coil === it.coil) || db.raceOnce)) { db.raceOnce = false; return R({ code: "23505" }, 409); }
        if (table === "consignments" && db.uniqueLot && it.lot_no && rows.some(r => r.lot_no === it.lot_no)) {
          if (String(headers.Prefer || "").includes("ignore-duplicates")) continue;
          return R({ code: "23505" }, 409);
        }
        rows.push(Object.assign({ id: "id" + db.seq++, created_at: new Date(2026, 8, 1, 0, 0, db.seq).toISOString() }, it));
      }
      return R("", 201);
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init.body);
      const targets = rows.filter(match);
      if (patch.coil && rows.some(r => r.coil === patch.coil && !targets.includes(r))) return R({ code: "23505" }, 409);
      targets.forEach(r => Object.assign(r, patch));
      return R("", 204);
    }
    if (method === "DELETE") {
      const keep = rows.filter(r => !match(r));
      rows.length = 0; keep.forEach(r => rows.push(r));
      return R("", 204);
    }
    return R("{}", 405);
  };
  return db;
}

const call = async function (mod, method, path, body, token) {
  const handler = (await import("../functions/" + mod + ".js"))["onRequest" + method[0] + method.slice(1).toLowerCase()];
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const request = new Request("https://app.test" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const resp = await handler({ request, env: ENV });
  let data = null; try { data = await resp.json(); } catch (e) {}
  return { status: resp.status, data };
};

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.message)); }
}

const token = await issueToken(ENV);
const expired = await issueToken(ENV, -10);
const forged = token.split(".")[0] + ".AAAA";

console.log("auth");
await t("sin EDIT_PASSWORD configurado responde 503", async () => {
  const h = (await import("../functions/auth.js")).onRequestPost;
  const r = await h({ request: new Request("https://a.test/auth", { method: "POST", body: JSON.stringify({ password: "x" }) }), env: {} });
  assert.equal(r.status, 503);
});
await t("contrasena incorrecta -> 401", async () => { assert.equal((await call("auth", "POST", "/auth", { password: "mala" })).status, 401); });
await t("contrasena correcta -> token que sirve", async () => {
  const r = await call("auth", "POST", "/auth", { password: ENV.EDIT_PASSWORD });
  assert.equal(r.status, 200); assert.ok(r.data.token && r.data.token.includes("."));
});

console.log("delete / updatewo / produccion (admin)");
await t("delete sin token, token vencido y token falsificado -> 401", async () => {
  makeDb();
  for (const tk of [undefined, expired, forged]) assert.equal((await call("delete", "DELETE", "/delete?id=abc", undefined, tk)).status, 401);
});
await t("delete con token borra el registro y el filtro es por id", async () => {
  const db = makeDb(); db.etiquetas.push({ id: "abc", coil: "111" }, { id: "def", coil: "222" });
  const r = await call("delete", "DELETE", "/delete?id=abc", undefined, token);
  assert.equal(r.status, 200); assert.deepEqual(db.etiquetas.map(x => x.id), ["def"]);
});
await t("delete rechaza ids raros (inyeccion en el filtro)", async () => {
  makeDb(); assert.equal((await call("delete", "DELETE", "/delete?id=1%26coil%3Dneq.x", undefined, token)).status, 400);
});
await t("updatewo cambia solo los campos enviados", async () => {
  const db = makeDb(); db.etiquetas.push({ id: "a1", coil: "100", wo: null, peso: "1.400", cast: "5" });
  const r = await call("updatewo", "POST", "/updatewo", { id: "a1", wo: "WO-9" }, token);
  assert.equal(r.status, 200); assert.equal(db.etiquetas[0].wo, "WO-9"); assert.equal(db.etiquetas[0].peso, "1.400");
});
await t("updatewo sin token -> 401; peso invalido -> 400; coil repetido -> 409", async () => {
  const db = makeDb(); db.etiquetas.push({ id: "a1", coil: "100" }, { id: "a2", coil: "200" });
  assert.equal((await call("updatewo", "POST", "/updatewo", { id: "a1", wo: "x" })).status, 401);
  assert.equal((await call("updatewo", "POST", "/updatewo", { id: "a1", peso: "abc" }, token)).status, 400);
  assert.equal((await call("updatewo", "POST", "/updatewo", { id: "a1", coil: "200" }, token)).status, 409);
});
await t("produccion exige token y valida toneladas", async () => {
  const db = makeDb();
  assert.equal((await call("produccion", "POST", "/produccion", { wo: "W", toneladas_producidas: 5 })).status, 401);
  assert.equal((await call("produccion", "POST", "/produccion", { wo: "W", toneladas_producidas: -1 }, token)).status, 400);
  assert.equal((await call("produccion", "POST", "/produccion", { wo: "W", toneladas_producidas: 12.5 }, token)).status, 200);
  assert.equal(db.produccion.length, 1);
});
await t("extractpdf sin token -> 401 (no gasta la API)", async () => {
  assert.equal((await call("extractpdf", "POST", "/extractpdf", { imageBase64: "AAAA" })).status, 401);
});

console.log("save (operarios, sin contrasena)");
await t("guarda, valida y rechaza duplicados", async () => {
  const db = makeDb();
  const ok = await call("save", "POST", "/save", { coil: "6260300548", cast: "530736", peso: "1,460", producto: "COIL REIN 6.1mm", maquina: "EVG", wo: "WO1" });
  assert.equal(ok.status, 200);
  assert.equal(db.etiquetas[0].peso, "1.460"); assert.equal(db.etiquetas[0].maquina, "EVG");
  assert.equal((await call("save", "POST", "/save", { coil: "6260300548" })).status, 409);
  assert.equal((await call("save", "POST", "/save", { coil: "x y" })).status, 400);
  assert.equal((await call("save", "POST", "/save", {})).status, 400);
});
await t("dos operarios a la vez: el UNIQUE de la base devuelve 409 y se responde como duplicado", async () => {
  const db = makeDb(); db.etiquetas.push({ id: "z", coil: "999", cast: "1" });
  // el pre-chequeo no lo ve (carrera) pero el insert choca con el UNIQUE
  const realFetch = globalThis.fetch; let first = true;
  globalThis.fetch = async (u, i) => { if (first && (!i || !i.method || i.method === "GET")) { first = false; return new Response("[]", { status: 200 }); } return realFetch(u, i); };
  const r = await call("save", "POST", "/save", { coil: "999" });
  assert.equal(r.status, 409); assert.equal(r.data.duplicate, true);
});
await t("usa la service key del entorno", async () => {
  const db = makeDb(); await call("save", "POST", "/save", { coil: "12345" });
  assert.ok(db.calls.every(c => c.headers.apikey === ENV.SUPABASE_SERVICE_KEY));
});

console.log("records");
await t("trae TODO aunque pasen de 500/1000 y el servidor limite la pagina", async () => {
  for (const max of [1000, 500]) {
    const db = makeDb({ maxRows: max });
    for (let i = 0; i < 2600; i++) db.etiquetas.push({ id: "r" + i, coil: String(1e9 + i), maquina: "EVG" });
    const h = (await import("../functions/records.js")).onRequestGet;
    const resp = await h({ request: new Request("https://a.test/records"), env: ENV });
    const data = await resp.json();
    assert.equal(data.length, 2600, "max-rows " + max);
  }
});
await t("pide la columna maquina y no pide imagen_b64", async () => {
  const db = makeDb(); db.etiquetas.push({ id: "1", coil: "1" });
  const h = (await import("../functions/records.js")).onRequestGet; await h({ request: new Request("https://a.test/records"), env: ENV });
  assert.ok(db.calls[0].url.includes("maquina") && !db.calls[0].url.includes("imagen_b64"));
});

console.log("consignments (admin)");
await t("carga, ignora duplicados (UNIQUE) y valida", async () => {
  const db = makeDb();
  const rows = [{ referencia: "R1", lot_no: "6260000001", peso: 1.4, producto: "9.0 Ductile Rod" }, { referencia: "R1", lot_no: "6260000002", peso: "1.45" }, { lot_no: "mal lote" }];
  assert.equal((await call("consignments", "POST", "/consignments", { rows })).status, 401);
  const r = await call("consignments", "POST", "/consignments", { rows }, token);
  assert.equal(r.status, 200); assert.equal(r.data.sent, 2); assert.equal(r.data.skipped, 1);
  await call("consignments", "POST", "/consignments", { rows: [rows[0]] }, token);
  assert.equal(db.consignments.length, 2);
});
await t("si aun no existe el UNIQUE, cae al insert simple (no rompe)", async () => {
  const db = makeDb({ uniqueLot: false });
  const r = await call("consignments", "POST", "/consignments", { rows: [{ referencia: "R2", lot_no: "777", peso: 1.4 }] }, token);
  assert.equal(r.status, 200); assert.equal(db.consignments.length, 1);
});
await t("borra por id y por referencia (incluida 'Sin ref')", async () => {
  const db = makeDb();
  db.consignments.push({ id: "c1", referencia: "R1", lot_no: "1" }, { id: "c2", referencia: "R1", lot_no: "2" }, { id: "c3", referencia: "R2", lot_no: "3" }, { id: "c4", referencia: null, lot_no: "4" });
  assert.equal((await call("consignments", "DELETE", "/consignments?id=c3")).status, 401);
  await call("consignments", "DELETE", "/consignments?id=c3", undefined, token);
  await call("consignments", "DELETE", "/consignments?ref=R1", undefined, token);
  assert.deepEqual(db.consignments.map(x => x.id), ["c4"]);
  await call("consignments", "DELETE", "/consignments?ref=Sin%20ref", undefined, token);
  assert.equal(db.consignments.length, 0);
});

console.log("\n" + passed + " ok, " + failed + " con error");
process.exit(failed ? 1 : 0);
