// POST /save — guarda un coil escaneado. Abierto a los operarios (sin contrasena), pero con validacion.
import { json, clean, cleanPeso, cleanMaquina, validCoil, insertEtiqueta } from "../lib/db.js";

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Body invalido" }, 400); }
  const coil = clean(body.coil, 24);
  if (!coil) return json({ error: "Falta el numero de coil" }, 400);
  if (!validCoil(coil)) return json({ error: "Numero de coil invalido" }, 400);

  const r = await insertEtiqueta(context.env, {
    wo: clean(body.wo, 40), producto: clean(body.producto, 60), coil: coil, cast: clean(body.cast, 20),
    peso: cleanPeso(body.peso), operario: clean(body.operario, 40), notas: clean(body.notas, 300),
    maquina: cleanMaquina(body.maquina)
  });
  if (r.duplicate) return json({ duplicate: true, existing: r.existing }, 409);
  if (r.error) return json({ error: r.error }, r.status || 500);
  return json({ ok: true });
}
