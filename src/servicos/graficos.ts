// Cliente do serviço de gráficos padrão Origin (Python, VITE_URL_GRAFICOS), só para ver e baixar.
// Serviço em Dashboard-Back/servico-graficos. Mesmo contrato do gerencial (ABA GERENCIAL/src/servicos/graficos.ts): a configuração vem de
// analise_petrofisica.config_graficos e as leituras da curva ΔP × tempo gravada pelo tratamento.
import { supabase } from "../lib/supabase";
import type { PermeabilidadeEtapa, PontoCurva } from "../tipos/banco";

export const URL_GRAFICOS: string = String(import.meta.env.VITE_URL_GRAFICOS ?? "").replace(/\/+$/, "");

const CORES_ORIGIN = ["#000000", "#FF0000", "#0000FF", "#008000", "#FF00FF", "#808000", "#000080", "#800080", "#008080", "#800000"];

interface EtapaGrafico { cor: string; rotulo: string; marcador: string; visivel: boolean }
type Limite = [number | null, number | null];

/** o que o gerencial grava em config_graficos (versão 1) */
export interface ConfigGraficos {
  versao: 1;
  sobrepor: boolean;
  titulo: string;
  eixo_x: string;
  eixo_y: string;
  fonte: string;
  tamanho_fonte: number;
  largura_cm: number;
  altura_cm: number;
  espessura_linha: number;
  espessura_eixo: number;
  ticks_para_dentro: boolean;
  tempo_relativo: boolean;
  tempo_em_minutos: boolean;
  xlim: Limite;
  ylim: Limite;
  mostrar_janela: boolean;
  mostrar_media: boolean;
  mostrar_k: boolean;
  mostrar_legenda: boolean;
  cores: string[];
  etapas: Record<string, Partial<EtapaGrafico>>;
}

const CONFIG_PADRAO: ConfigGraficos = {
  versao: 1, sobrepor: false, titulo: "", eixo_x: "Tempo (s)", eixo_y: "ΔP (psi)",
  fonte: "Arial", tamanho_fonte: 12, largura_cm: 16, altura_cm: 11, espessura_linha: 1.5, espessura_eixo: 1.5,
  ticks_para_dentro: true, tempo_relativo: true, tempo_em_minutos: false, xlim: [null, null], ylim: [null, null],
  mostrar_janela: true, mostrar_media: true, mostrar_k: true, mostrar_legenda: true, cores: CORES_ORIGIN, etapas: {},
};

/** config_graficos do banco -> configuração completa; sem configuração gravada, o padrão do Origin */
export function configDoBanco(v: unknown): ConfigGraficos {
  if (!v || typeof v !== "object" || (v as { versao?: unknown }).versao !== 1) return CONFIG_PADRAO;
  const o = v as Partial<ConfigGraficos>;
  return { ...CONFIG_PADRAO, ...o, versao: 1, cores: Array.isArray(o.cores) ? o.cores : CORES_ORIGIN, etapas: o.etapas ?? {} };
}

function etapaGrafico(c: ConfigGraficos, ordem: number, i: number): EtapaGrafico {
  return { cor: c.cores[i] ?? CORES_ORIGIN[i % CORES_ORIGIN.length], rotulo: "", marcador: "", visivel: true, ...c.etapas[ordem] };
}

export const algumaVisivel = (c: ConfigGraficos, etapas: PermeabilidadeEtapa[]) =>
  etapas.some((e, i) => etapaGrafico(c, e.ordem, i).visivel);

export type Modo = "combinado" | "darcy";
export type Formato = "png" | "svg" | "pdf";

export interface DadosEnsaio {
  pontos: PontoCurva[];
  etapas: PermeabilidadeEtapa[];
  comprimento_cm: number | null;
  diametro_cm: number | null;
  viscosidade_cp: number | null;
}

const limite = (l: Limite) => (l[0] == null && l[1] == null ? null : l);

