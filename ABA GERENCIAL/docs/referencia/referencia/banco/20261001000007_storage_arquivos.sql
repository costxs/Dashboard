-- =============================================================================
-- 0007: arquivos no Supabase Storage (bucket privado "arquivos")
--
-- Convenção de caminho:
--   amostras/<amostra_id>/<analise>/<nome>     ex.: amostras/3f2c.../drx/difratograma.pdf
--   publicacoes/<id_referencia>/<nome>        ex.: publicacoes/LCP-0002/relatorio.pdf
-- Quem pode ver/enviar segue a mesma regra da amostra ou da publicação.
-- A tabela public.arquivos guarda os metadados (caminho = name do objeto).
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', false)
on conflict (id) do nothing;

create or replace function app.uuid_ou_nulo(t text)
returns uuid language plpgsql immutable as $$
begin
    return t::uuid;
exception when others then
    return null;
end $$;

create or replace function app.pode_ver_objeto(caminho text)
returns boolean language sql stable as $$
    select case (storage.foldername(caminho))[1]
        when 'amostras' then
            app.pode_ver_amostra(app.uuid_ou_nulo((storage.foldername(caminho))[2]))
        when 'publicacoes' then
            exists (select 1 from public.publicacoes p
                    where p.id_referencia = (storage.foldername(caminho))[2])
        else false
    end
$$;

create or replace function app.pode_editar_objeto(caminho text)
returns boolean language sql stable as $$
    select case (storage.foldername(caminho))[1]
        when 'amostras' then
            app.pode_editar_amostra(app.uuid_ou_nulo((storage.foldername(caminho))[2]))
        when 'publicacoes' then
            exists (select 1 from public.publicacoes p
                    where p.id_referencia = (storage.foldername(caminho))[2]
                      and case when p.projeto_id is null then app.eh_editor()
                               else app.pode_editar(p.projeto_id) end)
        else false
    end
$$;

grant execute on function app.uuid_ou_nulo(text), app.pode_ver_objeto(text),
                          app.pode_editar_objeto(text) to authenticated;

create policy arquivos_ler on storage.objects for select to authenticated
    using (bucket_id = 'arquivos' and app.pode_ver_objeto(name));
create policy arquivos_enviar on storage.objects for insert to authenticated
    with check (bucket_id = 'arquivos' and app.pode_editar_objeto(name));
create policy arquivos_alterar on storage.objects for update to authenticated
    using (bucket_id = 'arquivos' and app.pode_editar_objeto(name));
create policy arquivos_apagar on storage.objects for delete to authenticated
    using (bucket_id = 'arquivos' and app.pode_editar_objeto(name));
