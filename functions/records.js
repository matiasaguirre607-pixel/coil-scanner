export async function onRequestGet(context) {
  const { env, request } = context;
  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_KEY;

  if (!SB_URL || !SB_KEY) {
    return Response.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const url    = new URL(request.url);
  const wo     = url.searchParams.get('wo');
  const search = url.searchParams.get('q');

  const sbUrl  = SB_URL.replace('/rest/v1/', '');
  let query    = `${sbUrl}/rest/v1/etiquetas?order=created_at.desc&limit=500&select=id,created_at,wo,producto,coil,cast,peso,operario,notas`;

  if (wo)     query += `&wo=eq.${encodeURIComponent(wo)}`;
  if (search) query += `&or=(producto.ilike.*${encodeURIComponent(search)}*,coil.ilike.*${encodeURIComponent(search)}*,cast.ilike.*${encodeURIComponent(search)}*)`;

  const resp = await fetch(query, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`
    }
  });

  const data = await resp.json();
  return Response.json(data);
}
