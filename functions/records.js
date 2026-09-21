// GET /records — todos los registros (paginado en el servidor; antes cortaba en 500).
import { sbFetch, json } from "../lib/db.js";

const COLS = "id,created_at,wo,producto,coil,cast,peso,operario,notas,maquina";

export async function onRequestGet(context) {
  const rows = [];
  let offset = 0;
  for (let i = 0; i < 100; i++) {
    const r = await sbFetch(context.env, "etiquetas?select=" + COLS + "&order=created_at.desc,id.desc&limit=1000&offset=" + offset);
    if (!r.ok) {
      const t = await r.text();
      return json({ error: "Supabase " + r.status + ": " + t.substring(0, 120) }, 502);
    }
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    for (const b of batch) rows.push(b);
    offset += batch.length; // no asume 1000 por pagina: sirve aunque el max-rows del proyecto sea menor
  }
  return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
