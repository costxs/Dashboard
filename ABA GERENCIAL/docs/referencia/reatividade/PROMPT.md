# Reatividade (RDA): importar o banco inteiro, cadastrar pelo painel e ligar às amostras

> **Versão 2 — RDA ligado ao banco de amostras.** A planilha de reatividade **não tem código de amostra** porque as
> 419 medidas vêm de 10 artigos de outros grupos: não existe disco físico no laboratório. Ela continua na Literatura.
> O que faltava era o lado do laboratório. Os discos RDA### da planilha de Controle de rochas entravam em `amostras`,
> mas o ensaio da coluna "Utilização" ficava só no texto e o disco aparecia **sem ensaio RDA**. A migração **021** e o
> módulo `rdaDosDiscos.ts` resolvem isto:
> 1. cada "Utilização" vira um ensaio RDA ligado ao disco (sistema ácido, temperatura, rotação; taxa "aguardando resultado");
> 2. as medidas da literatura passam de **RDA-0001 para LIT-0001**, para não confundir com o disco RDA###
>    (o banco renomeia o que já existe; o importador converte o código da planilha);
> 3. o **banco de amostras** do dashboard (`v_banco_amostras`) mostra também a literatura: uma linha por rocha × artigo,
>    marcada "sem disco físico". Nada falso é criado em `amostras`, então o inventário e as contagens não mudam;
> 4. a ficha do disco mostra a **literatura comparável** (mesma rocha; marca mesmo ácido e mesma temperatura).
>
> Se o prompt 1 ainda não foi usado, use o prompt 1 e depois o prompt 2. Se já foi, use só o prompt 2.

Este pacote faz três coisas. Primeiro, o importador passa a subir a planilha de reatividade inteira, incluindo as abas `qualidade` e `listas`. A prévia mostra o que é **novo**, o que **mudou** campo a campo e o que **fica igual** no banco. Segundo, o painel ganha o **cadastro por série**. Hoje é assim que a planilha é preenchida: uma condição (rocha, sistema, temperatura, pressão, disco) em várias rotações. Esse cadastro substitui a planilha a partir de agora. Terceiro, os ensaios RDA dos discos do laboratório ficam ligados às amostras.

A análise da planilha e as decisões que o laboratório precisa confirmar estão em `ANALISE.md`.

**Onde colocar:** descompacte este pacote em `docs/referencia/reatividade/` no projeto do **gerencial** e rode as migrações 020 e 021 no Supabase, nessa ordem, **antes** de usar os prompts.

## Arquivos

- `banco/20261112000020_reatividade_cadastro.sql`: a migração **020**. Para aplicá-la, cole o conteúdo no SQL Editor do Supabase, depois de ter rodado a 019. Ela cria:
  - códigos automáticos;
  - a temperatura nominal igual à planilha (18 ≤ T < 30 → 25);
  - `lit_listas`, `lit_qualidade` e a conferência (`conferido`, `conferido_por`, `conferido_em`);
  - as views `v_lit_pendencias`, `v_lit_conferencia` e `v_sistemas_duplicados`;
  - os campos novos em `lit_dados_rda` e `analise_rda`;
  - a função `lit_cadastrar_serie(p jsonb)`.
- `banco/20261116000021_rda_amostras_literatura.sql`: a migração **021** (rodar depois da 020). Ela:
  - cria em `analise_rda` os campos `origem_registro` ('controle' | 'formulario' | 'equipamento') e `texto_utilizacao`, com no máximo um ensaio 'controle' por disco;
  - renomeia RDA-nnnn → LIT-nnnn na literatura (as anotações de `lit_qualidade` acompanham) e muda o código automático para LIT-;
  - recria `v_analise_rda` (ganha `situacao`: aguardando resultado | com resultado) e `v_rda_comparacao`, que deixa de fora os ensaios do lab sem taxa;
  - cria a view `v_banco_amostras` e a função `rda_literatura_comparavel(p_amostra)`.

  Pode ser rodada de novo sem estragar nada.
