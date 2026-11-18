# Reatividade (RDA): análise da planilha e do cadastro

Este documento cobre a planilha de reatividade rocha–ácido que o laboratório usa hoje. Ela tem as abas `ensaios`, `rochas`, `sistemas_acidos`, `fluidos_prop`, `referencias`, `qualidade`, `listas` e `dicionario`.

Ele descreve:

- como a planilha é preenchida;
- o que foi encontrado nela;
- o que o painel precisa ter para que o cadastro passe a ser feito por ele.

Todos os números abaixo foram conferidos com a planilha do laboratório. Os testes deste pacote usam só a planilha **fictícia** `BDD_ficticio_v2.xlsx`, que tem a mesma estrutura e valores inventados.

## 1. O que a planilha tem

| Aba | Linhas | Vai para |
|---|---|---|
| referencias | 10 | `publicacoes` (categoria geral, REF-Rnn) |
| fluidos_prop | 7 | `fluidos_prop` (massa molar, densidade, equivalentes) |
| litologias (lista) | 11 | `litologias` |
| rochas | 22 | `lit_rochas` (RCH-nn) |
| sistemas_acidos | 144 | `sistemas_acidos` (SAnn) |
| ensaios | 419 | `lit_dados_rda` (LIT-nnnn; na planilha RDA-nnnn) |
| listas (métodos) | 7 | `lit_listas` |
| qualidade | 8 | `lit_qualidade` |

Na aba `ensaios`, as **colunas verdes** são calculadas pela planilha:

- litologia, composição, ácido, concentração em wt% e em M;
- ω e √ω;
- temperatura nominal;
- taxa em m².

O banco calcula as mesmas contas sozinho e o importador ignora essas colunas. Ao reimportar a planilha inteira no banco de teste, as contas bateram em todas as medidas, com uma única exceção descrita na decisão 9.

## 2. Literatura × amostras do laboratório

As 419 medidas **não têm código de amostra** porque vêm de 10 artigos de outros grupos (o LEIA-ME da planilha diz
"compiladas de 10 referências"). As rochas desses artigos nunca estiveram no laboratório. Por isso elas ficam na
Literatura (`lit_dados_rda` + `lit_rochas`) e **não** são criadas em `amostras`. Lá ficam só os discos e plugs que existem,
e o inventário, o status e as contagens por projeto continuam corretos.

