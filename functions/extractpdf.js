export async function onRequestPost(context) {
  const GEMINI_KEY = context.env.GEMINI_KEY;
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { imageBase64, mediaType } = body;
  if (!imageBase64) return rj({error:"Sin imagen"},400);

  const gr = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key="+GEMINI_KEY, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: mediaType||"image/jpeg", data: imageBase64}},
        {text: "This is a Pacific Steel consignment note. Extract ALL rows from the table and return ONLY a JSON array with no other text:\n[{\"referencia\":\"R810242355\",\"fecha\":\"14/08/26\",\"cast_no\":\"534735-01\",\"lot_no\":\"6261990075\",\"producto\":\"9.0 Ductile Rod\",\"peso\":1.435}]\nreferencia = the Pacific Steel Reference number (top right)\nfecha = the DATE field\ncast_no = Cast No column\nlot_no = Lot no column\nproducto = Product column - copy EXACTLY as written in the document\npeso = Weight/tns column as a number\nInclude EVERY row. Return empty array [] if no table found."}
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 4096}
    })
  });

  const gd = await gr.json();
  if (!gr.ok) return rj({error: gd?.error?.message || "Error Gemini"}, 500);

  const raw = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  let rows;
  try {
    const clean = raw.replace(/```json/gi,"").replace(/```/g,"").trim();
    rows = JSON.parse(clean);
    if (!Array.isArray(rows)) rows = [];
  } catch(e) {
    return rj({error: "Parse error: " + raw.substring(0,150)}, 422);
  }

  let saved = 0;
  for (const r of rows) {
    if (!r.lot_no) continue;

    // Normalize producto to prevent duplicates from case/spacing differences
    const producto = normalizeProducto(r.producto);

    // Check for duplicate lot_no before inserting
    const check = await fetch(SB_BASE+"/rest/v1/consignments?lot_no=eq."+encodeURIComponent(String(r.lot_no))+"&select=id&limit=1", {
      headers: {apikey: SB_KEY, Authorization: "Bearer "+SB_KEY}
    });
    const existing = await check.json();
    if (Array.isArray(existing) && existing.length > 0) continue; // skip duplicate

    const resp = await fetch(SB_BASE+"/rest/v1/consignments", {
      method: "POST",
      headers: {"Content-Type":"application/json", apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, Prefer:"return=minimal"},
      body: JSON.stringify({
        referencia: r.referencia||null,
        fecha: r.fecha||null,
        cast_no: r.cast_no||null,
        lot_no: String(r.lot_no),
        producto: producto,
        peso: parseFloat(r.peso)||null
      })
    });
    if (resp.ok) saved++;
  }

  return rj({ok:true, total:rows.length, saved, rows});
}

// Normalize product name to consistent format
function normalizeProducto(raw) {
  if (!raw) return null;
  // Trim and uppercase for comparison
  const s = String(raw).trim();
  // Extract leading number (the mm size)
  const m = s.match(/^(\d+\.?\d*)\s+(.*)/);
  if (!m) return s.toUpperCase().trim();
  const size = parseFloat(m[1]);
  const type = m[2].trim().toUpperCase();
  // Normalize type names
  let normType = type;
  if (type.includes('DUCTILE')) normType = 'DUCTILE ROD';
  else if (type.includes('WIRE')) normType = 'WIRE ROD';
  else if (type.includes('REIN') || type.includes('COIL')) normType = 'WIRE ROD';
  return size + '.0 ' + normType;
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
