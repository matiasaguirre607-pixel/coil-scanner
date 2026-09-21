# Coil Scanner — mejoras (guía de puesta en marcha)

## Qué hay en esta entrega
| # | Mejora | Dónde |
|---|--------|-------|
| 1 | Los PDF se leen por **texto** (exacto y gratis); si una página no es confiable cae a la IA | `index.html` (`parseConsPageItems`) |
| 2 | Al escanear: sugiere el coil correcto (1–2 dígitos mal leídos, o por cast + peso) y avisa diferencias de **peso / cast / producto** | `index.html` (`consVerify`) |
| 3 | **Seguridad real**: la contraseña vive en el servidor, las escrituras piden token y la base solo deja *leer* con la clave pública | `functions/`, `lib/`, `supabase/2_…` |
| 4 | La base impide duplicados (`UNIQUE`), incluso con dos operarios a la vez | `supabase/1_…`, `lib/db.js` |
| 5 | **Tiempo real** (Supabase Realtime) con respaldo cada 30 s; `/records` ya no corta en 500 | `index.html`, `functions/records.js` |
| 6 | Chequeos automáticos antes de publicar (`npm run verify` + GitHub Actions) | `tools/`, `.github/`, `package.json` |
| 7 | **Reporte Excel** para el proveedor (faltantes, dif. de peso, cast distinto, sin consignment) | pestaña Consignment |
| 8 | Limpieza: meta de coils y tolerancia de peso configurables, `sw.js` corregido, código muerto fuera | varios |

Además corregí: el candado no ejecutaba la acción pendiente al ingresar la contraseña (se borraba el callback antes de usarlo).

## Orden de despliegue (importa)
**Guía paso a paso con checklist: abre `INSTRUCTIVO.html`.** Resumen del orden:
1. Cloudflare: cargar `SUPABASE_SERVICE_KEY`, `AUTH_SECRET`, `EDIT_PASSWORD` (contraseña **nueva**).
2. GitHub: subir todo a una rama (`mejoras`) → Pull Request → esperar el check verde y la vista previa.
3. Supabase: `1_duplicados_unique_realtime.sql` (diagnóstico → limpiar si hace falta → UNIQUE + realtime).
4. Probar en la vista previa.
5. **Merge del Pull Request** (publicar) y probar en producción.
6. **Recién ahí** `2_seguridad_rls_AL_FINAL.sql`, y verificar que la clave pública ya no puede escribir.

Mantén `functions/scan.js` (la cola offline lo usa). `functions/updatewo.js` es nuevo (no me llegó el tuyo).

## Lo que NO queda cubierto
- **Escanear sigue abierto** (los operarios no usan contraseña): quien tenga la URL puede guardar un coil o usar `/extract` (gasto de Gemini). Lo mitigan la validación del servidor y el `UNIQUE`, pero si quieres cerrarlo del todo: Cloudflare Access, un PIN de operario, o un rate-limit en Cloudflare (Security → WAF).
- El lector de texto **no lo pude probar con un PDF real de Pacific Steel**, solo con uno generado. Pruébalo así: `npm i pdfjs-dist@3.11.174` y `node tools/inspect-pdf.js tu.pdf`; te dice qué páginas lee por texto y cuáles mandaría a la IA. Si una página no es confiable, cae sola a la IA (mismo comportamiento de antes).
- El tiempo real lo probé con un cliente simulado, no contra tu Supabase. Si el punto junto a “registros” queda gris, funciona igual con el refresco de 30 s.
- La vista `v_consignment_status` (archivo 3) no la usa la app: el navegador necesita las filas para sugerir correcciones.
- Consignment = una `referencia` (un PDF). Los PDF nuevos quedan con una sola referencia/fecha por archivo; lo ya guardado no se corrige solo.

## Trabajar sin romper producción
- `npm install` y luego `npm run verify` (revisa funciones inexistentes, HTML duplicado, ids repetidos, secretos, y corre 47 pruebas).
- GitHub Actions corre lo mismo en cada push. Para que **bloquee** el deploy: trabaja en una rama, abre un Pull Request y en GitHub → Settings → Branches activa “Require status checks” (`verify`). Cloudflare publica `main` al hacer merge y una URL de vista previa por rama.
- `package.json` hace que Cloudflare instale dependencias en cada build (unos segundos más); no afecta la app.
