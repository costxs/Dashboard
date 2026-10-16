// Apoio da tela "Tratamento de dados de coreflood › Permeabilidade".
// A lógica do tratamento está em tratamentoPermeabilidade.ts (cópia de docs/referencia/importador) e
// NÃO é repetida aqui. Este arquivo só cobre o que a tela precisa a mais:
//   * a caixa "usar" da tabela de etapas, quando a pessoa foge do padrão (padrão = as estáveis).
// A planilha separada por etapa agora é gerada pelo serviço Python (src/servicos/graficos.ts).
import { ajusteDarcy, type ModoAjuste, type Resultado } from "./tratamentoPermeabilidade";

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const AVISO_ORIGEM = "a reta ΔP × Q não passa perto da origem";

/** Etapas que entram no k final quando ninguém mexe na caixa "usar": as estáveis. */
export function etapasPadrao(r: Resultado): number[] {
  return r.etapas.filter((e) => e.estavel).map((e) => e.ordem);
}

/**
 * Resultado com o ajuste ΔP × Q e o k médio refeitos só com as etapas marcadas em "usar".
 * Com a seleção padrão (as estáveis) devolve o próprio resultado de tratarPermeabilidade, sem recalcular.
 * A reta é a mesma de tratarPermeabilidade (ajusteDarcy): com intercepto, como no Origin, ou pela origem.
 */
export function resultadoComEtapas(
  r: Resultado, usadas: ReadonlySet<number>, comprimento_cm: number | null, viscosidade_cp: number | null,
  modo: ModoAjuste = "intercepto",
): Resultado {
  const padrao = etapasPadrao(r);
  if (padrao.length === usadas.size && padrao.every((o) => usadas.has(o))) return r;

  const L = comprimento_cm, mu = viscosidade_cp, A = r.area_cm2;
  const etapas = r.etapas.filter((e) => usadas.has(e.ordem));
  const pts = etapas.filter((e) => e.dp_medio != null && e.dp_medio > 0).map((e) => ({ q: e.q, dp: e.dp_medio as number }));
  const avisos = r.avisos.filter((a) => !a.startsWith(AVISO_ORIGEM));
  let ajuste: Resultado["ajuste"] = null;
  // todas as etapas usadas na mesma vazão: não há reta com intercepto
  const vazoes = new Set(pts.map((p) => p.q)).size;
  if (pts.length >= 2 && L && A && mu && (modo === "origem" || vazoes >= 2)) {
    ajuste = ajusteDarcy(pts, { comprimento_cm: L, area_cm2: A, viscosidade_cp: mu }, modo);
    if (vazoes >= 2 && Math.abs(ajuste.intercepto_livre) > 0.1 * media(pts.map((p) => p.dp)))
      avisos.push(`${AVISO_ORIGEM} (intercepto ${ajuste.intercepto_livre.toFixed(2)} psi): pode haver efeito inercial ou erro de zero do transdutor`);
  }
  const ks = etapas.filter((e) => e.k_md != null).map((e) => e.k_md as number);
  return { ...r, ajuste, k_medio_md: ks.length ? media(ks) : null, avisos };
}
