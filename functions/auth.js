// POST /auth  { password }  ->  { token }   (la contrasena vive en la variable EDIT_PASSWORD del servidor)
import { json } from "../lib/db.js";
import { authConfigured, checkPassword, issueToken } from "../lib/auth.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!authConfigured(env)) return json({ error: "Servidor sin configurar: falta EDIT_PASSWORD / AUTH_SECRET" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Body invalido" }, 400); }
  if (!(await checkPassword(env, body && body.password))) {
    await new Promise(function (r) { setTimeout(r, 600); }); // frena fuerza bruta
    return json({ error: "Contrasena incorrecta" }, 401);
  }
  return json({ token: await issueToken(env), ttl: 12 * 3600 });
}
