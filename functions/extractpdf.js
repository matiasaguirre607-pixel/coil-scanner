// POST /extractpdf
// Recibe UNA pagina del PDF ya renderizada como imagen (lo que manda index.html):
//   { imageBase64, mediaType: "image/jpeg" }
// (tambien acepta { pdfBase64 } por compatibilidad).
// Devuelve { ok:true, rows:[...] }. NO guarda nada: el front deduplica y guarda en Supabase.
//
// El prompt es generico (no asume un proveedor fijo como "Pacific Steel"): describe el
// SIGNIFICADO de cada campo para que la IA lo pueda encontrar en cualquier layout/idioma
// (ej. tambien el "Mill Test Certificate" de Hoa Phat, en vietnamita/ingles, con columnas
// distintas a las de Pacific Steel). Si aparece un proveedor nuevo con un layout raro, ajustar
// este prompt -- no hace falta tocar index.html, el contrato { rows: [...] } no cambia.
export async function onRequestPost(context) {
  const ANTHROPIC_KEY = context.env.ANTHROPIC_KEY;

  let body;
  try { body = await context.request.json(); } catch (e) { return rj({ error: "Body invalido" }, 400); }
  const { imageBase64, mediaType, pdfBase64 } = body;

  let fileBlock;
  if (imageBase64) {
    fileBlock = { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } };
  } else if (pdfBase64) {
    fileBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } };
  } else {
    return rj({ error: "Sin imagen/PDF" }, 400);
  }

  const PROMPT = "Extract coil data from this steel consignment / mill test certificate page. It can come from different suppliers with different layouts and languages (English, Spanish, Vietnamese...) -- read the column headers on the page itself to find the data; don't assume fixed column positions.\n\n" +
    "Return ONLY a JSON array, one entry per physical coil row (skip header rows, chemical-composition-only rows, and any totals/summary row):\n" +
    "[{\"referencia\":\"R810242355\",\"fecha\":\"14/08/26\",\"cast_no\":\"534735-01\",\"lot_no\":\"6261990075\",\"producto\":\"9.0 Ductile Rod\",\"peso\":1.435}]\n\n" +
    "Field meanings (use the label on the page that matches, whatever language/wording it uses):\n" +
    "- referencia: the reference/code that identifies this whole shipment or consignment, shared by every row on the page. It may be printed (e.g. a \"Reference\" field, often starting with a letter like \"R\" followed by digits) OR handwritten as a note on the page (e.g. in a corner, something like \"WCPL-60\"). Use the same referencia for every row on the page.\n" +
    "- fecha: a date for this shipment/certificate, as printed (keep its original format, e.g. DD/MM/YY or DD/MM/YYYY). If several dates appear (production date, certificate date, shipping date...), prefer a certificate or shipping date over a production date.\n" +
    "- cast_no: the heat/cast/melt number for that coil (labels seen: \"Cast No\", \"Heat number\", \"Mã số\", \"Colada\"). Copy it exactly as printed, including any suffix like \"-01\" or \"/4\".\n" +
    "- lot_no: the unique number/code identifying that specific physical coil (labels seen: \"Lot no\", \"Coil number\", \"Số cuộn\"). Copy it exactly as printed.\n" +
    "- producto: a short description of the product (diameter/size + product type/grade), e.g. \"9.0 Ductile Rod\" or \"6.0 Hot Rolled Steel Wire Rod - SAE1012\". If size, standard and grade are in separate fields, combine them into one short line.\n" +
    "- peso: the net or gross weight of that coil in tonnes, as a plain number (e.g. 1.494).\n\n" +
    "Include every coil row on the page, even if some fields are missing (use null for a field you truly cannot find). If the page has no coil rows, return [].";

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
        { type: "text", text: PROMPT }
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
