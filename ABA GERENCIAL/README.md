# Memória Experimental — banco de dados e integração (LC PETRO/UFPA)

Por enquanto roda no **Supabase** (login, banco e arquivos). As migrações são SQL puro, então a troca
para um servidor próprio no futuro é pequena (ver o fim deste arquivo).

Organização conforme a reunião:

```
EMPRESA ──► PROJETO ──► AMOSTRA ──► 8 análises
                                     1 Petrofísica   2 Micro-CT   3 Coreflooding   4 Reatividade estática
                                     5 RDA           6 DRX        7 Petrografia    8 MEV
LITERATURA ─┬─ Geral   (publicações externas + dados extraídos: planilha BDD_LCPETRO_Reatividade)
            └─ Própria (artigos, TCCs, relatórios do LC PETRO; abertos ou restritos a um projeto)
```

```
supabase/migrations/          rodar em ordem
  …01_acesso_base.sql         perfis (Supabase Auth), empresas, projetos, membros, work packages
  …02_catalogos.sql           litologias, fluidos, sistemas ácidos (+ conversão de concentração)
  …03_amostras_analises.sql   amostras (afloramento/testemunho), 8 análises, curvas, arquivos
  …04_literatura.sql          publicações (geral/própria) e dados da literatura
  …05_views_e_gatilhos.sql    views para o front, dashboard, comparação lab x literatura, histórico
  …06_regras_de_acesso.sql    quem vê o quê
  …07_storage_arquivos.sql    bucket privado "arquivos" com as mesmas regras
testes/                       dados fictícios + 35 testes de acesso e cálculo (bash testes/rodar_testes.sh)
```

Todo o Python (importador, serviço de gráficos e geradores de planilhas fictícias) fica no backend:
`../Dashboard-Back/importador/`, `../Dashboard-Back/servico-graficos/` e `../Dashboard-Back/dados_teste/`.

## Amostras

- **Origem** (`tipo_origem`):
  - `afloramento` (outcrop): local, fornecedor, bloco
  - `testemunho`: bacia, campo, poço, reservatório, profundidade. O poço é obrigatório.
- **Litologia:** vem de uma lista única, a mesma usada pela literatura. Assim, o filtro "Indiana Limestone" traz amostras e dados publicados juntos.
- **Status:** `cadastrada`, `em ensaio`, `utilizada`, `arquivada`.
- **Conferência física:** fica em `conferencias` (data, responsáveis, resultado). Ela substitui a coluna "Conferência 11/08/26 - Heitor e Dulcidio".
- **Análises:** cada uma tem sua tabela `analise_*`, e uma amostra pode ter várias linhas de cada. A petrofísica, por exemplo, pode ser medida antes e depois da acidificação ou em várias pressões de confinamento.

Valores calculados pelo banco (ninguém digita):

| Análise | Cálculo |
|---|---|
| Reatividade estática | perda de massa em g e em % |
| Coreflooding | razão ΔP inicial/final (mais estável que k_f/k_i quando há breakthrough) |
| RDA | ω, √ω, T nominal e taxa em SI, como na planilha |
| `v_amostras` | volume poroso = π·(d/2)²·L·φ |

**Curvas:** ΔP × PV, massa × tempo e difratogramas ficam em `curvas` e `curva_pontos`, um ponto por linha, porque podem ter milhares de pontos.

**Arquivos:** .opju, PDFs, imagens de MEV e volumes de micro-CT vão para o Supabase Storage (bucket `arquivos`, privado), no caminho `amostras/<id>/<análise>/`. A tabela `arquivos` guarda nome, tamanho e caminho.

## Literatura

| | Geral | Própria |
|---|---|---|
| O que é | publicações externas + dados extraídos | o que o LC PETRO publicou |
| Tabelas | `publicacoes` (categoria `geral`), `lit_rochas`, `lit_dados_rda` | `publicacoes` (categoria `propria`) |
| Quem vê | todo usuário logado | todos, ou só o projeto quando `projeto_id` está preenchido |
| Extra | — | `publicacao_amostras` liga o artigo às amostras que ele usou |

