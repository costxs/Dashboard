# Memória Experimental — Painel de Cadastro (LC PETRO)

App onde o laboratório **lança e edita os dados**. Tudo o que é salvo aqui aparece no dashboard de visualização (pasta `dashboard`), porque os dois usam o mesmo banco Supabase.

Tem o mesmo visual do dashboard, com o selo "Modo cadastro" no topo.

| Menu | O que faz |
|---|---|
| Amostras e ensaios | cadastrar amostra (afloramento ou testemunho), conferências físicas; na ficha, lançar os 8 ensaios, importar curvas (colar do Excel/Origin ou .csv) e anexar arquivos |
| Work packages | criar e atualizar o andamento dos WPs (escolha um projeto específico) |
| Publicações LC PETRO | cadastrar artigos, TCCs e relatórios, com PDF e amostras usadas |
| Administração (só admin) | empresas, projetos, acessos (nível empresa ou projeto; editor ou leitor) e sistemas ácidos |

Quem pode gravar é decidido pelo banco: só o **editor** do projeto (ou o administrador). O **leitor** vê os dados, mas os botões de cadastro não aparecem para ele.

## Rodar

```bash
npm install
cp .env.example .env.local     # mesma URL e chave anon do dashboard
npm run dev
```

Publique na Vercel como um projeto separado do dashboard, com as mesmas duas variáveis.

## Literatura geral

A planilha de reatividade (literatura geral) não entra por aqui. Ela é carregada pelo importador em `Dashboard-Back/importador`.
