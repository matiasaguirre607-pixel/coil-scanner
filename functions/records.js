export async function onRequestGet(context) {
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";
  const r = await fetch(SB_BASE+"/rest/v1/etiquetas?order=created_at.desc&limit=500&select=id,created_at,wo,producto,coil,cast,peso,operario,notas", {
    headers: { apikey:SB_KEY, Authorization:"Bearer "+SB_KEY }
  });
  return new Response(await r.text(), { headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"} });
}
