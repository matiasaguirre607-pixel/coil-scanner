// Chequeos rapidos antes de publicar: node tools/check.js   (o: npm run check)
// Atrapa justo lo que se rompio antes: funciones que se llaman y no existen, HTML duplicado, ids repetidos, secretos.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import eslintPkg from "eslint";

const { ESLint } = eslintPkg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const problems = [];
const fail = (m) => problems.push(m);

const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const scripts = [...html.matchAll(scriptRe)].map((m) => m[1]);
const js = scripts.join("\n");
const htmlNoScripts = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");

// 1) estructura del HTML
if ((html.match(/<!DOCTYPE/gi) || []).length !== 1) fail("Debe haber exactamente un <!DOCTYPE> (hay " + (html.match(/<!DOCTYPE/gi) || []).length + ")");
if ((html.match(/<html[\s>]/gi) || []).length !== 1) fail("Debe haber un solo <html>");
if ((html.match(/<\/html>/gi) || []).length !== 1) fail("Debe haber un solo </html>");
if (/<\/html>\s*\S/i.test(html)) fail("Hay contenido despues de </html> (documento duplicado)");
if (/<\/htm[^l>]/i.test(html)) fail("Etiqueta </html> mal formada");
if (/!DOCTYPE/.test(html.replace(/<!DOCTYPE/gi, ""))) fail("Texto '!DOCTYPE' suelto dentro del archivo");

// 2) ids repetidos
const ids = [...htmlNoScripts.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dup.length) fail("ids repetidos: " + [...new Set(dup)].join(", "));

// 3) sintaxis del script
try { new vm.Script(js, { filename: "index.html <script>" }); } catch (e) { fail("Error de sintaxis en el script: " + e.message); }

// 4) identificadores no definidos (ReferenceError en tiempo de ejecucion)
const eslint = new ESLint({
  useEslintrc: false,
  overrideConfig: { env: { browser: true, es2021: true }, parserOptions: { ecmaVersion: 2021 }, rules: { "no-undef": "error" }, globals: { supabase: "readonly" } },
});
const lint = await eslint.lintText(js, { filePath: "index-script.js" });
for (const r of lint) for (const m of r.messages) fail("'" + (m.message.match(/'(.+?)'/) || [, "?"])[1] + "' no esta definido (script linea " + m.line + ")");

// 5) funciones llamadas desde onclick="" que no existen
const defined = new Set([...js.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
[...js.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/g)].forEach((m) => defined.add(m[1]));
const builtin = new Set(["if", "alert", "confirm", "function", "getElementById", "querySelectorAll", "forEach", "trim", "remove", "stopPropagation", "preventDefault", "focus", "click", "toString", "parseFloat", "String", "encodeURIComponent", "bind", "find", "closest"]);
const called = new Set();
for (const m of html.matchAll(/\son(?:click|input|change|keydown|keyup|submit)="([^"]*)"/g)) for (const f of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) called.add(f[1]);
for (const m of js.matchAll(/onclick=\\?"([^"\\]*)\\?"/g)) for (const f of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) called.add(f[1]);
const missingFns = [...called].filter((c) => !defined.has(c) && !builtin.has(c));
if (missingFns.length) fail("onclick llama a funciones que no existen: " + missingFns.join(", "));

// 6) getElementById('x') que no existen en el HTML ni se crean por codigo
const known = new Set(ids);
for (const m of js.matchAll(/id="([\w-]+)"/g)) known.add(m[1]);
for (const m of js.matchAll(/\.id\s*=\s*'([\w-]+)'/g)) known.add(m[1]);
const legacyGuarded = new Set(["dark-btn", "meta-diaria", "meta-card", "meta-bar", "meta-bar-lbl", "meta-pct-lbl", "meta-done-lbl", "meta-remain-lbl", "meta-proj-lbl"]); // codigo antiguo protegido con if(!el)
const missingIds = new Set();
for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) if (!known.has(m[1]) && !legacyGuarded.has(m[1])) missingIds.add(m[1]);
if (missingIds.size) fail("getElementById apunta a ids que no existen: " + [...missingIds].join(", "));

// 7) secretos: ninguna clave service_role ni la contrasena en el navegador
function scanSecrets(file, text) {
  for (const m of text.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
    try { const p = JSON.parse(Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()); if (p.role === "service_role") fail(file + ": contiene una clave service_role (¡no va en el repo!)"); } catch (e) {}
  }
}
scanSecrets("index.html", html);
if (/PASSWORD\s*=\s*['"]/.test(js)) fail("index.html: hay una contrasena escrita en el codigo");

// 8) Functions y lib: sintaxis
for (const dir of ["functions", "lib", "tools"]) {
  const d = path.join(root, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".js"))) {
    const full = path.join(d, f);
    scanSecrets(dir + "/" + f, fs.readFileSync(full, "utf8"));
    const r = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
    if (r.status !== 0) fail(dir + "/" + f + ": " + (r.stderr || "").split("\n").slice(0, 3).join(" "));
  }
}

if (problems.length) {
  console.error("✗ " + problems.length + " problema(s):\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log("✓ check ok  (script " + Math.round(js.length / 1024) + " KB, " + defined.size + " funciones, " + ids.length + " ids, " + called.size + " handlers)");