export function montarPedido(d: DadosEnsaio, c: ConfigGraficos, modo: Modo, formato: Formato, dpi: number) {
  const darcy = modo === "darcy";
  // o serviço precisa do intervalo de cada etapa; a curva gravada não tem Q, que sai da etapa do instante
  const etapas = d.etapas.filter((e) => e.t_inicio_s != null && e.t_fim_s != null);
  const vazao = (t: number) => Number(etapas.find((e) => t >= Number(e.t_inicio_s) && t <= Number(e.t_fim_s))?.vazao_ml_min ?? 0);
  return {
    leituras: d.pontos.map((p) => ({ t: Number(p.x), dp: Number(p.y), q: vazao(Number(p.x)) })),
    etapas: etapas.map((e, i) => {
      const g = etapaGrafico(c, e.ordem, i);
      return {
        ordem: e.ordem, q: Number(e.vazao_ml_min), t_inicio: Number(e.t_inicio_s), t_fim: Number(e.t_fim_s),
        j_inicio: e.janela_inicio_s, j_fim: e.janela_fim_s, dp_medio: e.dp_medio_psi, k_md: e.k_md, usada: e.usada,
        cor: g.cor, rotulo: g.rotulo.trim() || null, marcador: g.marcador || null, visivel: g.visivel,
      };
    }),
    config: {
      modo, formato, dpi, sobrepor: c.sobrepor, continuo: true,
      largura_cm: c.largura_cm, altura_cm: c.altura_cm, fonte: c.fonte, tamanho_fonte: c.tamanho_fonte,
      espessura_linha: c.espessura_linha, espessura_eixo: c.espessura_eixo, ticks_para_dentro: c.ticks_para_dentro,
      // o ΔP × Q tem eixo X próprio, sem título nem limites do gráfico de tempo (igual ao gerencial)
      titulo: darcy ? null : c.titulo.trim() || null,
      eixo_x: darcy ? CONFIG_PADRAO.eixo_x : c.eixo_x.trim() || CONFIG_PADRAO.eixo_x,
      eixo_y: c.eixo_y.trim() || CONFIG_PADRAO.eixo_y,
      tempo_relativo: c.tempo_relativo, tempo_em_minutos: c.tempo_em_minutos,
      xlim: darcy ? null : limite(c.xlim), ylim: darcy ? null : limite(c.ylim),
      mostrar_janela: c.mostrar_janela, mostrar_media: c.mostrar_media, mostrar_k: c.mostrar_k, mostrar_legenda: c.mostrar_legenda,
      comprimento_cm: d.comprimento_cm, diametro_cm: d.diametro_cm, viscosidade_cp: d.viscosidade_cp,
    },
  };
}

/** Plano grátis do Render: depois de ~15 min parado o serviço dorme e leva ~1 min para acordar; as chamadas feitas
 *  nesse intervalo falham no navegador. Chama /saude até responder (só fora do computador local) e lembra por 10 min. */
let acordadoAte = 0
async function acordarServico(url: string, sinal?: AbortSignal): Promise<void> {
  if (/\/\/(localhost|127\.0\.0\.1)/.test(url) || Date.now() < acordadoAte) return
  for (let i = 0; i < 12; i++) {
    try {
      const r = await fetch(`${url}/saude`, { signal: sinal })
      if (r.ok) { acordadoAte = Date.now() + 10 * 60_000; return }
    } catch (e) {
      if (sinal?.aborted) throw e
    }
    await new Promise((ok) => setTimeout(ok, 5000))
  }
}

/** POST /permeabilidade/grafico com o token da sessão; devolve a imagem ou lança o erro em português */
export async function pedirGrafico(corpo: string, sinal?: AbortSignal, rota = "permeabilidade/grafico"): Promise<Blob> {
  if (!URL_GRAFICOS) throw new Error("Falta o endereço do serviço de gráficos (VITE_URL_GRAFICOS).");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou: entre de novo para ver os gráficos.");
  await acordarServico(URL_GRAFICOS, sinal);
  let r: Response;
  try {
    r = await fetch(`${URL_GRAFICOS}/${rota}`, {
      method: "POST", signal: sinal, body: corpo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    if (sinal?.aborted) throw e;
    if (URL_GRAFICOS.includes('localhost')) {
      const fallbackUrl = URL_GRAFICOS.replace('localhost', '127.0.0.1');
      try {
        r = await fetch(`${fallbackUrl}/${rota}`, {
          method: "POST", signal: sinal, body: corpo,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
      } catch {
        throw new Error(`O serviço de gráficos não respondeu (${URL_GRAFICOS}).`);
      }
    } else {
      throw new Error(`O serviço de gráficos não respondeu (${URL_GRAFICOS}).`);
    }
  }
  if (r.ok) return r.blob();
  const detalhe = await r.json().then((j: { detail?: unknown }) => j.detail).catch(() => null);
  const texto = Array.isArray(detalhe)
    ? detalhe.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ")
    : detalhe ? String(detalhe) : r.statusText;
  if (r.status === 401) throw new Error(`O serviço de gráficos recusou o login (${texto}). Entre de novo.`);
  if (r.status === 422) throw new Error(`O serviço de gráficos não aceitou os dados: ${texto}.`);
  throw new Error(`Erro ${r.status} no serviço de gráficos: ${texto}.`);
}

export function baixarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- acidificação: os três gráficos do padrão Origin, montados pelo backend com o que foi GRAVADO ----
// (curva ΔP × tempo + fases do tratamento). O backend lê o banco com o login de quem pede: o RLS decide.
export type GraficoAcid = "geral" | "pv" | "apos";

export function pedirGraficoAcidificacao(analiseId: number, qual: GraficoAcid, formato: Formato, dpi: number, sinal?: AbortSignal): Promise<Blob> {
  return pedirGrafico(JSON.stringify({ analise_id: analiseId, qual, formato, dpi }), sinal, "acidificacao/grafico-salvo");
}
