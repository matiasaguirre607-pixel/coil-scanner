// Helpers compartidos por las Functions (Cloudflare Pages). Importar como ../lib/db.js
export const SB_URL_DEFAULT = "https://xqzqrlxjzfxpqigjuzor.supabase.co";
// Clave ANON (publica por diseno). Solo se usa como respaldo si aun no configuraste SUPABASE_SERVICE_KEY.
export const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxenFybHhqemZ4cHFpZ2p1em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTIwMDIsImV4cCI6MjEwMzg2ODAwMn0.88ZaPDl4-gM78t7_upZQclTrqCIdu5FAsKWn9HWBBkQ";

export function sbConf(env) {
  return { base: env.SUPABASE_URL || SB_URL_DEFAULT, key: env.SUPABASE_SERVICE_KEY || SB_ANON, service: !!env.SUPABASE_SERVICE_KEY };
}

export function sbHeaders(conf, extra) {
  const h = Object.assign({ apikey: conf.key }, extra || {});
  if (String(conf.key).startsWith("eyJ")) h.Authorization = "Bearer " + conf.key; // JWT legacy; las sb_secret_* van solo en apikey
  return h;
}

export function sbFetch(env, path, init) {
  const c = sbConf(env);
  const i = init || {};
  return fetch(c.base + "/rest/v1/" + path, Object.assign({}, i, { headers: sbHeaders(c, i.headers) }));
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json" } });
}

export function validId(id) { return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || "")); }

export function clean(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, max || 100);
}

export function cleanPeso(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  if (!isFinite(n) || n <= 0 || n > 100) return null;
  return n.toFixed(3);
}

export function cleanMaquina(v) {
  const s = String(v || "").toUpperCase();
  return s === "EVG" || s === "PITTINI" ? s : null;
}

export function validCoil(c) { return /^[A-Za-z0-9-]{3,24}$/.test(String(c || "")); }

export async function findEtiqueta(env, coil) {
  const r = await sbFetch(env, "etiquetas?coil=eq." + encodeURIComponent(coil) + "&select=id,coil,cast,peso,producto,wo,created_at&limit=1");
  const rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Inserta una etiqueta. Devuelve {ok:true} | {duplicate:true, existing} | {error, status}
export async function insertEtiqueta(env, row) {
  const dup = await findEtiqueta(env, row.coil);
  if (dup) return { duplicate: true, existing: dup };
  const r = await sbFetch(env, "etiquetas", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row)
  });
  if (r.ok) return { ok: true };
  if (r.status === 409) { // violacion del UNIQUE (dos operarios escanearon el mismo coil a la vez)
    return { duplicate: true, existing: (await findEtiqueta(env, row.coil)) || { coil: row.coil } };
  }
  const t = await r.text();
  return { error: "Error guardando: " + t.substring(0, 120), status: 500 };
}
