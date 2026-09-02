export async function onRequestDelete(context) {
  const { env, request } = context;
  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_KEY;

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 });

  const sbUrl = SB_URL.replace('/rest/v1/', '');
  await fetch(`${sbUrl}/rest/v1/etiquetas?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });

  return Response.json({ ok: true });
}
