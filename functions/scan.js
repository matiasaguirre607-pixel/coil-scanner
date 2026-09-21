// POST /scan — usado por la cola offline: lee la etiqueta con IA y la guarda. Abierto a los operarios.
import { json, clean, cleanPeso, cleanMaquina, validCoil, insertEtiqueta } from "../lib/db.js";

export async function onRequestPost(context) {
  const ANTHROPIC_KEY = context.env.ANTHROPIC_KEY;
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Body invalido" }, 400); }
  const { imageBase64, mediaType, wo, operario, notas, maquina } = body;
  if (!imageBase64) return json({ error: "Sin imagen" }, 400);
  if (String(imageBase64).length > 12 * 1024 * 1024) return json({ error: "Imagen demasiado grande" }, 413);

  const ar = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-workspace-id": "wrkspc_01PxXGS3vqSidRzMcaVxkQwV"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
        { type: "text", text: "Analiza esta etiqueta de acero. Responde SOLO con JSON: {\"peso\":\"1.475\",\"producto\":\"COIL REIN 7 MM\",\"coil\":\"6260170028\",\"cast\":\"530069\"}. Peso en toneladas. null si no aparece." }
      ] }]
    })
  });
  const ad = await ar.json();
  if (!ar.ok) return json({ error: (ad && ad.error && ad.error.message) || "Error API" }, 500);

  const raw = (ad.content && ad.content[0] && ad.content[0].text) || "";
  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim()); }
  catch (e) { return json({ error: "No se leyeron los datos. Foto mas clara." }, 422); }

  const coil = parsed.coil ? String(parsed.coil).trim() : null;
  if (!coil || !validCoil(coil)) return json({ error: "No se leyo el numero de coil. Foto mas clara." }, 422);
  const peso = normalizePeso(parsed.peso);
  const producto = normalizeProducto(parsed.producto);

  const r = await insertEtiqueta(context.env, {
    wo: clean(wo, 40), producto: clean(producto, 60), coil: coil, cast: clean(parsed.cast, 20), peso: cleanPeso(peso),
    operario: clean(operario, 40), notas: clean(notas, 300), maquina: cleanMaquina(maquina)
  });
  if (r.duplicate) return json({ duplicate: true, existing: r.existing }, 409);
  if (r.error) return json({ error: r.error }, r.status || 500);
  return json({ ok: true, peso: peso, producto: producto, coil: coil, cast: parsed.cast });
}

function normalizePeso(raw) {
  if (!raw) return null;
  const m = String(raw).replace(",", ".").match(/\d+\.?\d*/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (isNaN(n)) return null;
  if (String(raw).toLowerCase().includes("kg") && n > 100) n = n / 1000;
  return n.toFixed(3);
}

function normalizeProducto(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d+\.?\d*)\s*[Mm][Mm]/);
  if (m) return "COIL REIN " + m[1] + "mm";
  return String(raw).toUpperCase().trim();
}
