// Prueba de humo: abre index.html en jsdom con una red falsa y ejercita lo importante.  (npm test)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jsdomPkg from "jsdom";

const { JSDOM, VirtualConsole } = jsdomPkg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- datos de prueba ----------
const PRODS = ["6.1 Ductile Rod", "7.0 Wire Rod", "8.0 Ductile Rod", "9.0 Ductile Rod"];
function makeConsignments(nRefs, perRef) {
  const rows = []; let id = 0;
  for (let r = 0; r < nRefs; r++) for (let j = 0; j < perRef; j++) {
    id++; rows.push({ id: "c" + id, referencia: "R81" + String(r).padStart(4, "0"), fecha: "14/08/26", cast_no: "5347" + (r % 5) + "-01", lot_no: String(6260000000 + id), producto: PRODS[(r + j) % 4], peso: 1.45, wo: null, usado: false });
  }
  return rows;
}

// ---------- app en jsdom ----------
function boot(net) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push("jsdomError: " + ((e.detail && e.detail.message) || e.message)));
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://coil-scanner.pages.dev/", virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (url, init) => { calls.push({ url: String(url), init: init || {} }); return net(String(url), init || {}); };
      const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop, set: () => true });
      w.HTMLCanvasElement.prototype.getContext = () => noop;
      w.alert = () => {}; w.confirm = () => true;
      w.prompt = () => null;
    },
  });
  return { w: dom.window, q: (id) => dom.window.document.getElementById(id), calls, errors };
}
const J = (obj, status) => ({ ok: (status || 200) < 300, status: status || 200, json: async () => obj, text: async () => JSON.stringify(obj) });

let CONS = makeConsignments(2, 5), RECS = [], AUTH_OK = true;
function net(url, init) {
  const u = new URL(url, "https://coil-scanner.pages.dev");
  if (u.pathname === "/records") return J(RECS);
  if (u.pathname === "/auth") { const b = JSON.parse(init.body); return b.password === "Clave-OK" && AUTH_OK ? J({ token: "tok123" }) : J({ error: "Contrasena incorrecta" }, 401); }
  if (u.pathname.endsWith("/rest/v1/consignments")) {
    const limit = Math.min(+u.searchParams.get("limit") || 1000, 1000), off = +u.searchParams.get("offset") || 0;
    return J(CONS.slice(off, off + limit));
  }
  if (u.pathname.endsWith("/rest/v1/produccion")) return J([]);
  return J({ ok: true });
}

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.message)); }
}

// =============== 1. carga y consignments ===============
console.log("consignments");
CONS = makeConsignments(77, 18).slice(0, 1342);
RECS = [];
for (let i = 0; i < 40; i++) RECS.push({ id: "r" + i, coil: CONS[i].lot_no, cast: "534735", producto: "COIL REIN 9mm", maquina: i % 2 ? "EVG" : "PITTINI", wo: i < 20 ? "WO-A" : "WO-B", peso: "1.450", created_at: new Date().toISOString() });
RECS.push({ id: "x1", coil: "999000111", cast: "777777", producto: "COIL REIN 7mm", maquina: "EVG", wo: "WO-A", peso: "1.4", created_at: new Date().toISOString() });
const app = boot(net);
const { w, q } = app;
await sleep(500);
const count = (s, re) => (s.match(re) || []).length;

await t("pagina con limit/offset y trae los 1342", async () => {
  await w.loadConsignments();
  assert.equal(w.eval("_consignments.length"), 1342);
  assert.ok(app.calls.filter((c) => c.url.includes("/rest/v1/consignments")).length >= 3);
});
await t("KPIs: 1342 total, 40 escaneados, 1302 faltantes", async () => {
  w.eval("records=" + JSON.stringify(RECS));
  w.renderSavedCons();
  assert.equal([q("cons-total-n").textContent, q("cons-match-n").textContent, q("cons-miss-n").textContent].join("|"), "1342|40|1302");
});
await t("Por producto: sin tarjetas repetidas y con el total de consignments en el titulo", async () => {
  const hdr = q("cons-by-prod-list").parentElement.querySelector(".cons-hdr").textContent;
  assert.match(hdr, /\d+ consignments · 1342 coils/);
  assert.equal(q("cons-by-prod-list").children.length, 4);
});
await t("Estado de Consignments (tab): 10 a la vez, 'Ver mas' suma 10, 'Todos' muestra todos", async () => {
  w.eval("_consStatusShown={dash:10,tab:10}"); w.renderSavedCons();
  assert.equal(count(q("saved-cons-list").textContent, /Ref: /g), 10);
  assert.match(q("saved-cons-list").textContent, /Ver 10 mas \(\d+ restantes\)/);
  w.consStatusMore("tab"); assert.equal(count(q("saved-cons-list").textContent, /Ref: /g), 20);
  w.consStatusMore("tab", true); assert.equal(count(q("saved-cons-list").textContent, /Ref: /g), 75);
});
await t("Consignments SIN escanear: 10 maximo, click para ver mas", async () => {
  w.eval("_xcMissShown=10;_xcExtraShown=10"); w.runCrossCheck();
  const mono = () => count(q("cross-check-list").innerHTML, /font-family:monospace/g);
  assert.equal(mono(), 11);                       // 10 faltantes + 1 extra
  assert.match(q("cross-check-list").textContent, /SIN escanear \(1302\)/);
  w.xcMore("miss"); assert.equal(mono(), 21);
  w.xcMore("miss", true); assert.equal(mono(), 1303);
});
await t("si falla la recarga NO borra lo que ya estaba y muestra el error", async () => {
  const good = w.fetch;
  w.fetch = async () => J({ message: "boom" }, 500);
  await w.loadConsignments();
  assert.equal(w.eval("_consignments.length"), 1342);
  assert.match(q("saved-cons-list").textContent, /No se pudieron cargar.*HTTP 500/);
  w.fetch = good;
});

