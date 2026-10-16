# Aba "Tratamento de dados de coreflood" › Permeabilidade

Antes:
1. Rode `banco/20261013000015_tratamento_permeabilidade.sql` no SQL Editor do Supabase
   (abra o arquivo, copie todo o conteúdo, cole e clique em Run).
2. Copie a pasta `importador/` para `docs/referencia/importador/` no gerencial.

## Gerencial

```
Crie no menu lateral (seção Lançamento de dados, só editor/admin) o item "Tratamento de dados de
coreflood", com duas abas: "Permeabilidade" e "Acidificação" (esta só com "em breve" por enquanto).

A lógica está pronta e testada em docs/referencia/importador/tratamentoPermeabilidade.ts
(+ permeabilidade.test.ts e permeabilidade_ficticio.xlsx). Copie para src/importador/ SEM reescrever
a lógica (lerArquivoBruto vem de lerArquivo.ts).

Aba Permeabilidade — passos na mesma tela, de cima para baixo:
1. Arquivo: arrastar o .xlsx exportado pelo equipamento. lerEnsaios(bruta) acha a aba com
   "Tempo (s)" e "Q (cm³/min)" e lê o cabeçalho "Chave: valor" (usuário, data, amostra,
   comprimento, diâmetro, porosidade, viscosidade, fluido, garrafas). Se houver mais de uma aba
   com leituras, use a primeira (a exportação bruta) e deixe trocar.
2. Amostra: o código do cabeçalho (ex.: IL183) já selecionado na busca de amostras do projeto.
   Campos editáveis: comprimento, diâmetro, viscosidade (vêm do cabeçalho). Se diferirem mais de
   2% do cadastro da amostra, mostrar aviso com os dois valores.
3. Gráfico ΔP × tempo (Recharts, um eixo Y só): cada etapa de vazão como faixa de fundo
   alternada com o rótulo "Q = 2 cm³/min", e o trecho estável usado no cálculo destacado.
   A pessoa ajusta o trecho estável de cada etapa (início/fim em s, ou arrastando) e o
   recálculo é na hora (opções.janelas). Controle "fração final estável" (padrão 50%).
4. Tabela de etapas: Q, duração, trecho usado, nº de pontos, ΔP médio ± desvio, CV%,
   volume injetado (Q×t), volume bombeado (bomba), k da etapa, k do equipamento, selo
   "estável"/"não estabilizou", e caixa "usar" (padrão: as estáveis).
5. Gráfico ΔP × Q com os pontos das etapas usadas e a reta pela origem do ajuste; mostrar
   k (ajuste) com R² e k (média das etapas). Avisos de resultado.avisos em destaque.
6. Botões:
   - "Gravar na amostra": escolher k = ajuste ΔP × Q (padrão) ou média das etapas e chamar
     gravarPermeabilidade (cria a petrofísica "antes" com k em fluxo, as etapas e a curva
     ΔP × tempo). Confirmação antes, e depois link "Abrir ficha da amostra".
   - "Exportar planilha separada (.xlsx)": as leituras do trecho estável de cada etapa no
     formato que o pesquisador usava (mesmas colunas da Planilha1, com a coluna final
     "Permeabilidade 1", "Permeabilidade 2"... por etapa).
Rode npx vitest run src/importador, tsc, oxlint e build. Teste com
docs/referencia/importador/permeabilidade_ficticio.xlsx (dados inventados): 3 etapas (Q = 2, 4 e 6;
a pausa com Q = 0 não conta), ΔP ≈ 3,6 / 7,3 / 10,9 psi, k ≈ 78 mD em todas e no ajuste (R² > 0,999).
Com "fração final" em 100% as etapas devem aparecer como "não estabilizou".
```

## Dashboard

```
Na ficha da amostra, aba 1. Petrofísica: quando o registro tiver etapas em permeabilidade_etapas,
mostre abaixo dele um cartão "Permeabilidade por etapas de vazão" com a tabela das etapas
(Q, ΔP médio ± desvio, volume, k, usada sim/não), o gráfico ΔP × Q com a reta do ajuste e a curva
ΔP × tempo já gravada em curvas. Mostre também viscosidade, fluido e "k por: ajuste ΔP × Q".
Rode tsc, oxlint e build.
```
