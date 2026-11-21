-- Upgrade existing Tabby installations; canonical schema.sql includes this index.
-- No records are deleted or changed. ALTER's transaction lock avoids a duplicate window.
begin;
alter table public.tabby_entries drop constraint if exists tabby_entries_circle_id_recurrence_key_key;
create unique index if not exists tabby_entries_active_recurrence_idx
 on public.tabby_entries(circle_id,recurrence_key) where status<>'void';
commit;
