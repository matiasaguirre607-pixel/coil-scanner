export async function onRequestPost(context) {
  const GEMINI_KEY = context.env.GEMINI_KEY;
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { imageBase64, mediaType } = body;
  if (!imageBase64) return rj({error:"Sin imagen"},400);

  const gr = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key="+GEMINI_KEY, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: mediaType||"image/jpeg", data: imageBase64}},
        {text: `This is a Pacific Steel consignment note. Extract EVERY ROW from the table.

Return ONLY a JSON array, no markdown:
[{"referencia":"R810242355","fecha":"14/08/26","cast_no":"534735-01","lot_no":"6261990075","producto":"9.0 Ductile Rod","peso":1.435}]

- referencia: reference number (top of page, format R8XXXXXXX)
- fecha: date
- cast_no: Cast No column
- lot_no: Lot No column as a STRING (required, never null)
- producto: Product column, copy exactly
- peso: Weight as decimal number

Extract ALL rows without skipping any.`}
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 4096}
    })
  });

  const gd = await gr.json();
  if (!gr.ok) return rj({error: (gd?.error?.message || "Gemini error") + " ["+gr.status+"]"}, 500);

  const raw = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  let rows;
  try {
    const clean = raw.replace(/```json/gi,"").replace(/```/g,"").trim();
    rows = JSON.parse(clean);
    if (!Array.isArray(rows)) rows = [];
  } catch(e) {
    return rj({error: "Parse error: " + raw.substring(0,200)}, 422);
  }

  // Load ALL existing lot_nos from Supabase in one call (much faster + reliable)
  const existingResp = await fetch(SB_BASE+"/rest/v1/consignments?select=lot_no&limit=10000", {
    headers: {apikey: SB_KEY, Authorization: "Bearer "+SB_KEY}
  });
  const existingRows = await existingResp.json();
  const existingLots = new Set(
    Array.isArray(existingRows) 
      ? existingRows.map(r => normalizeLotNo(r.lot_no))
      : []
  );

  let saved = 0, skipped = 0;
  for (const r of rows) {
    if (!r.lot_no) continue;

    const lotNo = normalizeLotNo(r.lot_no);
    if (!lotNo) continue;

    // Skip if already exists
    if (existingLots.has(lotNo)) { skipped++; continue; }

    const producto = normalizeProducto(r.producto);

    const resp = await fetch(SB_BASE+"/rest/v1/consignments", {
      method: "POST",
      headers: {"Content-Type":"application/json", apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, Prefer:"return=minimal"},
      body: JSON.stringify({
        referencia: r.referencia||null,
        fecha: r.fecha||null,
        cast_no: r.cast_no ? String(r.cast_no).trim() : null,
        lot_no: lotNo,
        producto: producto,
        peso: parseFloat(r.peso)||null
      })
    });
    if (resp.ok) {
      saved++;
      existingLots.add(lotNo); // prevent same-session duplicates
    }
  }

  return rj({ok:true, total:rows.length, saved, skipped});
}

// Normalize lot_no: trim spaces, remove decimals, uppercase
function normalizeLotNo(raw) {
  if (!raw && raw !== 0) return null;
  // Convert float like 6261990075.0 to string without decimal
  let s = String(raw).trim();
  if (s.includes('.') && !s.includes('-')) {
    const n = parseFloat(s);
    if (!isNaN(n) && Number.isInteger(n)) s = String(Math.round(n));
    else if (!isNaN(n)) s = s.replace(/\.0+$/, '');
  }
  return s.trim() || null;
}

function normalizeProducto(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^(\d+\.?\d*)\s+(.*)/);
  if (!m) return s;
  const size = parseFloat(m[1]).toFixed(1);
  const type = m[2].trim();
  if (type.includes('DUCTILE')) return size + ' DUCTILE ROD';
  if (type.includes('WIRE')) return size + ' WIRE ROD';
  return size + ' ' + type;
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