O que faltava era o lado do laboratório. Os discos do LC PETRO (RDA### da planilha de Controle de rochas) já entravam
em `amostras`, mas o ensaio escrito na coluna "Utilização" ("TR - HCl [15%] - Formação - 60 °C @500") ficava só no texto.
Com a migração 021:

| Antes | Agora |
|---|---|
| "Utilização" só nas observações; disco sem ensaio RDA | um ensaio RDA por disco (`origem_registro = 'controle'`), com sistema, temperatura e rotação; taxa "aguardando resultado" |
| literatura com código RDA-0001, parecido com o disco RDA### | literatura com LIT-0001 (mesmo número) |
| literatura fora do banco de amostras | `v_banco_amostras` mostra uma linha por rocha × artigo, marcada "sem disco físico" |
| ficha do disco sem comparação | `rda_literatura_comparavel`: medidas da mesma rocha, marcando mesmo ácido e mesma temperatura |

## 3. Como as pessoas cadastram hoje

1. **Uma publicação por vez.** A pessoa lê o artigo e cria a referência com autor e ano. Hoje algumas referências agrupam vários artigos de um mesmo grupo, com o ano em faixa ("2006–2014").
2. **Catálogos primeiro.**
   - A **rocha** é descrita como no artigo, por exemplo "[Calcita] > 99 %" ou "RM Ca/Mg = 1,1".
   - O **sistema ácido** é descrito como "[HCl] = 15 wt% [IC] = 0,5 vol%", com até 4 componentes.
   - Quando o sistema não existe, a pessoa cria um código novo. Por isso o mesmo sistema acabou cadastrado com códigos diferentes (18 grupos repetidos).
3. **Uma série por condição.**
   - A mesma combinação de rocha, sistema, temperatura, pressão e disco se repete em várias rotações, cada uma com a sua taxa de reação. As 419 medidas formam 221 séries.
   - A rotação é ω no regime de Levich. Algumas séries usam taxa de cisalhamento (16 medidas) e outras não informam a variável (127 medidas).
4. **De onde veio o número.** A procedência ficava marcada pela **cor da célula**. As opções são:
   - tabelado (249);
   - lido de gráfico (28);
   - medida na superfície (16);
   - não catalogado (126).

   No banco, a cor virou o campo `obtencao_dado`, e o campo `conferido` passa a dizer se alguém já conferiu a medida na fonte.
5. **Conferência na aba `qualidade`.** As anotações são escritas à mão ("valor registrado × calculado"). No banco elas viram a tabela `lit_qualidade`, que guarda quem resolveu e o que foi feito.

## 4. O que foi encontrado na planilha

| Tipo | Medidas | O que o sistema faz |
|---|---|---|
| Dimensão do disco preenchida "arrastando" no Excel (1, 2, 3, 4… em vez de repetir o valor) | 40 | AVISO no importador e pendência "conferir" |
| Temperatura de 250 °C, provavelmente em °F | 12 | AVISO e pendência "conferir" |
| Taxa com expoente impossível (abaixo de 1E-10) | 1 | pendência "erro" |
| Taxa bem acima do resto do banco (acima de 1E-4) | 1 | pendência "conferir" |
| Réplicas da mesma condição com taxas que diferem mais de 2× | 2 | pendência "conferir" |
| Rocha sem composição | 139 | pendência "incompleto" |
| Sem rotação nem cisalhamento | 127 | pendência "incompleto" |
| Procedência "não catalogado" | 126 | pendência "incompleto" |
| Sem pressão | 46 | pendência "incompleto" |
| Sem método de quantificação | 21 | pendência "incompleto" |
| Concentração sem conversão para M (quelante sem massa molar) | 28 | pendência "incompleto" |
| Mesmo sistema ácido com códigos diferentes | 18 grupos | AVISO e view `v_sistemas_duplicados` |
| Grafias do mesmo componente ou unidade que só diferem em acento ou maiúscula ("acido formico", "wt", "ml/l") | — | CORRIGIDO na importação |
| Nomes de aditivo muito parecidos (provável erro de digitação) | 2 pares | AVISO: o importador não troca sozinho, porque "metanol" e "etanol" também são parecidos |
| Unidade "%" sem dizer se é wt% ou vol% | — | AVISO |

Também foram corrigidas duas regras que estavam diferentes da planilha:

- **Temperatura nominal.** A planilha usa 18 ≤ T **<** 30 → 25 °C, enquanto o banco usava "entre 18 e 30". A diferença aparecia em 4 medidas a 30 °C. A migração 020 cria a função `temperatura_nominal()` e recalcula as colunas.
- **Assinatura do sistema ácido.** Agora a ordem dos componentes e as maiúsculas não contam: "HCl + IC" é o mesmo sistema que "IC + HCl".

## 5. O que o painel precisa ter para o cadastro

| Função | Onde está |
|---|---|
| Códigos automáticos (LIT-0420, SA145, RCH-23, REF-R11; própria LCP-0001), sem repetição mesmo com duas pessoas cadastrando ao mesmo tempo | banco: gatilhos e `app.proximo_codigo` |
| Cadastrar **uma série inteira** (publicação, rocha e sistema novos + N pontos) **tudo ou nada** | banco: `lit_cadastrar_serie(p)` · TS: `gravarSerieLiteratura` |
| Ler o texto colado da composição do sistema ("[HCl]=0,1 N [IC-A]=1wt%" ou "15 wt% HCl + 0,5 vol% IC") | `lerComposicaoSistema` |
| Ler a composição da rocha com qualificador (>, ≥, ≈) | `lerComposicaoRocha` |
| Avisar que o sistema já existe (mesma composição) e reaproveitá-lo | `acharSistemaIgual` · o banco também reaproveita |
| Digitar na unidade do artigo e converter (°F, K, bar, MPa, atm, cm, mm, mol/m²·s, por minuto…) e guardar a unidade original | `paraCelsius`, `paraPsi`, `paraPolegada`, `paraMolCm2s` · coluna `unidades_originais` |
| Mostrar as contas enquanto a pessoa digita (concentração em M e wt%, temperatura nominal, √ω) | `concMolar`, `concMassica`, `temperaturaNominal`, `raizOmega` |
| Validar antes de gravar: faixas, tipo da variável coerente, ordem das dimensões, lançamento repetido | `validarSerie` |
| Gráfico de Levich ao vivo (taxa × √ω), com R² e regime: transporte, misto ou reação de superfície | `ajusteLevich` |
| Procedência obrigatória e local na fonte ("Tabela 3", "Fig. 7b") | campos `obtencao_dado` e `fonte_local` |
| Fila de conferência por publicação e marcação "conferido" (registra quem e quando) | `v_lit_pendencias`, `v_lit_conferencia`, `conferido` |
| Anotações de qualidade com resolução | `lit_qualidade` |
| Listas de métodos editáveis sem mexer no código | `lit_listas` |
| Sistemas repetidos para unificar | `v_sistemas_duplicados` |
| **Ensaio do próprio laboratório**: série no disco do LC PETRO, taxa calculada pela curva [Ca²⁺] × tempo (inclinação × volume ÷ área) e curva gravada | `taxaPelaCurvaCalcio`, `gravarSerieLaboratorio` · `analise_rda.serie`, `taxa_calculada`, `curvas` |
| Ensaio RDA de cada disco do laboratório a partir da "Utilização" (um por disco, sem duplicar ao reimportar) | `planejarRdaDosDiscos`, `gravarRdaDosDiscos` |
| Importar a planilha inteira com prévia: o que é novo, o que mudou campo a campo e o que não muda | `analisarBdd` + `conferirBddNoBanco` + `gravarBdd` |

## 6. Decisões para o laboratório confirmar

1. **Ordem das dimensões do disco.** A 1ª dimensão costuma ser ≈ 1,5 in, então parece ser o **diâmetro**, e a 2ª a espessura. O formulário avisa quando a 2ª é maior que a 1ª. Confirmar.
2. **Dimensões arrastadas.** Qual é o valor certo nas 40 medidas? Provavelmente é o mesmo valor em toda a série.
3. **250 °C.** Os 12 casos estão em °F (121 °C) ou são realmente 250 °C?
4. **As duas taxas fora da faixa.** Uma tem expoente impossível e a outra está acima de 1E-4. É preciso conferir as duas no artigo.
5. **Grafias parecidas** de litologia e de aditivos: o importador mostra cada caso na prévia. Corrigir na planilha antes de importar?
6. **Sistemas repetidos** (18 grupos). Unificar num código só? A importação não apaga nada: a view lista os grupos e a decisão fica com a equipe.
7. **Referências agrupadas** (ano em faixa). Para o cadastro novo, o recomendado é **uma publicação = um artigo**, com DOI ou link.
8. **"Não catalogado"** (126 medidas). Vale reclassificar como tabelado ou lido de gráfico ao conferir?
9. **Conversão M → wt%.** O banco usa a conta exata. A planilha usa uma aproximação, e por isso a coluna verde difere 0,2–0,4 % em 16 medidas. Manter a conta exata?
10. **"%" na Utilização dos discos.** O padrão é tratar como wt% (HCl 15 % em acidificação é em massa). A tela deixa trocar para vol% ou manter "%".