- `importador/`, com o código:
  - `planilhaBdd.ts` (**v2**, substitui o anterior; converte RDA-nnnn → LIT-nnnn);
  - `cadastroReatividade.ts` (novo);
  - `rdaDosDiscos.ts` (novo): "Utilização" dos discos → ensaios RDA.
- `importador/`, com os testes e os dados fictícios:
  - `planilhaBdd.test.ts`: substitui o antigo `importador.test.ts`, que usava `BDD_ficticio.xlsx` e as contagens antigas;
  - `cadastroReatividade.test.ts`;
  - `cadastroReatividade.banco.test.ts`;
  - `rdaDosDiscos.test.ts`, com a planilha de controle **fictícia** `controle_rda_ficticio.xlsx` (gerador `gerar_controle_rda_ficticio.py`);
  - a planilha **fictícia** `BDD_ficticio_v2.xlsx` e o gerador `gerar_bdd_ficticio_v2.py`.
- `teste/`, para rodar os testes contra um PostgreSQL local com as regras de acesso valendo:
  - `sbPg.ts`: um cliente "tipo Supabase";
  - `supabase_stub.sql`: os esquemas `auth` e `storage` mínimos;
  - `pg.sh`: sobe o banco e aplica as migrações.

  Isso é opcional: os testes de banco são pulados se `PGPORTA` / `PGPORTA_BDD` / `PGPORTA_RDA` não estiverem definidos (um banco vazio para cada um).

## Prompt 1 para o Claude Code (gerencial) — importação e cadastro da literatura

