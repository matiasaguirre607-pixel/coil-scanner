// Login de administrador (contrasena en el servidor) + tokens firmados HMAC. Importar como ../lib/auth.js
import { json } from "./db.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(buf) {
  let s = "";
  new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uStr(str) { return b64u(enc.encode(str)); }
function fromB64uStr(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function authConfigured(env) { return !!(env.AUTH_SECRET && env.EDIT_PASSWORD); }

export async function issueToken(env, ttlSec) {
  const payload = b64uStr(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + (ttlSec || 12 * 3600) }));
  return payload + "." + b64u(await hmac(env.AUTH_SECRET, payload));
}

export async function checkPassword(env, given) {
  // se comparan los hashes para no filtrar el largo de la contrasena
  const a = b64u(await crypto.subtle.digest("SHA-256", enc.encode(String(given || ""))));
  const b = b64u(await crypto.subtle.digest("SHA-256", enc.encode(String(env.EDIT_PASSWORD))));
  return safeEqual(a, b);
}

export async function verifyToken(request, env) {
  if (!env.AUTH_SECRET) return false;
  const m = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (!m) return false;
  const parts = m[1].split(".");
  if (parts.length !== 2) return false;
  const expected = b64u(await hmac(env.AUTH_SECRET, parts[0]));
  if (!safeEqual(parts[1], expected)) return false;
  try { return JSON.parse(fromB64uStr(parts[0])).exp > Date.now() / 1000; } catch (e) { return false; }
}

// Uso: const denied = await requireAdmin(request, env); if (denied) return denied;
export async function requireAdmin(request, env) {
  if (!authConfigured(env)) return json({ error: "Servidor sin configurar: falta EDIT_PASSWORD / AUTH_SECRET" }, 503);
  if (!(await verifyToken(request, env))) return json({ error: "No autorizado" }, 401);
  return null;
}
