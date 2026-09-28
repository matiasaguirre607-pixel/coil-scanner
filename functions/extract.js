export async function onRequestPost(context) {
  const GEMINI_KEY = context.env.GEMINI_KEY;
  if (!GEMINI_KEY) return rj({error: "Server misconfigured: GEMINI_KEY is not set in Cloudflare Pages environment variables"}, 500);

  let body;
  try { body = await context.request.json(); } catch(e) { return rj({error:"Body invalido"},400); }
  const { imageBase64, mediaType } = body;
  if (!imageBase64) return rj({error:"Sin imagen"},400);

  const prompt = `You are a data extractor for steel coil labels. There are TWO types of labels:

TYPE 1 (Pacific Steel / standard):
- peso: weight in tonnes (e.g. "1.460")
- producto: product type with MM size (e.g. "COIL REIN 6.1mm", "COIL REIN 8mm", "COIL REIN 9mm")
- coil: Coil number (numeric, e.g. "6260300548")
- cast: Cast number (numeric, e.g. "530736", may have suffix like "530736-01")

TYPE 2 (alternative label - may show date, machine name, etc):
- peso: weight in tonnes (e.g. "1.536")
- producto: product type with MM size (e.g. "COIL REIN 6mm")
- coil: Coil number (numeric, e.g. "40260214349")
- cast: Cast number in format GRADE-HEATCODE (e.g. "SAE1012-3D18470/4", "SAE1008-2B15230/1")

Rules:
- Extract EXACTLY these 4 fields only
- For cast: capture the FULL string including letters, numbers, hyphens and slashes
- For peso: extract only the number (e.g. "1.536" not "1.536 t")
- For producto: always include the MM size
- Respond with ONLY a JSON object, nothing else, no markdown:
{"peso": "1.460", "producto": "COIL REIN 6.1mm", "coil": "6260300548", "cast": "530736"}`;

  // Se confirmo con pruebas reales que Gemini devuelve "This model is currently experiencing high
  // demand" (HTTP 503) o directamente no responde -- eso es saturacion del lado de Google, no un
  // bug del codigo. Como suele ser momentaneo, ahora se reintenta un par de veces con una pausa
  // corta antes de rendirse, en vez de fallar (o colgarse) a la primera. Cada intento individual
  // sigue teniendo su propio limite de tiempo (antes no tenia ninguno, por eso la funcion se
  // quedaba esperando para siempre); solo se reintenta ante 503/429 (saturado) o timeout -- un
  // error real de la API (ej. clave invalida) no se reintenta, se devuelve altiro.
  const ATTEMPT_TIMEOUT_MS = 7000;
  const MAX_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 900;
  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key="+GEMINI_KEY;
  const geminiBody = JSON.stringify({
    contents: [{parts: [
      {inline_data: {mime_type: mediaType||"image/jpeg", data: imageBase64}},
      {text: prompt}
    ]}],
    generationConfig: {temperature: 0, maxOutputTokens: 256}
  });

  let gr = null, lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const r = await fetch(geminiUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: geminiBody,
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (r.status === 503 || r.status === 429) {
        lastErr = {kind: "overloaded", status: r.status};
        if (attempt < MAX_ATTEMPTS) { await new Promise(res => setTimeout(res, RETRY_DELAY_MS)); continue; }
        break;   // se agotaron los reintentos: gr queda null, lo maneja el bloque de abajo
      }
      gr = r;
      break;
    } catch (e) {
      clearTimeout(timer);
      const aborted = e && e.name === "AbortError";
      lastErr = {kind: aborted ? "timeout" : "network", message: e && e.message ? e.message : String(e)};
      if (attempt < MAX_ATTEMPTS) { await new Promise(res => setTimeout(res, RETRY_DELAY_MS)); continue; }
    }
  }

  if (!gr) {
    if (lastErr && lastErr.kind === "timeout") return rj({error: "Gemini API did not respond after " + MAX_ATTEMPTS + " attempts (server-side timeout) -- Google's API may be overloaded right now"}, 504);
    if (lastErr && lastErr.kind === "network") return rj({error: "Network error calling Gemini API: " + lastErr.message}, 502);
    return rj({error: "Gemini API is overloaded (HTTP " + (lastErr && lastErr.status) + ") after " + MAX_ATTEMPTS + " attempts -- try again in a moment"}, 503);
  }

  let gd;
  try { gd = await gr.json(); }
  catch (e) { return rj({error: "Gemini returned a non-JSON response (HTTP " + gr.status + ")"}, 502); }
  if (!gr.ok) return rj({error: gd?.error?.message || ("Error Gemini (HTTP " + gr.status + ")")}, 500);

  const raw = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let parsed = null;
  try { parsed = JSON.parse(raw.trim()); } catch(e) {}
  if (!parsed) { const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) try { parsed = JSON.parse(m[1].trim()); } catch(e) {} }
  if (!parsed) { const m = raw.match(/\{[\s\S]*?\}/); if (m) try { parsed = JSON.parse(m[0]); } catch(e) {} }
  if (!parsed) return rj({error: "No se leyeron los datos. Raw: " + raw.substring(0,100)}, 422);

  const coil = parsed.coil ? String(parsed.coil).trim() : null;
  const peso = normalizePeso(parsed.peso);
  const producto = normalizeProducto(parsed.producto);
  const cast = parsed.cast ? String(parsed.cast).trim() : null;

  return rj({ ok:true, peso, producto, coil, cast });
}

function normalizePeso(raw) {
  if (!raw) return null;
  const m = String(raw).replace(",",".").match(/\d+\.?\d*/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (isNaN(n)) return null;
  if (String(raw).toLowerCase().includes("kg") && n > 100) n = n/1000;
  return n.toFixed(3);
}

function normalizeProducto(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d+\.?\d*)\s*[Mm][Mm]/);
  if (m) return "COIL REIN " + parseFloat(m[1]) + "mm";
  return String(raw).toUpperCase().trim();
}

function rj(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{"Content-Type":"application/json"} });
}
