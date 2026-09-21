-- =====================================================================
--  Coil Scanner — ARCHIVO 3 de 3: OPCIONALES
-- =====================================================================

-- ---------------------------------------------------------------------
-- OPCIONAL A — ¿la columna imagen_b64 guarda algo? (la app ya no la escribe)
-- ---------------------------------------------------------------------
-- select count(*) filter (where imagen_b64 is not null) as con_imagen, count(*) as total from etiquetas;
-- Si da 0 con imagen, se puede borrar:  alter table etiquetas drop column imagen_b64;

-- ---------------------------------------------------------------------
-- OPCIONAL B — vista con el cruce escaneado vs consignment calculado en el servidor
--              (la app NO la usa todavia; sirve para consultas/reportes desde SQL)
-- ---------------------------------------------------------------------
create or replace view v_consignment_status with (security_invoker = on) as
select c.referencia,
       min(c.fecha)                                   as fecha,
       count(*)                                       as coils,
       count(e.coil)                                  as escaneados,
       count(*) - count(e.coil)                       as faltantes,
       round(sum(c.peso)::numeric, 3)                 as toneladas,
       round(sum(c.peso) filter (where e.coil is null)::numeric, 3) as toneladas_faltantes
from consignments c
left join etiquetas e on e.coil = c.lot_no
group by c.referencia
order by c.referencia;
