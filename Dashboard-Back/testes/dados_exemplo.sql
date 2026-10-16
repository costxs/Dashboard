-- Dados FICTÍCIOS para testar amostras, análises e acesso. Não usar em produção.
\set ON_ERROR_STOP on

-- no Supabase os usuários nascem no Auth; o gatilho cria o perfil
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@lab',        '{"nome": "Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'coord.total@lab',  '{"nome": "Coordenador Total"}'),   -- nível EMPRESA
  ('00000000-0000-0000-0000-00000000000c', 'bolsista@lab',     '{"nome": "Bolsista projeto A"}'),  -- nível PROJETO
  ('00000000-0000-0000-0000-00000000000d', 'petro@lab',        '{"nome": "Pesquisador Petrobras"}'),
  ('00000000-0000-0000-0000-00000000000e', 'leitor@lab',       '{"nome": "Leitor projeto A"}');
update perfis set administrador = true where email = 'admin@lab';

insert into empresas (id, sigla, nome) values
  ('10000000-0000-0000-0000-000000000001', 'TOTAL', 'TotalEnergies'),
  ('10000000-0000-0000-0000-000000000002', 'PETROBRAS', 'Petrobras'),
  ('10000000-0000-0000-0000-000000000003', 'LCPETRO', 'LC PETRO / UFPA (interno)');

insert into projetos (id, empresa_id, codigo, nome) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'TOTAL-A', 'Total — acidificação análogos'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'TOTAL-B', 'Total — testemunhos reais'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002', 'PETRO-1', 'Petrobras — reatividade'),
  ('20000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000003', 'INTERNO-1', 'Projeto interno');

insert into membros (usuario_id, empresa_id, projeto_id, papel) values
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', null, 'editor'),
  ('00000000-0000-0000-0000-00000000000c', null, '20000000-0000-0000-0000-00000000000a', 'editor'),
  ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000002', null, 'editor'),
  ('00000000-0000-0000-0000-00000000000e', null, '20000000-0000-0000-0000-00000000000a', 'leitor');

insert into work_packages (projeto_id, codigo, nome, progresso_planejado, progresso_realizado) values
  ('20000000-0000-0000-0000-00000000000a', 'WP1', 'Treinamento', 100, 100),
  ('20000000-0000-0000-0000-00000000000a', 'WP5', 'Caracterização petrofísica', 60, 45);

-- amostras: uma de afloramento (projeto TOTAL-A), um testemunho (TOTAL-B), uma da Petrobras
insert into amostras (id, codigo, projeto_id, litologia, tipo_origem, afloramento_local, fornecedor,
                      diametro_cm, comprimento_cm, massa_seca_g, permeabilidade_fabricante_md,
                      finalidade, status) values
  ('30000000-0000-0000-0000-000000000001', 'IL900', '20000000-0000-0000-0000-00000000000a',
   'Indiana Limestone', 'afloramento', 'Bedford, Indiana', 'Fornecedor X', 3.80, 7.60, 190.0, 5.0,
   'coreflooding', 'utilizada');
insert into amostras (id, codigo, projeto_id, litologia, tipo_origem, bacia, campo, poco, reservatorio,
                      profundidade_m, diametro_cm, comprimento_cm, massa_seca_g, status) values
  ('30000000-0000-0000-0000-000000000002', 'TST-001', '20000000-0000-0000-0000-00000000000b',
   'Indiana Limestone', 'testemunho', 'Bacia Ficticia', 'Campo F', 'POCO-1', 'Reservatório R', 5200.5,
   3.81, 5.0, 120.0, 'cadastrada');
insert into amostras (id, codigo, projeto_id, litologia, tipo_origem, afloramento_local,
                      diametro_cm, comprimento_cm, massa_seca_g, finalidade, status) values
  ('30000000-0000-0000-0000-000000000003', 'RDA900', '20000000-0000-0000-0000-00000000000c',
   'Austin Chalk', 'afloramento', 'Texas', 3.81, 1.0, 25.0, 'RDA', 'em ensaio');

-- 1 petrofísica (antes e depois), 3 coreflooding, 4 reatividade estática, 5 RDA, 6 DRX
insert into analise_petrofisica (amostra_id, data_ensaio, momento, pressao_confinamento_psi,
                                 porosidade_pct, permeabilidade_gas_md, permeabilidade_liquido_md) values
  ('30000000-0000-0000-0000-000000000001', '2026-05-10', 'antes', 1000, 16.0, 2.5, 1.0),
  ('30000000-0000-0000-0000-000000000001', '2026-06-20', 'depois', 1000, 17.2, null, 850);
insert into analise_coreflooding (amostra_id, data_ensaio, id_sistema, vazao_ml_min, temperatura_c,
                                  pressao_confinamento_psi, breakthrough, pvbt, dp_inicial_psi,
                                  dp_final_psi, morfologia_wormhole) values
  ('30000000-0000-0000-0000-000000000001', '2026-06-15', 'SA01', 2.0, 25, 1500, true, 1.4, 120, 3, 'dominante');
insert into analise_reatividade_estatica (amostra_id, id_sistema, temperatura_c, tempo_min,
                                          massa_inicial_g, massa_final_g) values
  ('30000000-0000-0000-0000-000000000003', 'SA02', 25, 30, 25.0, 23.5);
insert into analise_rda (amostra_id, id_sistema, rotacao_rpm, pressao_psi, temperatura_c,
                         taxa_reacao_mol_cm2_s, metodo_quantificacao) values
  ('30000000-0000-0000-0000-000000000003', 'SA02', 100, 1000, 23, 4.0e-7, 'RDA / ICP-AES'),
  ('30000000-0000-0000-0000-000000000001', 'SA01', 400, 1000, 25, 6.0e-7, 'RDA / ICP-AES');
insert into analise_drx (id, amostra_id, metodo) overriding system value values
  (900, '30000000-0000-0000-0000-000000000001', 'Rietveld');
insert into drx_fases values (900, 'Calcita', 97.5), (900, 'Quartzo', 2.5);

-- curva ΔP x PV do coreflooding
insert into curvas (id, amostra_id, analise_tabela, analise_id, nome, x_grandeza, x_unidade, y_grandeza, y_unidade)
overriding system value
select 900, amostra_id, 'analise_coreflooding', id, 'ΔP x PV', 'PV injetado', 'PV', 'ΔP', 'psi'
from analise_coreflooding limit 1;
insert into curva_pontos select 900, g, g * 0.1, 120 * exp(-g * 0.05) from generate_series(0, 20) g;

-- literatura PRÓPRIA: uma aberta, uma restrita ao projeto TOTAL-A
insert into publicacoes (id_referencia, categoria, tipo, autor, ano, titulo, projeto_id) values
  ('LCP-0001', 'propria', 'artigo', 'Equipe LC PETRO', '2026', 'Artigo aberto do laboratório', null),
  ('LCP-0002', 'propria', 'relatório', 'Equipe LC PETRO', '2026', 'Relatório WP5 — Total', '20000000-0000-0000-0000-00000000000a');
insert into publicacao_amostras values ('LCP-0002', '30000000-0000-0000-0000-000000000001');

insert into storage.objects (bucket_id, name) values
  ('arquivos', 'amostras/30000000-0000-0000-0000-000000000001/drx/difratograma.pdf'),
  ('arquivos', 'amostras/30000000-0000-0000-0000-000000000003/mev/imagem.png'),
  ('arquivos', 'publicacoes/LCP-0002/relatorio.pdf');
