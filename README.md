# Memória Experimental — LC PETRO (front-end)

Dashboard do laboratório, feito com React 19, Vite, Tailwind v4, Zustand e Recharts. Os dados ficam no **Supabase**: login, banco e arquivos. O banco e as migrações estão no pacote `memoria-experimental-backend` (pasta `supabase/migrations`).

## Rodar

```bash
npm install
cp .env.example .env.local     # preencher URL e chave anon do Supabase
npm run dev
```

Sem o `.env.local`, o app abre uma tela explicando o que falta. Na Vercel, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em *Settings → Environment Variables*.

## Organização

```
src/
  lib/supabase.ts             cliente Supabase
  tipos/banco.ts              tipos das tabelas e views
  config/analises.ts          AS 8 ANÁLISES: campos, unidades, listas, curvas
  servicos/                   todas as consultas ao banco
  store/useContexto.ts        sessão + Empresa -> Projeto escolhido
  components/
    layout/                   Shell, Sidebar (azul), Header (faixa tricolor)
    analises/                 aba genérica, formulário, curvas, arquivos
    charts/                   linha, dispersão, taxa de reação (Levich)
  pages/
    LoginPage                 Supabase Auth
    ProjectSelectionPage      1) empresa  2) projeto (ou todos da empresa)
    DashboardPage             indicadores + work packages (editáveis)
    SamplesListPage           banco de amostras (origem, bacia/campo/poço, k, status)
    SampleFormPage            cadastro: afloramento ou testemunho
    SampleDetailPage          Visão geral + 1 Petrofísica … 8 MEV
    AnalisesPage              um ensaio em todas as amostras + gráficos
    LiteraturePage            Geral (dados da planilha) e Própria (LC PETRO)
    AdministracaoPage         empresas, projetos, acessos, sistemas ácidos
```

**Cores:** vermelho para ações principais, laranja para destaques e seleção, azul para a estrutura e os dados. Os tokens ficam em `src/index.css`.

## Acrescentar um campo numa análise

1. Crie a coluna no banco, pelo SQL Editor do Supabase:

   ```sql
   alter table analise_rda add column ph numeric;
   ```

2. Acrescente uma linha em `src/config/analises.ts`:

   ```ts
   { nome: 'ph', rotulo: 'pH', tipo: 'numero' }
   ```

Formulário, tabela e detalhe passam a mostrar o campo sem mexer em mais nada.

## Arquivos antigos

Os arquivos abaixo eram da versão com dados de exemplo. Estão vazios e podem ser apagados:

- `src/data/`
- `src/types/index.ts`
- `src/store/useSampleStore.ts`
- `src/utils/placeholderImage.ts`
- `src/pages/sample-tabs/`, exceto `VisaoGeralTab.tsx`
- `src/components/ImageComparator.tsx`
- `src/components/MetaField.tsx`
- `src/components/MineralComposition.tsx`
- `src/components/WorkPackageStatus.tsx`
- `src/components/charts/SCurveChart.tsx`
- `src/components/ui/Badge.tsx`, `Card.tsx`, `ProgressBar.tsx` e `StatCard.tsx`
