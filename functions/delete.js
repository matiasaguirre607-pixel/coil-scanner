export async function onRequestDelete(context) {
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";
  const SB_BASE = "https://xqzqrlxjzfxpqigjuzor.supabase.co";
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return new Response("{}", {status:400});
  await fetch(SB_BASE+"/rest/v1/etiquetas?id=eq."+id, {
    method:"DELETE",
    headers: { apikey:SB_KEY, Authorization:"Bearer "+SB_KEY }
  });
  return new Response('{"ok":true}', { headers:{"Content-Type":"application/json"} });
}
