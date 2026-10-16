# Permeabilidade igual ao Origin do laboratório

## O que mudou e por quê
Na planilha do Origin do laboratório, o k final ("Permeability (mD)") usa a **inclinação da reta ΔP × Q
ajustada com intercepto livre** (`FitLinear`), e não a reta forçada a passar no zero. O nosso cálculo usava
a reta pela origem e dava um k diferente. Agora o padrão é igual ao do laboratório; a reta pela origem fica como opção.

Contas da planilha do Origin, que o nosso cálculo reproduz:

| Linha do Origin | Conta | Nosso campo |
|---|---|---|
| Pore Volume | π·D²·L/4·φ | calculado na view (não gravar) |
| Transversal Area | π·D²/4 | `area_cm2` |
| Interstitial Velocity | Q/(A·φ) — **está em cm/min**, apesar do rótulo dizer cm/s | calculado na view |
| Flow rate n (m/s) | Q·1,6667e-8 — **é m³/s**, apesar do rótulo dizer m/s | — |
| Permeability n (mD) | Q·μ·L/(A·ΔP) em SI ÷ 9,86923e-16 | `permeabilidade_etapas.k_md` (fórmula 244,93 é a mesma conta) |
| Permeability (mD) | μ·L/(inclinação·A) ÷ 9,86923e-16 | `analise_petrofisica.permeabilidade_liquido_md` |
| Dead Volume (ml) | dado de entrada | `analise_coreflooding.volume_morto_cm3` (novo) |

## Arquivos
- `banco/20261014000017_ajuste_darcy_origin.sql` — rodar no SQL Editor (colar o **conteúdo** do arquivo).
- `gerencial/tratamentoPermeabilidade.ts` e `permeabilidade.test.ts` — substituem os de `docs/referencia/importador/` e `src/importador/`.
- `servico-graficos/...` — substituem os arquivos do serviço de gráficos (Resumo e gráfico ΔP × Q com a reta nova).

## Prompt para o Claude Code (gerencial)

```
Atualize o tratamento de permeabilidade para calcular o k igual ao Origin do laboratório.

1. Copie docs/referencia/importador/tratamentoPermeabilidade.ts e permeabilidade.test.ts para src/importador/
   (substituindo). Não reescreva a lógica. Rode: npx vitest run src/importador/permeabilidade.test.ts
2. Novidades do módulo:
   - opção `ajuste: 'intercepto' | 'origem'` em tratarPermeabilidade (padrão 'intercepto');
   - resultado.ajuste agora traz: modo, inclinacao, intercepto, r2, k_md, k_md_pela_origem, k_md_com_intercepto;
   - função exportada ajusteDarcy(pts, {comprimento_cm, area_cm2, viscosidade_cp}, modo) — use-a para
     recalcular na tela quando a pessoa desmarcar uma etapa, em vez de fazer a conta à mão no componente;
   - gravarPermeabilidade grava ajuste_modo, ajuste_inclinacao, ajuste_intercepto_psi e ajuste_r2
     (precisa da migração 017 rodada; se a coluna não existir, mostre: "Rode a migração 017 no Supabase").
3. No cartão PermeabilidadeEtapas (src/components/analises/PermeabilidadeEtapas.tsx):
   - seletor "Reta ΔP × Q": "Com intercepto (como no Origin)" [padrão] | "Pela origem";
   - mostre a equação da reta (ΔP = a·Q ± b), o R², o k desta reta e, em cinza menor,
     "pela outra reta: X mD" para comparação;
   - em GraficoAjusteDpQ.tsx desenhe a reta com o intercepto (não mais saindo do zero quando o modo for intercepto);
   - envie `ajuste` também no pedido ao serviço de gráficos (config.ajuste no /permeabilidade/grafico e
     pedido.ajuste no /permeabilidade/planilha-etapas).
4. Na ficha de coreflooding, adicione o campo "Volume morto (cm³)" → analise_coreflooding.volume_morto_cm3.
5. Verifique: npx tsc -b && npx oxlint src && npm run build.
```

## Prompt para o Claude Code (dashboard)

```
Na petrofísica da amostra, quando ajuste_modo existir, mostre abaixo do k em fluxo:
"Reta ΔP × Q com intercepto (Origin) · R² 0,9998" (ou "pela origem"). Não mude mais nada.
Inclua ajuste_modo, ajuste_inclinacao, ajuste_intercepto_psi e ajuste_r2 no tipo da tabela em src/tipos/banco.ts.
```

## Pontos para confirmar com o professor
1. Na linha final do Origin a fórmula usa **B18** (viscosidade em **cP**), enquanto as linhas de cada vazão usam
   **B19** (Pa·s). Isso só dá o valor certo se a inclinação do FitLinear estiver numa unidade 1000× maior
   (ex.: ΔP em Pa contra Q em outra unidade). Vale abrir a aba FitLinear1 e conferir em que unidades está o ajuste.
2. Os rótulos "Interstitial Velocity (cm/s)" e "Flow rate (m/s)" estão com a unidade errada (são cm/min e m³/s);
   os valores estão certos. No sistema usamos as unidades corretas.
