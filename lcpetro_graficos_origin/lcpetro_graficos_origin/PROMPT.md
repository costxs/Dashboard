# Gráficos padrão Origin na aba "Tratamento de dados de coreflood › Permeabilidade"

Antes:
1. Rode `banco/2026101300 Publique o serviço `servico-graficos/` (README dentro: VM da UFPA com Nginx, ou Docker).
   Para testar na sua máquina: `MODO_DEV=1 uvicorn app:app --port 8010`.
3. No `.env.local` do gerencial e do dashboard: `VITE_URL_GRAFICOS=https://SEU-DOMINIO/graficos`
   (local: `http://localhost:8010`).
4. Copie `servico-graficos/` e `exemplos/` para `docs/referencia/graficos/` no gerencial.0016_config_graficos.sql` no SQL Editor do Supabase.
2.

## Gerencial

```
Na aba Tratamento de dados de coreflood › Permeabilidade, depois da tabela de etapas, crie o cartão
"Gráficos (padrão Origin)". Os gráficos são gerados pelo serviço Python em VITE_URL_GRAFICOS
(contrato em docs/referencia/graficos/servico-graficos/graficos/permeabilidade.py e README):
POST /permeabilidade/grafico e POST /permeabilidade/origin, sempre com
Authorization: Bearer <access_token da sessão do Supabase>.

Monte o corpo a partir do que a tela já tem: leituras = {t: tempo_s, dp, q} do ensaio;
etapas = {ordem, q, t_inicio, t_fim, j_inicio, j_fim, dp_medio, k_md, usada} de cada etapa,
mais as escolhas da pessoa (cor, rotulo, marcador, visivel); config = painel abaixo +
comprimento_cm, diametro_cm e viscosidade_cp usados no cálculo.

Painel de edição (à esquerda) e prévia (à direita):
- Gráfico principal: UM gráfico só com todas as vazões (modo "combinado"), cada vazão na sua cor,
  contínuo: onde termina uma vazão começa a outra (config.continuo = true, padrão; pausas com Q = 0 somem).
  Opção "Como mostrar": "Em sequência" (eixo de tempo do ensaio, padrão) ou "Sobrepostas"
  (config.sobrepor = true: todas começando em t = 0, uma sobre a outra). No modo em sequência o k
  de cada vazão aparece escrito sobre o seu trecho estável.
- Abaixo dele, um segundo gráfico menor "ΔP × Q" (modo "darcy") com a reta e o k da amostra.
- Os modos "por_vazao" e "painel" continuam no serviço, mas não aparecem na tela.
- Por etapa: cor (<input type="color">, começa na sequência do Origin: preto, vermelho, azul,
  verde, magenta, oliva...), rótulo, marcador (nenhum, ●, ■, ▲, ◆, ▼) e "mostrar".
- Geral: título, título do eixo X e Y, fonte (Arial, Times New Roman, Calibri), tamanho da fonte,
  largura e altura (cm), espessura da linha e do eixo, marcas para dentro/fora, tempo de cada
  etapa começando em zero, tempo em minutos, limites X e Y (vazio = automático), mostrar trecho
  estável, ΔP médio, k e legenda.
- Prévia: PNG com dpi 110, refeita 400 ms depois da última mudança (cancele o pedido anterior).
  Mostre "gerando…" e, se o serviço não responder, a mensagem de erro em português.
- Botões: "Baixar PNG (300 dpi)", "Baixar SVG (editável)", "Baixar PDF", "Planilha para o Origin
  (.xlsx)" e "Baixar todos" (zip com o gráfico único + ΔP × Q).
- Guarde a configuração (cores por etapa, títulos, eixos...) em analise_petrofisica.config_graficos
  ao gravar o tratamento na amostra, e use-a de novo ao reabrir. As últimas escolhas de cada
  usuário (fonte, tamanho, cores) ficam também no localStorage como padrão para o próximo ensaio.
Compare com docs/referencia/graficos/exemplos/. Rode tsc, oxlint e build.
```

## Dashboard

```
Na ficha da amostra, aba Petrofísica, no cartão "Permeabilidade por etapas de vazão": mostre os
gráficos gerados pelo serviço VITE_URL_GRAFICOS (POST /permeabilidade/grafico com o token da
sessão), usando a config salva em analise_petrofisica.config_graficos e as leituras da curva
ΔP × tempo gravada. O gráfico único (com a opção em sequência/sobrepostas) e o ΔP × Q; botões para baixar PNG, SVG e PDF.
Só visualização: sem painel de edição. Rode tsc, oxlint e build.
```

## Correção: botão "Exportar planilha separada (.xlsx)" (gerencial)

```
O .xlsx exportado hoje sai com as 38 colunas do equipamento, sem formatação. Ele precisa sair no
formato que o pesquisador usa (aba Planilha1 com a tabela do Excel "Tabela2" começando em B2, só
as colunas da permeabilidade e a coluna "Etapa" = "Permeabilidade 1, 2, 3...", mais uma aba
"Resumo"). Quem gera agora é o serviço Python:

POST {VITE_URL_GRAFICOS}/permeabilidade/planilha-etapas  (multipart/form-data)
  - arquivo: o MESMO arquivo .xlsx do equipamento que a pessoa arrastou (guarde o File na tela)
  - pedido:  JSON { etapas: [{ordem, q, j_inicio, j_fim, dp_medio, dp_desvio, n_pontos,
             volume_injetado_cm3, volume_bombeado_cm3, k_md, usada}], metodo_k,
             comprimento_cm, diametro_cm, viscosidade_cp }
  - Authorization: Bearer <access_token da sessão>
A resposta é o .xlsx pronto: baixe com o nome "<arquivo>_etapas.xlsx". Apague o código antigo que
montava a planilha com SheetJS. Compare com docs/referencia/graficos/exemplos/
permeabilidade_ficticio_etapas_novo.xlsx. Rode tsc, oxlint e build.
```