Os ensaios do laboratório **não** ficam na literatura: ficam nas análises da amostra. A comparação entre os dois (Levich, temperatura, concentração) sai da view `v_rda_comparacao`, com a coluna `fonte` = `literatura` ou `lcpetro`.

## Acesso

Existem dois níveis de membro:
- **Empresa:** vê todos os projetos dela (ex.: coordenador do contrato Total).
- **Projeto:** vê só aquele projeto (ex.: bolsista).

Cada membro é `leitor` ou `editor`. O administrador (`perfis.administrador = true`) cria empresas e projetos, então Total e Petrobras deixam de ser fixos no código.

As regras ficam no próprio banco (RLS). Mesmo com a chave pública no front, um usuário da Petrobras não lê nenhuma linha nem arquivo da Total.

## Colocar no ar (Supabase)

1. Crie o projeto no Supabase.
2. SQL Editor → cole e rode as 7 migrações de `supabase/migrations/`, em ordem. Com a Supabase CLI, use `supabase db push`.
3. Authentication → Users → *Add user* para cada pessoa. O perfil é criado sozinho.
4. Authentication → Providers → Email: desative *Allow new users to sign up*. Assim só entra quem foi cadastrado.
5. No SQL Editor, dê o primeiro acesso:

```sql
update perfis set administrador = true where email = 'email.do.prof.pedro@ufpa.br';

insert into empresas (sigla, nome) values
  ('TOTAL', 'TotalEnergies'), ('PETROBRAS', 'Petrobras'), ('LCPETRO', 'LC PETRO (interno)');

insert into projetos (empresa_id, codigo, nome)
select id, 'TOTAL-2025', 'Acidificação — TotalEnergies' from empresas where sigla = 'TOTAL';

-- bolsista com acesso a um projeto
insert into membros (usuario_id, projeto_id, papel)
select u.id, p.id, 'editor' from perfis u, projetos p
where u.email = 'bolsista@ufpa.br' and p.codigo = 'TOTAL-2025';

-- coordenador com acesso a todos os projetos da empresa
insert into membros (usuario_id, empresa_id, papel)
select u.id, e.id, 'editor' from perfis u, empresas e
where u.email = 'coordenador@ufpa.br' and e.sigla = 'TOTAL';
```

## Importar a planilha de reatividade

Na pasta `../Dashboard-Back/`:

```bash
pip install -r importador/requirements.txt
export DATABASE_URL="<Supabase: botão Connect -> Session pooler>"
python importador/importar.py BDD_LCPETRO_Reatividade.xlsx                          # só confere
python importador/importar.py BDD_LCPETRO_Reatividade.xlsx --aplicar --usuario email@ufpa.br   # grava
```

- O passo 1 não grava nada. Ele salva `relatorio_validacao.xlsx` com cada problema (aba, linha, campo).
- **ERRO** bloqueia a gravação; **AVISO** só alerta; **CORRIGIDO** mostra o que foi padronizado sozinho.
- Reimportar é seguro: o mesmo id atualiza a linha, sem duplicar.
- A `DATABASE_URL` dá acesso total ao banco. Não coloque no código nem no GitHub.

## Front

O front é o projeto do dashboard (pasta `DASHBOARD`), já ligado a este banco. Para rodar, preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env.local` dele (modelo em `.env.example`).

## Migrar para servidor próprio (depois)

1. Trocar `app.usuario_atual()` (migração 01) para ler `current_setting('app.usuario_id')`, com uma API (FastAPI) fazendo o login.
2. Trocar `auth.users` por uma tabela própria de usuários.
3. Trocar o Storage por uma pasta no servidor.

Tabelas, views e regras por projeto continuam iguais.