// =============== 2. dashboard ===============
console.log("dashboard");
await t("renderDash no se rompe y muestra Estado de Consignments (10 mas nuevos primero)", async () => {
  await w.loadConsignments();
  w.renderDash();
  const txt = q("db-cons-summary").textContent;
  assert.equal(count(txt, /Ref: /g), 10);
  assert.match(txt, /Ref: R810074/);
  assert.ok(q("tbl-body").children.length > 0);
});
await t("Pivot: encabezados de WO y Total centrados como los numeros", async () => {
  w.renderPivot2(RECS);
  const th = [...q("pivot-tbl").querySelectorAll("thead th")].map((h) => h.style.textAlign || "left");
  assert.equal(th.join(","), "left,center,center,center");
});
await t("Progreso por Cast muestra el consignment de cada cast", async () => {
  w.renderCastProgressDB(RECS);
  const txt = q("db-cast-prog").textContent;
  assert.match(txt, /Cast: 534735.*Consignment: R810000 \(18\), R810001 \(18\), R810002 \(4\)/);
  assert.match(txt, /Cast: 777777.*sin consignment/);
});
await t("meta de coils por cast configurable y persistente", async () => {
  w.prompt = () => "30"; w.editCastTarget();
  assert.equal(w.eval("CFG.castTarget"), 30);
  assert.equal(JSON.parse(w.localStorage.getItem("coil_cfg")).castTarget, 30);
  assert.match(q("cast-target-lbl").textContent, /meta: 30 coils/);
  assert.match(q("db-cast-prog").textContent, /\/30/);
  w.eval("CFG.castTarget=48");
});

// =============== 3. verificacion al escanear ===============
console.log("verificacion contra consignments");
const fld = (c) => [c.lot_no, c.cast_no.split("-")[0], "1.450", parseFloat(c.producto) + "mm"];
await t("coil correcto: ok y sin advertencias", async () => {
  const v = w.consVerify(...fld(CONS[100]));
  assert.equal(v.state, "ok"); assert.equal(v.warnings.length, 0);
});
await t("avisa diferencia de peso, cast distinto y producto distinto", async () => {
  const c = CONS[100]; const v = w.consVerify(c.lot_no, "111111", "1.480", "9mm");
  assert.equal(v.state, "ok");
  assert.ok(v.warnings.some((x) => /^Peso/.test(x)) && v.warnings.some((x) => /^Cast/.test(x)));
});
await t("un digito mal leido: sugiere el coil correcto", async () => {
  const orig = CONS[500].lot_no; const bad = orig.slice(0, 4) + "9" + orig.slice(5);
  const v = w.consVerify(bad, CONS[500].cast_no.split("-")[0], "1.450", "");
  assert.equal(v.state, "suggest"); assert.equal(v.suggestions[0].c.lot_no, orig); assert.equal(v.suggestions[0].dist, 1);
});
await t("coil ilegible: busca por cast y peso", async () => {
  const v = w.consVerify("", CONS[600].cast_no.split("-")[0], "1.450", "");
  assert.equal(v.state, "suggest"); assert.equal(v.suggestions[0].why, "cast y peso");
});
await t("coil que no se parece a nada: no inventa sugerencias", async () => {
  assert.equal(w.consVerify("1234567890", "", "", "").state, "nomatch");
});
await t("los ya escaneados no se sugieren (serian duplicados)", async () => {
  const done = CONS[3].lot_no; const bad = done.slice(0, 4) + "9" + done.slice(5);
  const v = w.consVerify(bad, "", "", "");
  assert.ok(!v.suggestions.some((s) => s.c.lot_no === done));
});
await t("la tarjeta se actualiza al escribir y el boton corrige el coil", async () => {
  const d = w.document;
  d.body.insertAdjacentHTML("beforeend", '<input id="t-coil"><input id="t-cast"><input id="t-peso"><input id="t-prod"><div id="t-box"></div>');
  const orig = CONS[700].lot_no, bad = orig.slice(0, 4) + "9" + orig.slice(5);
  w.attachConsVerify("t-box", { coil: "t-coil", cast: "t-cast", peso: "t-peso", producto: "t-prod" }, false);
  d.getElementById("t-cast").value = CONS[700].cast_no.split("-")[0];
  const coil = d.getElementById("t-coil"); coil.value = bad; coil.dispatchEvent(new w.Event("input"));
  const btn = d.querySelector("#t-box button[data-lot]");
  assert.ok(btn && btn.dataset.lot === orig, "boton de sugerencia");
  w.applyConsSuggestion(btn);
  assert.equal(coil.value, orig); assert.match(d.getElementById("t-box").textContent, /En consignment Ref/);
});

