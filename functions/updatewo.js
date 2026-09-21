// POST /updatewo { id, wo?, peso?, cast?, coil?, maquina? } — edita un registro. Requiere token de administrador.
// Solo se modifican los campos que vienen en el body.
import { json, sbFetch, validId, clean, cleanPeso, cleanMaquina, validCoil } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Body invalido" }, 400); }
  if (!validId(body.id)) return json({ error: "id invalido" }, 400);

  const patch = {};
  if ("wo" in body) patch.wo = clean(body.wo, 40);
  if ("cast" in body) patch.cast = clean(body.cast, 20);
  if ("maquina" in body) patch.maquina = cleanMaquina(body.maquina);
  if ("peso" in body) {
    if (body.peso !== null && body.peso !== "" && cleanPeso(body.peso) === null) return json({ error: "Peso invalido" }, 400);
    patch.peso = cleanPeso(body.peso);
  }
  if ("coil" in body) {
    const c = clean(body.coil, 24);
    if (!c || !validCoil(c)) return json({ error: "Coil invalido" }, 400);
    patch.coil = c;
  }
  if (!Object.keys(patch).length) return json({ error: "Nada para actualizar" }, 400);

  const r = await sbFetch(context.env, "etiquetas?id=eq." + encodeURIComponent(body.id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
  if (r.status === 409) return json({ duplicate: true, error: "Ese coil ya existe" }, 409);
  if (!r.ok) return json({ error: "No se pudo guardar" }, 502);
  return json({ ok: true });
}
