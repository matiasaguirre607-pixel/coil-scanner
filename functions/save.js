export async function onRequestPost(context) {
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { wo, producto, coil, cast, peso, operario, notas, maquina } = body;
  if (!coil) return rj({error:"Falta el numero de coil"},400);

  // Check duplicate
  const dr = await fetch(SB_BASE+"/rest/v1/etiquetas?coil=eq."+encodeURIComponent(coil)+"&select=id,coil,cast,peso,producto,wo,created_at&limit=1", {
    headers: { apikey: SB_KEY, Authorization: "Bearer "+SB_KEY }
  });
  const dups = await dr.json();
  if (Array.isArray(dups) && dups.length > 0) return rj({ duplicate:true, existing:dups[0] }, 409);

  // Save
  const sr = await fetch(SB_BASE+"/rest/v1/etiquetas", {
    method: "POST",
    headers: {"Content-Type":"application/json", apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, Prefer:"return=minimal"},
    body: JSON.stringify({ wo:wo||null, producto:producto||null, coil, cast:cast||null, peso:peso||null, operario:operario||null, notas:notas||null, maquina:maquina||null })
  });

  if (!sr.ok) {
    const err = await sr.text();
    return rj({error: "Error guardando: " + err.substring(0,100)}, 500);
  }

  return rj({ ok:true });
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
