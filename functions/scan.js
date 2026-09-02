export async function onRequestPost(context) {
  const { request, env } = context;

  const CLAUDE_KEY = env.ANTHROPIC_API_KEY;
  const SB_URL     = env.SUPABASE_URL;
  const SB_KEY     = env.SUPABASE_KEY;

  if (!CLAUDE_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch(e) { return Response.json({ error: 'Body inválido' }, { status: 400 }); }

  const { imageBase64, mediaType, wo, operario, notas } = body;
  if (!imageBase64 || !mediaType) {
    return Response.json({ error: 'Faltan datos de imagen' }, { status: 400 });
  }

  // 1. Call Claude
  const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 512,
      system: `Sos un sistema que lee etiquetas de productos de acero y construcción.
Extraé exactamente estos 4 campos de la imagen:
- Peso: el número de toneladas o kg (ej: "1.475 t")
- Producto: descripción del producto (ej: "COIL REIN 7 MM")
- Coil: el número de coil largo (ej: "6260170028")
- Cast: el número de cast o colada (ej: "530069")

Respondé SOLO con JSON válido sin texto extra:
{"peso":"valor","producto":"valor","coil":"valor","cast":"valor","resumen":"descripción breve"}

Si algún campo no está visible escribí null. No inventes datos.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extraé los datos de esta etiqueta.' }
        ]
      }]
    })
  });

  const claudeData = await claudeResp.json();
  if (!claudeResp.ok) {
    return Response.json({ error: claudeData?.error?.message || 'Error IA' }, { status: claudeResp.status });
  }

  const raw = (claudeData.content || []).map(b => b.text || '').join('').trim();
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim());
  } catch(e) {
    return Response.json({ error: 'No se pudieron leer los datos. Intentá con una foto más clara.' }, { status: 422 });
  }

  // 2. Save to Supabase
  if (SB_URL && SB_KEY) {
    const sbUrl = SB_URL.replace('/rest/v1/', '');
    await fetch(`${sbUrl}/rest/v1/etiquetas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        wo:         wo || null,
        producto:   parsed.producto || null,
        coil:       parsed.coil || null,
        "cast":     parsed.cast || null,
        peso:       parsed.peso || null,
        imagen_b64: imageBase64.slice(0, 50000), // limit size
        operario:   operario || null,
        notas:      notas || null
      })
    });
  }

  return Response.json({ ok: true, ...parsed });
}
