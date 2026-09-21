-- =====================================================================
--  Coil Scanner — ARCHIVO 2 de 3: SEGURIDAD (RLS)
--  ⚠ EJECUTAR AL FINAL. Antes tienes que haber:
--     1) cargado en Cloudflare las variables SUPABASE_SERVICE_KEY, AUTH_SECRET y EDIT_PASSWORD
--     2) desplegado las Functions nuevas
--     3) probado que la app guarda y que el candado pide la contrasena
--  Si corres esto antes, la app NO podra guardar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SEGURIDAD (RLS): la clave publica solo puede LEER.
--          Todo lo que escribe pasa por las Functions con la SERVICE KEY.
--          ⚠ Ejecutar SOLO cuando ya estan desplegadas las Functions nuevas
--            y cargadas las variables en Cloudflare. Si no, la app no podra guardar.
-- ---------------------------------------------------------------------
alter table etiquetas    enable row level security;
alter table consignments enable row level security;
alter table produccion   enable row level security;

drop policy if exists anon_lectura on etiquetas;
drop policy if exists anon_lectura on consignments;
drop policy if exists anon_lectura on produccion;
create policy anon_lectura on etiquetas    for select to anon using (true);
create policy anon_lectura on consignments for select to anon using (true);
create policy anon_lectura on produccion   for select to anon using (true);

revoke insert, update, delete on etiquetas, consignments, produccion from anon;

-- Si tienes otras tablas en el proyecto, activales RLS tambien:
--   alter table <tabla> enable row level security;
