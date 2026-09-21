// POST   /consignments { rows:[{referencia,fecha,cast_no,lot_no,producto,peso}] } — carga coils de un consignment
// DELETE /consignments?id=...  |  ?ref=R81...   — elimina un coil o todo un consignment
// Ambos requieren token de administrador.
import { json, sbFetch, validId, clean } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Body invalido" }, 400); }
  if (!Array.isArray(body.rows) || !body.rows.length) return json({ error: "Sin filas" }, 400);
  if (body.rows.length > 500) return json({ error: "Maximo 500 filas por envio" }, 413);

  const rows = [];
  let skipped = 0;
  for (const r of body.rows) {
    const lot = clean(r.lot_no, 24);
    const peso = parseFloat(String(r.peso).replace(",", "."));
    if (!lot || !/^[A-Za-z0-9-]{3,24}$/.test(lot)) { skipped++; continue; }
    rows.push({
      referencia: clean(r.referencia, 40), fecha: clean(r.fecha, 20), cast_no: clean(r.cast_no, 30),
      lot_no: lot, producto: clean(r.producto, 60), peso: isFinite(peso) && peso > 0 && peso < 100 ? peso : null
    });
  }
  if (!rows.length) return json({ error: "Ninguna fila valida" }, 400);

  const init = { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(rows) };
  // Con UNIQUE(lot_no) la base ignora los duplicados. Si el UNIQUE todavia no existe, cae al insert simple.
  let resp = await sbFetch(context.env, "consignments?on_conflict=lot_no", init);
  if (resp.status === 400) resp = await sbFetch(context.env, "consignments", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(rows) });
  if (!resp.ok) {
    const t = await resp.text();
    return json({ error: "No se pudo guardar: " + t.substring(0, 150) }, 502);
  }
  return json({ ok: true, sent: rows.length, skipped: skipped });
}

export async function onRequestDelete(context) {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;
  const p = new URL(context.request.url).searchParams;
  let filter;
  if (p.get("id")) {
    if (!validId(p.get("id"))) return json({ error: "id invalido" }, 400);
    filter = "id=eq." + encodeURIComponent(p.get("id"));
  } else if (p.get("ref")) {
    filter = p.get("ref") === "Sin ref" ? "referencia=is.null" : "referencia=eq." + encodeURIComponent(p.get("ref"));
  } else {
    return json({ error: "Falta id o ref" }, 400);
  }
  const r = await sbFetch(context.env, "consignments?" + filter, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (!r.ok) return json({ error: "No se pudo eliminar" }, 502);
  return json({ ok: true });
}
