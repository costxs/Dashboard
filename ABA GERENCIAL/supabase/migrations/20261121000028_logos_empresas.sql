-- =============================================================================
-- 028 · Foto/logo da empresa enviada no cadastro
--
--  * empresas.logo_url: endereço público da imagem (bucket logos-empresas).
--  * bucket público logos-empresas (imagens até 2 MB); só o administrador envia,
--    troca ou apaga (o mesmo papel que cadastra e exclui empresas).
--  O bucket LOGO continua só para os modelos de e-mail do login.
-- =============================================================================

alter table public.empresas add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos-empresas', 'logos-empresas', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_empresas_ler on storage.objects;
create policy logos_empresas_ler on storage.objects for select
    using (bucket_id = 'logos-empresas');

drop policy if exists logos_empresas_enviar on storage.objects;
create policy logos_empresas_enviar on storage.objects for insert
    with check (bucket_id = 'logos-empresas' and (select app.eh_admin()));

drop policy if exists logos_empresas_alterar on storage.objects;
create policy logos_empresas_alterar on storage.objects for update
    using (bucket_id = 'logos-empresas' and (select app.eh_admin()));

drop policy if exists logos_empresas_apagar on storage.objects;
create policy logos_empresas_apagar on storage.objects for delete
    using (bucket_id = 'logos-empresas' and (select app.eh_admin()));

notify pgrst, 'reload schema';
