-- Testa as regras de acesso simulando usuários logados (como a API fará).
-- Pré-requisito: migrações + planilha fictícia importada + dados_exemplo.sql
\set ON_ERROR_STOP on

create temp table resultado (teste text, esperado text, obtido text);
grant all on resultado to authenticated;

set role authenticated;

-- ---------- sem login
set request.jwt.claim.sub = '';
insert into resultado select 'sem login não vê arquivos', '0', (select count(*) from storage.objects)::text;
insert into resultado select 'sem login não vê amostras', '0', (select count(*) from amostras)::text;
insert into resultado select 'sem login não vê literatura', '0', (select count(*) from lit_dados_rda)::text;

-- ---------- coordenador com acesso à EMPRESA Total -> vê TOTAL-A e TOTAL-B
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into resultado select 'nível empresa: projetos', 'TOTAL-A,TOTAL-B',
    (select string_agg(codigo, ',' order by codigo) from projetos);
insert into resultado select 'nível empresa: amostras', 'IL900,TST-001',
    (select string_agg(codigo, ',' order by codigo) from v_amostras);
insert into resultado select 'nível empresa: vê só a empresa dele', 'TOTAL',
    (select string_agg(sigla, ',') from empresas);

-- ---------- bolsista com acesso só ao PROJETO TOTAL-A
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into resultado select 'nível projeto: só TOTAL-A', 'IL900',
    (select string_agg(codigo, ',' order by codigo) from v_amostras);
insert into resultado select 'nível projeto: não vê testemunho do TOTAL-B', '0',
    (select count(*) from amostras where codigo = 'TST-001')::text;
insert into resultado select 'vê pontos da curva do seu projeto', '21',
    (select count(*) from curva_pontos)::text;
insert into resultado select 'vê fases do DRX', '2', (select count(*) from drx_fases)::text;
insert into resultado select 'Storage: bolsista vê 2 arquivos (DRX + relatório)', '2',
    (select count(*) from storage.objects)::text;
insert into resultado select 'vê relatório próprio restrito', '1',
    (select count(*) from publicacoes where id_referencia = 'LCP-0002')::text;
update amostras set observacoes = 'conferida' where codigo = 'IL900';

-- ---------- Petrobras
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into resultado select 'Petrobras só vê RDA900', 'RDA900',
    (select string_agg(codigo, ',' order by codigo) from v_amostras);
insert into resultado select 'Petrobras não vê petrofísica da Total', '0',
    (select count(*) from analise_petrofisica)::text;
insert into resultado select 'Petrobras não vê curva da Total', '0', (select count(*) from curva_pontos)::text;
insert into resultado select 'Petrobras não vê relatório restrito', '0',
    (select count(*) from publicacoes where id_referencia = 'LCP-0002')::text;
insert into resultado select 'Petrobras vê artigo próprio aberto', '1',
    (select count(*) from publicacoes where id_referencia = 'LCP-0001')::text;
insert into resultado select 'Petrobras vê literatura geral', '25',
    (select count(*) from lit_dados_rda)::text;
insert into resultado select 'comparação: literatura + só o RDA dele', '26',
    (select count(*) from v_rda_comparacao)::text;
insert into resultado select 'Storage: Petrobras só vê o arquivo dela', 'amostras/30000000-0000-0000-0000-000000000003/mev/imagem.png',
    (select string_agg(name, ',') from storage.objects);
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('arquivos', 'amostras/30000000-0000-0000-0000-000000000001/drx/x.pdf');
  insert into resultado values ('Storage: não envia para amostra alheia', 'bloqueado', 'ENVIOU');
exception when insufficient_privilege then
  insert into resultado values ('Storage: não envia para amostra alheia', 'bloqueado', 'bloqueado');
end $$;
insert into resultado select 'Petrobras não vê histórico da Total', '0',
    (select count(*) from historico where chave = 'IL900')::text;
update amostras set observacoes = 'hack' where codigo = 'IL900';   -- afeta 0 linhas

-- ---------- leitor do TOTAL-A: vê, não grava
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
insert into resultado select 'leitor vê IL900', '1', (select count(*) from amostras where codigo = 'IL900')::text;
do $$ begin
  insert into analise_petrofisica (amostra_id, porosidade_pct)
  values ('30000000-0000-0000-0000-000000000001', 10);
  insert into resultado values ('leitor não insere análise', 'bloqueado', 'INSERIU');
exception when insufficient_privilege then
  insert into resultado values ('leitor não insere análise', 'bloqueado', 'bloqueado');
end $$;
update lit_dados_rda set temperatura_c = 999 where id_ensaio = 'RDA-0001';  -- afeta 0 linhas

-- ---------- editor de projeto não cria amostra em projeto alheio
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  insert into amostras (codigo, projeto_id, litologia, tipo_origem)
  values ('X1', '20000000-0000-0000-0000-00000000000c', 'Austin Chalk', 'afloramento');
  insert into resultado values ('não cria amostra em projeto alheio', 'bloqueado', 'INSERIU');
exception when insufficient_privilege then
  insert into resultado values ('não cria amostra em projeto alheio', 'bloqueado', 'bloqueado');
end $$;
do $$ begin
  insert into projetos (empresa_id, codigo, nome)
  values ('10000000-0000-0000-0000-000000000001', 'NOVO', 'Novo');
  insert into resultado values ('só admin cria projeto', 'bloqueado', 'INSERIU');
exception when insufficient_privilege then
  insert into resultado values ('só admin cria projeto', 'bloqueado', 'bloqueado');
end $$;

-- ---------- admin cria projeto novo fora de Total/Petrobras
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into empresas (sigla, nome) values ('SHELL', 'Empresa nova');
insert into projetos (empresa_id, codigo, nome)
select id, 'SHELL-1', 'Projeto novo' from empresas where sigla = 'SHELL';
insert into resultado select 'admin cria empresa e projeto', '1',
    (select count(*) from projetos where codigo = 'SHELL-1')::text;

reset role;

-- ---------- cálculos e histórico
insert into resultado select 'literatura intacta', '23',
    (select temperatura_c::text from lit_dados_rda where id_ensaio = 'RDA-0001');
insert into resultado select 'edição da Petrobras não aconteceu', 'conferida',
    (select observacoes from amostras where codigo = 'IL900');
insert into resultado select 'histórico registrou quem editou', 'bolsista@lab',
    (select u.email from historico h join perfis u on u.id = h.usuario_id
     where h.chave = 'IL900' and h.operacao = 'UPDATE' order by h.id desc limit 1);
insert into resultado select 'perda de massa (%)', '6.00',
    (select round(perda_massa_pct, 2)::text from analise_reatividade_estatica);
insert into resultado select 'razão ΔP coreflooding', '40',
    (select round(razao_dp)::text from analise_coreflooding);
insert into resultado select 'volume poroso IL900 (cm³)', '13.791',
    (select volume_poroso_cm3::text from v_amostras where codigo = 'IL900');
insert into resultado select 'RDA lab: √ω a 100 rpm', '3.236',
    (select round(raiz_omega, 3)::text from analise_rda where rotacao_rpm = 100);
insert into resultado select 'literatura: conc_pct HCl 0,1 N', '0.3639',
    (select conc_pct::text from v_lit_dados_rda where id_ensaio = 'RDA-0001');

select case when esperado = obtido then 'OK   ' else 'FALHOU' end as status, teste, esperado, obtido
from resultado;
select count(*) filter (where esperado is distinct from obtido) as falhas from resultado;
