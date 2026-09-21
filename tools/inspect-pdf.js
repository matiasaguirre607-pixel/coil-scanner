// Prueba el lector de texto con un PDF REAL de Pacific Steel, sin subir nada a la app:
//     npm i pdfjs-dist@3.11.174        (una sola vez)
//     node tools/inspect-pdf.js ruta/al/consignment.pdf
// Muestra, pagina por pagina, si se leyo por TEXTO o si caeria a la IA, y las filas que encontro.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) { console.error("Uso: node tools/inspect-pdf.js archivo.pdf"); process.exit(1); }

let pdfjs;
try { pdfjs = (await import("pdfjs-dist/legacy/build/pdf.js")).default; }
catch (e) { console.error("Falta pdfjs-dist. Ejecuta:  npm i pdfjs-dist@3.11.174"); process.exit(1); }

// se usa EXACTAMENTE el mismo codigo que corre en la app (se extrae de index.html)
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const a = html.indexOf("function _pdfLines(items) {");
const b = html.indexOf("async function tryParseConsPageText(page) {");
if (a < 0 || b < 0) { console.error("No encontre el lector de PDF en index.html"); process.exit(1); }
const lib = new Function(html.slice(a, b) + "\nreturn {parseConsPageItems, _pdfLines};")();

const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
let text = 0, ai = 0, rows = 0;
for (let p = 1; p <= pdf.numPages; p++) {
  const tc = await (await pdf.getPage(p)).getTextContent();
  const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5] }));
  const r = lib.parseConsPageItems(items);
  if (r && r.rows.length) {
    text++; rows += r.rows.length;
    console.log("pagina " + p + ": TEXTO  " + r.rows.length + " filas · ref " + r.ref + " · fecha " + r.fecha);
    r.rows.slice(0, 3).forEach((x) => console.log("     " + [x.cast_no, x.lot_no, x.producto, x.peso].join("  |  ")));
  } else {
    ai++;
    console.log("pagina " + p + ": IA (el texto no fue confiable). Asi se ve el texto de la pagina:");
    lib._pdfLines(items).slice(0, 30).forEach((l) => console.log("     > " + l));
  }
}
console.log("\nResumen: " + text + " pagina(s) por texto (" + rows + " filas), " + ai + " por IA");