```
Implemente a reatividade (RDA) no gerencial: importação completa da planilha e cadastro por série.
Leia antes docs/referencia/reatividade/ANALISE.md.

0. Copie de docs/referencia/reatividade/importador/ para src/importador/: planilhaBdd.ts (substitui),
   cadastroReatividade.ts, planilhaBdd.test.ts, cadastroReatividade.test.ts, cadastroReatividade.banco.test.ts,
   BDD_ficticio_v2.xlsx, gerar_bdd_ficticio_v2.py; e teste/sbPg.ts para src/teste/sbPg.ts.
   Apague src/importador/importador.test.ts (era da v1). Não reescreva a lógica. Rode:
   npx vitest run src/importador/planilhaBdd.test.ts src/importador/cadastroReatividade.test.ts
   (o .banco.test.ts só roda com PGPORTA de um PostgreSQL local: ver teste/pg.sh; sem isso ele é pulado.)
   Se o banco ainda não tiver a migração 020, mostre "Rode a migração 020 no Supabase" ao chamar as funções novas.

1. IMPORTAR PLANILHA › "Reatividade (planilha BDD)" — fluxo em 4 passos, no visual atual:
   a) Arquivo: lerArquivo(file) -> analisarBdd(planilha). Se a.abasFaltando, .aviso-erro com as abas.
   b) Prévia: cartões com a.contagens por tabela (publicações, fluidos, litologias, listas, rochas, sistemas,
      medidas, anotações de qualidade) e os contadores ERRO / AVISO / CORRIGIDO (vermelho / laranja / azul).
      Tabela de a.problemas com filtro por severidade e por aba: colunas Aba, Linha, Código, Campo, Mensagem.
   c) Comparar com o banco: const conf = await conferirBddNoBanco(supabase, a). Para cada tabela mostre
      "N novos · N alterados · N iguais · N só no banco (não serão apagados)". "Alterados" abre a lista
      campo a campo (antes -> depois). Esse passo é obrigatório antes do botão gravar.
   d) Gravar (btn-primary, com confirmação): gravarBdd(supabase, a, { pularErros, aoProgresso }).
      Se houver erros, o botão principal fica "Gravar pulando N linhas com erro" (pularErros: true).
      aoProgresso(tabela) atualiza uma barra com as tabelas na ordem. Ao fim: resumo r.gravadas e
      r.deixadasDeFora; link "Ver pendências" (item 3). Erro 42501 -> "Só editor ou administrador grava."

2. LITERATURA › REATIVIDADE › "Nova série" (formulário de uma tela, em cartões):
   a) Publicação: buscar existente (publicacoes, categoria geral) OU criar (autor, ano, título, periódico, DOI, link).
      Dica sob o campo: "uma publicação = um artigo".
   b) Rocha: escolher existente (lit_rochas + litologia) OU criar: litologia (select de litologias, permite nova)
      e "composição como no artigo" (texto). Ao digitar, lerComposicaoRocha(texto) preenche calcita %, dolomita %,
      qualificador e Ca/Mg (campos editáveis).
   c) Sistema ácido: escolher existente (busca por nome/composição) OU colar a composição:
      lerComposicaoSistema(texto) -> tabela editável de até 4 componentes (componente, valor, unidade com
      select wt% | vol% | N | M | mM | gpt | ppm | mg/L | g/L | mL/L). Mostre r.problemas. Com
      sistemaDosComponentes(...) e acharSistemaIgual(sistemasDoBanco, novo): se achar, .aviso-info
      "Esse sistema já existe: SA07 — usar ele" (botão). Ao lado, concMolar/concMassica do 1º componente usando
      fluidos_prop (sem propriedades: "sem conversão para M").
   d) Condição: temperatura (+ select °C | °F | K -> paraCelsius), pressão (psi | bar | MPa | kPa | atm -> paraPsi),
      dimensões do disco 1ª e 2ª (in | cm | mm -> paraPolegada; rótulos "diâmetro" e "espessura"), tipo da variável
      (rotação (RDA) | taxa de cisalhamento | não informada), método de quantificação e de coeficiente de difusão
      (selects de lit_listas, ativo = true, por ordem), procedência obtencao_dado (obrigatória; tabelado |
      lido de gráfico | medida na superfície | não catalogado) e "onde está na fonte" (fonte_local: Tabela 3,
      Fig. 7b). Mostre a temperatura nominal (temperaturaNominal). Guarde as unidades que a pessoa escolheu em
      unidades_originais ({ temperatura: '°F', pressao: 'bar', ... }).
   e) Pontos: tabela editável (rotação rpm ou cisalhamento 1/s, taxa com select de unidade -> paraMolCm2s,
      coef. de difusão opcional, observação), aceitando colar várias linhas do Excel (tab/; e vírgula decimal).
      Coluna calculada √ω (raizOmega). Ao lado, gráfico Recharts taxa × √ω com os pontos e a reta de
      ajusteLevich(pontos) + texto l.texto e R² (curva #c8102e; pontos já cadastrados da mesma rocha/sistema
      em #2a78d6 para comparar).
   f) Validação ao vivo: validarSerie(ids, condicao, pontos, existentes), com `existentes` vindo de
      v_lit_dados_rda filtrado pela mesma referência/rocha/sistema. ERRO bloqueia o botão; AVISO só mostra.
   g) Gravar (btn-primary): gravarSerieLiteratura(supabase, { id_referencia | publicacao, id_rocha | rocha,
      id_sistema | sistema, condicao, pontos }). É uma transação só no banco. Sucesso: "Série gravada:
      LIT-0420 a LIT-0425 (REF-R11 · RCH-23 · SA145)" e botões "Nova série com a mesma condição" (mantém
      a, b, c, d e limpa e) e "Ver no dashboard".
   Nunca envie colunas calculadas (temperatura_nominal_c, omega, raiz_omega, taxa m², conc_*). Os códigos
   saem do banco: não gere códigos no front.

3. LITERATURA › REATIVIDADE › "Conferência":
   - v_lit_conferencia: tabela por publicação (medidas, conferidas, pelo painel, a conferir, incompletas)
     com barra de progresso conferidas/medidas.
   - Ao abrir uma publicação: v_lit_pendencias dela (gravidade erro em vermelho, conferir em laranja,
     incompleto em cinza), agrupada por campo; cada medida tem "Editar" (abre o ponto no formulário) e
     checkbox "Conferido na fonte" -> update lit_dados_rda set conferido (o banco grava quem e quando).
   - Aba "Anotações": lit_qualidade (resolvido = false primeiro); "Nova anotação" (id_ensaio opcional,
     campo, valor registrado, valor calculado, observação; origem 'manual') e "Resolver" (resolvido = true
     + resolução em texto; resolvido_por/resolvido_em preenchidos pelo banco).
   - Aba "Sistemas repetidos": v_sistemas_duplicados (assinatura, ids, quantidade). Só mostrar; unificar é
     decisão da equipe (não implementar unificação automática agora).

4. CATÁLOGOS › "Listas da reatividade": CRUD de lit_listas (lista, valor, ordem, ativo). Desativar em vez de apagar.

5. AMOSTRA › ficha › RDA (ensaio do próprio laboratório): "Nova série RDA" com sistema (select), temperatura,
   pressão, disco (diâmetro/espessura), volume de ácido (mL), método e uma linha por disco/amostra com rotação
   e, ou a taxa digitada, ou a curva [Ca²⁺] (mg/L) × tempo (min) colada. Com curva: taxaPelaCurvaCalcio(curva,
   volume, diâmetro) mostra inclinação, R², área e taxa antes de gravar. Gravar com gravarSerieLaboratorio(
   supabase, { serie, id_sistema, condicao, pontos }). O código da série é texto livre sugerido como
   "<amostra>-S1". Mostre as séries existentes agrupadas por analise_rda.serie com o gráfico de Levich.

Verifique ao fim: npx tsc -b && npx oxlint src && npm run build; abra cada tela e confira o visual com as
capturas de referência.
```

