export async function onRequestPost(context) {
  const GEMINI_KEY = context.env.GEMINI_KEY;
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { imageBase64, mediaType, wo, operario, notas, maquina } = body;
  if (!imageBase64) return rj({error:"Sin imagen"},400);

  const prompt = `You are a data extractor for steel coil labels. There are TWO types of labels:

TYPE 1 (Pacific Steel / standard):
- peso: weight in tonnes (e.g. "1.460")
- producto: product type with MM size (e.g. "COIL REIN 6.1mm", "COIL REIN 8mm", "COIL REIN 9mm")
- coil: Coil number (numeric, e.g. "6260300548")
- cast: Cast number (numeric, e.g. "530736", may have suffix like "530736-01")

TYPE 2 (alternative label - may show date, machine name, etc):
- peso: weight in tonnes (e.g. "1.536")
- producto: product type with MM size (e.g. "COIL REIN 6mm")
- coil: Coil number (numeric, e.g. "40260214349")
- cast: Cast number in format GRADE-HEATCODE (e.g. "SAE1012-3D18470/4", "SAE1008-2B15230/1")

Rules:
- Extract EXACTLY these 4 fields only
- For cast: capture the FULL string including letters, numbers, hyphens and slashes
- For peso: extract only the number (e.g. "1.536" not "1.536 t")
- For producto: always include the MM size
- Respond with ONLY a JSON object, nothing else, no markdown:
{"peso": "1.460", "producto": "COIL REIN 6.1mm", "coil": "6260300548", "cast": "530736"}`;

  const gr = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key="+GEMINI_KEY, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: mediaType||"image/jpeg", data: imageBase64}},
        {text: prompt}
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 256}
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
  const cast = parsed.cast ? String(parsed.cast).trim() : null;

  // Check duplicate
  if (coil) {
    const dr = await fetch(SB_BASE+"/rest/v1/etiquetas?coil=eq."+encodeURIComponent(coil)+"&select=id,coil,cast,peso,producto,wo,created_at&limit=1", {
      headers: { apikey: SB_KEY, Authorization: "Bearer "+SB_KEY }
    });
    const dups = await dr.json();
    if (Array.isArray(dups) && dups.length > 0) return rj({ duplicate:true, existing:dups[0] }, 409);
  }

  await fetch(SB_BASE+"/rest/v1/etiquetas", {
    method: "POST",
    headers: {"Content-Type":"application/json", apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, Prefer:"return=minimal"},
    body: JSON.stringify({ wo:wo||null, producto, coil, cast, peso, operario:operario||null, notas:notas||null, maquina:maquina||null })
  });

  return rj({ ok:true, peso, producto, coil, cast });
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
