export async function onRequestPost(context) {
  const GEMINI_KEY = context.env.GEMINI_KEY;

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { imageBase64, mediaType } = body;
  if (!imageBase64) return rj({error:"Sin imagen"},400);
  if (String(imageBase64).length > 12 * 1024 * 1024) return rj({error:"Imagen demasiado grande"},413);

  const gr = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key="+GEMINI_KEY, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: mediaType||"image/jpeg", data: imageBase64}},
        {text: "You are a data extractor for steel coil labels. Extract exactly these 4 fields and respond with ONLY a JSON object, nothing else:\n{\"peso\": \"1.460\", \"producto\": \"COIL REIN 6.1mm\", \"coil\": \"6260300548\", \"cast\": \"530736\"}\npeso = the large number (weight in tonnes, just the number)\nproducto = the product type including MM size (e.g. COIL REIN 6.1mm)\ncoil = the Coil number\ncast = the Cast number\nRespond with ONLY the JSON, no explanation, no markdown."}
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 2048}
    })
  });
  const gd = await gr.json();
  if (!gr.ok) return rj({error: gd?.error?.message || "Error Gemini"}, 500);

  const raw = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let parsed = null;
  try { parsed = JSON.parse(raw.trim()); } catch(e) {}
  if (!parsed) { const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) try { parsed = JSON.parse(m[1].trim()); } catch(e) {} }
  if (!parsed) { const m = raw.match(/\{[\s\S]*?\}/); if (m) try { parsed = JSON.parse(m[0]); } catch(e) {} }
  if (!parsed) return rj({error: "No se leyeron los datos. Raw: " + raw.substring(0,100)}, 422);

  const coil = parsed.coil ? String(parsed.coil).trim() : null;
  const peso = normalizePeso(parsed.peso);
  const producto = normalizeProducto(parsed.producto);

  return rj({ ok:true, peso, producto, coil, cast: parsed.cast||null });
}

function normalizePeso(raw) {
  if (!raw) return null;
  const m = String(raw).replace(",",".").match(/\d+\.?\d*/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (isNaN(n)) return null;
  if (String(raw).toLowerCase().includes("kg") && n > 100) n = n/1000;
  return n.toFixed(3);
}

function normalizeProducto(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d+\.?\d*)\s*[Mm][Mm]/);
  if (m) return "COIL REIN " + parseFloat(m[1]) + "mm";
  return String(raw).toUpperCase().trim();
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