## Prompt 1 para o Claude Code (dashboard)

```
A migração 020 mudou as views da reatividade. Ajuste o dashboard (só leitura):
1. v_rda_comparacao ganhou no fim: id_sistema, temperatura_c, tipo_variavel, shear_rate_s1, serie, conferido.
   Use serie para ligar os pontos de uma mesma série nos gráficos de Levich (uma linha por série) e
   tipo_variavel para não misturar rotação com cisalhamento no mesmo eixo (filtro "Variável").
2. v_lit_dados_rda ganhou origem_registro, fonte_local, observacao, conferido, conferido_em e n_a_conferir.
   Na tabela da literatura: selo "conferido" (verde discreto) e ícone de alerta laranja quando houver
   pendência (n_a_conferir > 0), com tooltip do motivo (v_lit_pendencias, gravidade erro/conferir).
   Filtro "Só conferidos". Mostre fonte_local ("Tabela 3") na linha expandida.
3. Temperatura nominal agora é 25 °C só para 18 ≤ T < 30 (30 °C fica 30): não recalcule no front, use a coluna.
Verifique: npx tsc -b && npm run build.
```

## Prompt 2 para o Claude Code (gerencial) — RDA ligado às amostras

```
Ligue os ensaios RDA aos discos do laboratório (migração 021 já rodada no Supabase).
Leia antes docs/referencia/reatividade/PROMPT.md (bloco "Versão 2").

0. Copie de docs/referencia/reatividade/importador/ para src/importador/: rdaDosDiscos.ts, rdaDosDiscos.test.ts,
   controle_rda_ficticio.xlsx, e substitua planilhaBdd.ts, planilhaBdd.test.ts, cadastroReatividade.test.ts e
   cadastroReatividade.banco.test.ts (os códigos da literatura agora são LIT-0001). Não reescreva a lógica. Rode:
   npx vitest run src/importador/rdaDosDiscos.test.ts src/importador/planilhaBdd.test.ts src/importador/cadastroReatividade.test.ts

1. IMPORTAR PLANILHA › "Controle de rochas": a prévia já mostra a.sugestoesRda. Troque essa parte por:
   const sistemas = (await supabase.from('sistemas_acidos').select('id_sistema, componente_1, valor_1, unidade_1, componente_2, valor_2, unidade_2, componente_3, valor_3, unidade_3, componente_4, valor_4, unidade_4')).data ?? []
   const plano = planejarRdaDosDiscos(a.sugestoesRda, sistemas, { porcentagem })
   - select "‘%’ na Utilização significa": wt% (padrão) | vol% | deixar % ; recalcule o plano ao trocar;
   - tabela "Ensaios RDA dos discos" (disco, texto da Utilização, sistema — código existente ou "novo: HCl 15 wt%",
     temperatura, rotação) + plano.problemas com o mesmo visual ERRO/AVISO/CORRIGIDO;
   - checkbox "Criar os ensaios RDA dos discos" (marcado).
   Ao gravar: depois de gravarAmostras(...), se marcado, const r = await gravarRdaDosDiscos(supabase, plano) e mostre
   "N ensaios RDA criados · N atualizados · N iguais · sistemas novos: SA… · discos não encontrados: …".
   Reimportar não duplica (um ensaio 'controle' por disco) e nunca mexe na taxa já lançada.

2. AMOSTRA › ficha › RDA:
   - liste v_analise_rda da amostra com o selo `situacao` ("aguardando resultado" em laranja #a85200,
     "com resultado" em azul) e a origem (controle / painel / equipamento). Em "aguardando resultado", botão
     "Lançar resultado": formulário com sistema, temperatura e rotação já preenchidos (só leitura), e pressão,
     dimensões, volume de ácido, série, data, método e OU a taxa digitada OU a curva [Ca²⁺] × tempo colada
     (prévia com taxaPelaCurvaCalcio). Grave com lancarResultadoRda(supabase, ensaio.id, {...}): ele ATUALIZA a
     mesma linha (não cria outra) e grava a curva;
   - cartão "Literatura comparável": supabase.rpc('rda_literatura_comparavel', { p_amostra: amostra.id }).
     Tabela (referência, ácido, temperatura nominal, rotação, taxa mol/m²·s, procedência, conferido) com os
     selos "mesmo ácido" e "mesma temperatura"; gráfico Recharts taxa × √ω com a literatura (#2a78d6) e os
     ensaios da amostra que têm taxa (#eb6834). Sem linhas: "Nenhuma medida da literatura com esta rocha".

3. LITERATURA › REATIVIDADE: onde aparece o código da medida, ele agora é LIT-0001 (o banco gera). Ajuste textos,
   placeholders e exemplos que diziam RDA-0001. RDA### continua sendo o código dos DISCOS (amostras).

Verifique: npx tsc -b && npx oxlint src && npm run build; abra o importador de controle e uma ficha de disco.
```

