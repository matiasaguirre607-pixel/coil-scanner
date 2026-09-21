// DELETE /delete?id=...  — requiere token de administrador
import { json, sbFetch, validId } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export async function onRequestDelete(context) {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;
  const id = new URL(context.request.url).searchParams.get("id");
  if (!validId(id)) return json({ error: "id invalido" }, 400);
  const r = await sbFetch(context.env, "etiquetas?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (!r.ok) return json({ error: "No se pudo eliminar" }, 502);
  return json({ ok: true });
}
