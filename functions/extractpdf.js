// POST /extractpdf
// Recibe UNA pagina del PDF ya renderizada como imagen (lo que manda index.html):
//   { imageBase64, mediaType: "image/jpeg" }
// (tambien acepta { pdfBase64 } por compatibilidad).
// Devuelve { ok:true, rows:[...] }. NO guarda nada: el front deduplica y guarda en Supabase.
import { requireAdmin } from "../lib/auth.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context.request, context.env); // consume API de pago: solo administrador
  if (denied) return denied;
  const ANTHROPIC_KEY = context.env.ANTHROPIC_KEY;

  let body;
  try { body = await context.request.json(); } catch (e) { return rj({ error: "Body invalido" }, 400); }
  const { imageBase64, mediaType, pdfBase64 } = body;
  if (String(imageBase64 || pdfBase64 || "").length > 16 * 1024 * 1024) return rj({ error: "Archivo demasiado grande" }, 413);

  let fileBlock;
  if (imageBase64) {
    fileBlock = { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } };
  } else if (pdfBase64) {
    fileBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } };
  } else {
    return rj({ error: "Sin imagen/PDF" }, 400);
  }

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
      max_tokens: 8192,
      messages: [{ role: "user", content: [
        fileBlock,
        { type: "text", text: "Extract all coil data from this Pacific Steel consignment note page. Return ONLY a JSON array: [{\"referencia\":\"R810242355\",\"fecha\":\"14/08/26\",\"cast_no\":\"534735-01\",\"lot_no\":\"6261990075\",\"producto\":\"9.0 Ductile Rod\",\"peso\":1.435}]. Include every row on the page. referencia=Pacific Steel Reference, fecha=DATE field, cast_no=Cast No column, lot_no=Lot no column, producto=Product column, peso=Weight/tns column as number. If the page has no coil rows return []." }
      ]}]
    })
  });

  const ad = await ar.json();
  if (!ar.ok) return rj({ error: ad?.error?.message || "Error API" }, 500);

  const raw = (ad.content && ad.content[0] && ad.content[0].text) || "";
  let rows;
  try {
    const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const a = clean.indexOf("["), b = clean.lastIndexOf("]");
    rows = JSON.parse(a >= 0 && b > a ? clean.slice(a, b + 1) : clean);
  } catch (e) {
    return rj({ error: "No se pudo parsear: " + raw.substring(0, 100) }, 422);
  }
  if (!Array.isArray(rows)) return rj({ error: "Respuesta inesperada" }, 422);

  return rj({ ok: true, total: rows.length, rows });
}

function rj(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