## Prompt 2 para o Claude Code (dashboard)

```
Migração 021: o banco de amostras passa a mostrar também a literatura (sem disco físico).
1. Página "Banco de amostras": leia de v_banco_amostras (em vez de v_amostras) para a LISTA. Filtro "Fonte":
   Laboratório | Literatura | Todas (padrão Todas). Linhas com fonte = 'literatura':
   - código = "RCH-03 · REF-R06", selo cinza "literatura — sem disco físico" no lugar do status, coluna
     "Referência" (referencia) e faixa de temperatura (temperatura_min_c–temperatura_max_c);
   - sem link para a ficha da amostra: o clique abre a Literatura › Reatividade filtrada por id_referencia e id_rocha.
   Nas linhas do laboratório, mostre "RDA: n_rda_com_resultado / n_rda" (ex.: "0/1 aguardando resultado").
   Os cartões de contagem (KPIs) e o inventário continuam lendo v_amostras: literatura não conta como amostra.
2. Ficha da amostra › RDA: v_analise_rda tem `situacao` e `origem_registro`; mostre "aguardando resultado" sem
   tentar plotar ensaios sem taxa. Acrescente o cartão "Literatura comparável" com
   supabase.rpc('rda_literatura_comparavel', { p_amostra }) (mesmas colunas e selos do gerencial).
3. Os códigos da literatura agora são LIT-0001: troque qualquer texto, filtro ou link que procurava "RDA-".
Verifique: npx tsc -b && npm run build.
```