// =============== 4. autenticacion ===============
console.log("autenticacion (contrasena en el servidor)");
await t("el codigo del navegador ya no contiene la contrasena", async () => { assert.ok(!/['"]Machine['"]/.test(html)); });
await t("contrasena incorrecta: mensaje y sigue bloqueado", async () => {
  w.document.getElementById("pwd-inp").value = "mala"; await w.checkPassword();
  assert.equal(q("pwd-err").textContent, "Contrasena incorrecta"); assert.equal(w.eval("_unlocked"), false);
});
await t("contrasena correcta: guarda el token y ejecuta la accion pendiente UNA vez", async () => {
  let ran = 0; w.requirePassword("test", () => { ran++; });
  q("pwd-inp").value = "Clave-OK"; await w.checkPassword();
  assert.equal(w.eval("_unlocked"), true); assert.equal(w.eval("_authToken"), "tok123"); assert.equal(ran, 1);
});
await t("las escrituras llevan el token y un 401 vuelve a bloquear", async () => {
  const good = w.fetch; let seen = null;
  w.fetch = async (u, i) => { seen = i.headers; return J({ error: "No autorizado" }, 401); };
  const r = await w.authFetch("/delete?id=1", { method: "DELETE" });
  assert.equal(seen.Authorization, "Bearer tok123"); assert.equal(r.status, 401);
  assert.equal(w.eval("_unlocked"), false); assert.equal(w.eval("_authToken"), "");
  w.fetch = good;
});

// =============== 5. reporte para el proveedor ===============
console.log("reporte");
await t("faltantes, diferencias de peso, cast distinto y sin consignment", async () => {
  const recs = [
    { coil: CONS[0].lot_no, cast: CONS[0].cast_no.split("-")[0], peso: "1.450" },   // ok
    { coil: CONS[1].lot_no, cast: CONS[1].cast_no.split("-")[0], peso: "1.480" },   // +30 kg
    { coil: CONS[2].lot_no, cast: "999999", peso: "1.450" },                          // cast distinto
    { coil: "888000999", cast: "1", peso: "1.4", producto: "COIL REIN 7mm", created_at: new Date().toISOString() },
  ];
  w.eval("records=" + JSON.stringify(recs));
  const rep = w.buildConsReport("");
  const by = (n) => rep.sheets.find((s) => s.name === n).rows;
  assert.equal(by("Faltantes").length - 1, 1342 - 3);
  assert.equal(by("Diferencias de peso").length - 1, 1); assert.equal(by("Diferencias de peso")[1][7], 30);
  assert.equal(by("Cast distinto").length - 1, 1);
  assert.equal(by("Escaneados sin consignment").length - 1, 1);
  assert.equal(by("Resumen").length - 1, 75);
  const one = w.buildConsReport(CONS[0].referencia);
  assert.ok(!one.sheets.some((s) => s.name === "Escaneados sin consignment"));
  assert.equal(one.sheets.find((s) => s.name === "Faltantes").rows.length - 1, 18 - 3);
});
await t("la tolerancia de peso es configurable (en kilos)", async () => {
  w.prompt = () => "50"; w.editPesoTol();
  assert.equal(w.eval("CFG.pesoTol"), 0.05);
  assert.equal(w.buildConsReport("").sheets.find((s) => s.name === "Diferencias de peso").rows.length - 1, 0);
  w.eval("CFG.pesoTol=0.010");
});
await t("exporta un .xlsx con una hoja por tema", async () => {
  w.XLSX = { utils: { book_new: () => ({ sheets: [] }), aoa_to_sheet: (rows) => ({ rows }), book_append_sheet: (wb, ws, name) => wb.sheets.push(name) }, writeFile: (wb, name) => { w.__out = { wb, name }; } };
  await w.exportConsReport();
  assert.match(w.__out.name, /^Reporte_consignments_\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.equal(w.__out.wb.sheets.join("|"), "Resumen|Faltantes|Diferencias de peso|Cast distinto|Escaneados sin consignment");
});

// =============== 6. lectura del texto del PDF ===============
console.log("PDF por texto");
function pageItems(rows, extra) {
  const it = []; let y = 780;
  const put = (s, x, yy) => it.push({ s, x, y: yy + (Math.random() - 0.5) });   // ruido de +-0.5 en y, como en un PDF real
  put("Pacific Steel Reference", 40, y); put("R810242355", 180, y); y -= 16;
  put("DATE", 40, y); put("14/08/26", 90, y); y -= 30;
  ["Cast No", "Lot no", "Product", "Weight/tns"].forEach((h, i) => put(h, 40 + i * 110, y)); y -= 18;
  rows.forEach((r) => { put(r.cast, 40, y); put(r.lot, 150, y); put(r.prod, 260, y); put(r.w, 370, y); y -= 14; });
  (extra || []).forEach((s) => { put(s, 40, y); y -= 14; });
  return it;
}
const R3 = [{ cast: "534735-01", lot: "6261990075", prod: "9.0 Ductile Rod", w: "1.435" }, { cast: "534735-01", lot: "6261990076", prod: "9.0 Ductile Rod", w: "1.440" }, { cast: "534736-02", lot: "6261990077", prod: "8.5 Wire Rod", w: "1,398" }];
await t("lee referencia, fecha y cada fila (celdas sueltas, con ruido de posicion)", async () => {
  const p = w.parseConsPageItems(pageItems(R3));
  assert.equal(p.rows.length, 3); assert.equal(p.ref, "R810242355"); assert.equal(p.fecha, "14/08/26");
  assert.deepEqual(JSON.parse(JSON.stringify(p.rows[0])), { referencia: "R810242355", fecha: "14/08/26", cast_no: "534735-01", lot_no: "6261990075", producto: "9.0 Ductile Rod", peso: 1.435 });
  assert.equal(p.rows[2].producto, "8.5 Wire Rod"); assert.equal(p.rows[2].peso, 1.398);
});
await t("pagina escaneada (sin texto): devuelve null y cae a la IA", async () => { assert.equal(w.parseConsPageItems([]), null); });
await t("si sobra un lote sin leer, no se fia y cae a la IA", async () => {
  assert.equal(w.parseConsPageItems(pageItems(R3, ["534737-01 6261990099 9.0 Ductile Rod"])), null);   // fila sin peso
});
await t("peso fuera de rango: no se fia", async () => {
  assert.equal(w.parseConsPageItems(pageItems([{ cast: "534735-01", lot: "6261990075", prod: "9.0 Ductile Rod", w: "143.500" }].concat(R3))), null);
});

// =============== 7. tiempo real ===============
console.log("tiempo real");
await t("se conecta, muestra el punto verde y refresca una sola vez ante una rafaga de cambios", async () => {
  const handlers = {}; let statusCb = null;
  w.supabase = { createClient: () => ({ channel: () => { const ch = { on: (_t, f, cb) => { handlers[f.table] = cb; return ch; }, subscribe: (cb) => { statusCb = cb; return ch; } }; return ch; } }) };
  w.startRealtime(); statusCb("SUBSCRIBED");
  assert.equal(w.eval("_rtOk"), true); assert.equal(q("live-dot").style.background, "rgb(52, 199, 89)");
  const before = app.calls.filter((c) => c.url.endsWith("/records")).length;
  handlers.etiquetas(); handlers.etiquetas(); handlers.etiquetas();
  await sleep(1600);
  assert.equal(app.calls.filter((c) => c.url.endsWith("/records")).length - before, 1);
  statusCb("CLOSED"); assert.equal(w.eval("_rtOk"), false); assert.equal(q("live-dot").style.background, "rgb(199, 199, 204)");
});

console.log("\n" + passed + " ok, " + failed + " con error");
if (app.errors.length) { console.log("Errores no capturados en la pagina:\n  " + app.errors.join("\n  ")); failed++; }
process.exit(failed ? 1 : 0);
