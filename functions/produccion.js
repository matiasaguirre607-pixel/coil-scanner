// POST /produccion { wo, toneladas_producidas, notas } — registra produccion. Requiere token de administrador.
import { json, sbFetch, clean } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Body invalido" }, 400); }
  const wo = clean(body.wo, 40);
  const ton = parseFloat(body.toneladas_producidas);
  if (!wo) return json({ error: "Falta la WO" }, 400);
  if (!isFinite(ton) || ton <= 0 || ton > 1000) return json({ error: "Toneladas invalidas" }, 400);
  const r = await sbFetch(context.env, "produccion", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ wo: wo, toneladas_producidas: ton, notas: clean(body.notas, 300) })
  });
  if (!r.ok) {
    const t = await r.text();
    return json({ error: "Error " + r.status + ": " + t.substring(0, 100) }, 502);
  }
  return json({ ok: true });
}
