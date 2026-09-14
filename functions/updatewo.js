export async function onRequestPost(context) {
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { id, wo, peso, cast, coil } = body;
  if (!id) return rj({error:"id requerido"},400);

  const updates = {};
  if (wo !== undefined) updates.wo = wo || null;
  if (peso !== undefined) updates.peso = peso || null;
  if (cast !== undefined) updates.cast = cast || null;
  if (coil !== undefined) updates.coil = coil || null;

  if (!Object.keys(updates).length) return rj({error:"Sin campos para actualizar"},400);

  const r = await fetch(SB_BASE+"/rest/v1/etiquetas?id=eq."+id, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: "Bearer "+SB_KEY,
      Prefer: "return=minimal"
    },
    body: JSON.stringify(updates)
  });

  if (!r.ok) return rj({error:"Error actualizando"},500);
  return rj({ok:true});
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
