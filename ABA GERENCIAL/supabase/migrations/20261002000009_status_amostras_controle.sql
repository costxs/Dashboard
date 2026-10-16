-- =============================================================================
-- 009 · Status das amostras com o vocabulário da planilha de controle de rochas
-- Planilha: Disponível · Reservada · Utilizada · Não localizada
-- Banco antes: cadastrada · em ensaio · utilizada · arquivada
-- Depois:      disponivel · reservada · em ensaio · utilizada · nao localizada · arquivada
-- ("cadastrada" vira "disponivel"; os rótulos com acento ficam no front)
-- =============================================================================
alter table public.amostras drop constraint if exists amostras_status_check;

update public.amostras set status = 'disponivel' where status = 'cadastrada';

alter table public.amostras
    alter column status set default 'disponivel',
    add constraint amostras_status_check
        check (status in ('disponivel', 'reservada', 'em ensaio', 'utilizada', 'nao localizada', 'arquivada'));

-- Petrofísica e conferência não têm chave natural; estes índices evitam duplicar
-- quando a mesma planilha é importada de novo (o importador atualiza em vez de inserir).
create index if not exists petrofisica_amostra_momento_idx
    on public.analise_petrofisica (amostra_id, momento, data_ensaio);
create index if not exists conferencias_amostra_data_idx
    on public.conferencias (amostra_id, data);
