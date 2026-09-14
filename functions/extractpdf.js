export async function onRequestPost(context) {
  const GEMINI_KEY = context.env.GEMINI_KEY;
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { pdfBase64 } = body;
  if (!pdfBase64) return rj({error:"Sin PDF"},400);

  const gr = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key="+GEMINI_KEY, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: "application/pdf", data: pdfBase64}},
        {text: "Extract all coil data from this Pacific Steel consignment note. Return ONLY a JSON array, no markdown, no explanation: [{\"referencia\":\"R810242355\",\"fecha\":\"14/08/26\",\"cast_no\":\"534735-01\",\"lot_no\":\"6261990075\",\"producto\":\"9.0 Ductile Rod\",\"peso\":1.435}]. Include every row. referencia=Pacific Steel Reference number, fecha=DATE field, cast_no=Cast No column, lot_no=Lot no column, producto=Product column, peso=Weight/tns as number."}
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 8192}
    })
  });

  const gd = await gr.json();
  if (!gr.ok) return rj({error: gd?.error?.message || "Error Gemini"}, 500);

  const raw = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let rows;
  try {
    const clean = raw.replace(/```json/gi,"").replace(/```/g,"").trim();
    rows = JSON.parse(clean);
  } catch(e) {
    return rj({error: "No se pudo parsear. Raw: " + raw.substring(0,200)}, 422);
  }

  let saved = 0;
  for (const r of rows) {
    const resp = await fetch(SB_BASE+"/rest/v1/consignments", {
      method: "POST",
      headers: {"Content-Type":"application/json", apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, Prefer:"return=minimal"},
      body: JSON.stringify({
        referencia: r.referencia||null,
        fecha: r.fecha||null,
        cast_no: r.cast_no||null,
        lot_no: r.lot_no||null,
        producto: r.producto||null,
        peso: parseFloat(r.peso)||null
      })
    });
    if (resp.ok) saved++;
  }

  return rj({ok:true, total:rows.length, saved, rows});
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
