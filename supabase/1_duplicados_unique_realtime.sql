-- =====================================================================
--  Coil Scanner — configuracion de Supabase (SQL Editor)
--  ARCHIVO 1 de 3. Se puede correr de nuevo sin romper nada.
--  Corre primero el PASO 1 solo (diagnostico). Si hay duplicados, limpia con el PASO 2 y despues corre el PASO 3.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — DIAGNOSTICO: ¿hay duplicados hoy? (solo lee, no cambia nada)
-- ---------------------------------------------------------------------
select 'etiquetas duplicadas' as que, coil as valor, count(*) as veces
from etiquetas where coil is not null group by coil having count(*) > 1
union all
select 'consignments duplicados', lot_no, count(*)
from consignments where lot_no is not null group by lot_no having count(*) > 1;

-- Si el PASO 1 no devolvio filas, salta directo al PASO 3.

-- ---------------------------------------------------------------------
-- PASO 2 — LIMPIAR duplicados (deja el mas antiguo). Solo si el PASO 1 mostro filas.
--          Quita los "--" de las lineas para ejecutarlo.
-- ---------------------------------------------------------------------
-- delete from etiquetas where ctid in (
--   select ctid from (select ctid, row_number() over (partition by coil order by created_at asc nulls last, ctid) rn
--                     from etiquetas where coil is not null) t where rn > 1);
-- delete from consignments where ctid in (
--   select ctid from (select ctid, row_number() over (partition by lot_no order by created_at asc nulls last, ctid) rn
--                     from consignments where lot_no is not null) t where rn > 1);

-- ---------------------------------------------------------------------
-- PASO 3 — La base impide los duplicados (UNIQUE) + activa tiempo real
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_coil_key') then
    alter table etiquetas add constraint etiquetas_coil_key unique (coil);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'consignments_lot_no_key') then
    alter table consignments add constraint consignments_lot_no_key unique (lot_no);
  end if;
end $$;
-- (Postgres permite varios NULL en una columna UNIQUE, asi que filas sin coil/lote no chocan.)

do $$
begin
  begin alter publication supabase_realtime add table etiquetas;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table consignments;  exception when duplicate_object then null; end;
end $$;
