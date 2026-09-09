export async function onRequestPost(context) {
  const GEMINI_KEY = context.env.GEMINI_KEY;
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { imageBase64, mediaType, wo, operario, notas } = body;
  if (!imageBase64) return rj({error:"Sin imagen"},400);

  const gr = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key="+GEMINI_KEY, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: mediaType||"image/jpeg", data: imageBase64}},
        {text: "Foto de etiqueta de rollo de acero. Extrae los 4 campos y responde SOLO JSON sin markdown: {\"peso\":\"1.475\",\"producto\":\"COIL REIN 6mm\",\"coil\":\"6260170028\",\"cast\":\"530069\"}. peso=toneladas solo numero, producto=tipo acero con mm, coil=numero rollo, cast=numero colada. null si no aparece."}
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 256}
    })
  });
  const gd = await gr.json();
  if (!gr.ok) return rj({error: gd?.error?.message || "Error Gemini"}, 500);

  const raw = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json/gi,"").replace(/```/g,"").trim()); }
  catch(e) { return rj({error:"No se leyeron los datos. Foto mas clara."}, 422); }

  const coil = parsed.coil ? String(parsed.coil).trim() : null;
  const peso = normalizePeso(parsed.peso);
  const producto = normalizeProducto(parsed.producto);

  if (coil) {
    const dr = await fetch(SB_BASE+"/rest/v1/etiquetas?coil=eq."+encodeURIComponent(coil)+"&select=id,coil,cast,peso,created_at&limit=1", {
      headers: { apikey: SB_KEY, Authorization: "Bearer "+SB_KEY }
    });
    const dups = await dr.json();
    if (Array.isArray(dups) && dups.length > 0) return rj({ duplicate:true, existing:dups[0] }, 409);
  }

  await fetch(SB_BASE+"/rest/v1/etiquetas", {
    method: "POST",
    headers: {"Content-Type":"application/json", apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, Prefer:"return=minimal"},
    body: JSON.stringify({ wo:wo||null, producto, coil, cast:parsed.cast||null, peso, operario:operario||null, notas:notas||null })
  });

  return rj({ ok:true, peso, producto, coil, cast:parsed.cast });
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
  if (m) return "COIL REIN "+m[1]+"mm";
  return String(raw).toUpperCase().trim();
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
