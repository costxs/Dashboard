// Cliente do serviço de gráficos padrão Origin (Python, VITE_URL_GRAFICOS).
// Contrato: Dashboard-Back/servico-graficos/graficos/permeabilidade.py e README.
// A tela guarda a configuração (ConfigGraficos) e aqui ela vira o corpo do pedido.
import type { Etapa, Leitura, ModoAjuste } from '../importador/tratamentoPermeabilidade'
import { supabase } from '../lib/supabase'

export const URL_GRAFICOS: string = String(import.meta.env.VITE_URL_GRAFICOS ?? '').replace(/\/+$/, '')

/** sequência de cores do Origin (a mesma de graficos/estilo.py) */
export const CORES_ORIGIN = ['#000000', '#FF0000', '#0000FF', '#008000', '#FF00FF', '#808000', '#000080', '#800080', '#008080', '#800000']
export const MARCADORES = [
  { valor: '', rotulo: 'nenhum' }, { valor: 'o', rotulo: '●' }, { valor: 's', rotulo: '■' },
  { valor: '^', rotulo: '▲' }, { valor: 'D', rotulo: '◆' }, { valor: 'v', rotulo: '▼' },
]
export const FONTES = ['Arial', 'Times New Roman', 'Calibri']

export interface EtapaGrafico { cor: string; rotulo: string; marcador: string; visivel: boolean }
type Limite = [number | null, number | null]

/** O que a pessoa escolhe no painel; vai inteiro para analise_petrofisica.config_graficos. */
export interface ConfigGraficos {
  versao: 1
  sobrepor: boolean
  titulo: string
  eixo_x: string
  eixo_y: string
  fonte: string
  tamanho_fonte: number
  largura_cm: number
  altura_cm: number
  espessura_linha: number
  espessura_eixo: number
  ticks_para_dentro: boolean
  tempo_relativo: boolean
  tempo_em_minutos: boolean
  xlim: Limite
  ylim: Limite
  mostrar_janela: boolean
  mostrar_media: boolean
  mostrar_k: boolean
  mostrar_legenda: boolean
  /** cor de cada posição de vazão (1ª, 2ª...) usada quando a etapa não tem cor própria */
  cores: string[]
  /** escolhas por etapa, pela ordem da etapa */
  etapas: Record<string, Partial<EtapaGrafico>>
}

export const CONFIG_PADRAO: ConfigGraficos = {
  versao: 1, sobrepor: false, titulo: '', eixo_x: 'Tempo (s)', eixo_y: 'ΔP (psi)',
  fonte: 'Arial', tamanho_fonte: 12, largura_cm: 16, altura_cm: 11, espessura_linha: 1.5, espessura_eixo: 1.5,
  ticks_para_dentro: true, tempo_relativo: true, tempo_em_minutos: false, xlim: [null, null], ylim: [null, null],
  mostrar_janela: true, mostrar_media: true, mostrar_k: true, mostrar_legenda: true, cores: CORES_ORIGIN, etapas: {},
}

// ---- configuração: localStorage (preferências da pessoa) e banco ----
const CHAVE_PREFERENCIAS = 'lcpetro.graficos.preferencias'
/** o que é do ensaio e não vira preferência para o próximo */
const SO_DO_ENSAIO = ['titulo', 'xlim', 'ylim', 'etapas'] as const

function mesclar(v: unknown): ConfigGraficos {
  const o = v && typeof v === 'object' ? (v as Partial<ConfigGraficos>) : {}
  return { ...CONFIG_PADRAO, ...o, versao: 1, cores: Array.isArray(o.cores) ? o.cores : CORES_ORIGIN, etapas: o.etapas ?? {} }
}

/** padrão do próximo ensaio: as últimas escolhas da pessoa (fonte, tamanho, cores...) */
export function configInicial(): ConfigGraficos {
  try {
    const salvo = localStorage.getItem(CHAVE_PREFERENCIAS)
    return salvo ? { ...mesclar(JSON.parse(salvo)), titulo: '', xlim: [null, null], ylim: [null, null], etapas: {} } : CONFIG_PADRAO
  } catch {
    return CONFIG_PADRAO
  }
}

export function guardarPreferencias(c: ConfigGraficos) {
  const p: Partial<ConfigGraficos> = { ...c }
  for (const k of SO_DO_ENSAIO) delete p[k]
  try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p)) } catch { /* navegador sem localStorage: fica só nesta tela */ }
}

/** config_graficos lida do banco -> configuração da tela (null se não houver) */
export function configDoBanco(v: unknown): ConfigGraficos | null {
  return v && typeof v === 'object' && (v as { versao?: unknown }).versao === 1 ? mesclar(v) : null
}

/** escolhas da etapa (a i-ésima vazão), com o padrão onde a pessoa não mexeu */
export function etapaGrafico(c: ConfigGraficos, ordem: number, i: number): EtapaGrafico {
  return { cor: c.cores[i] ?? CORES_ORIGIN[i % CORES_ORIGIN.length], rotulo: '', marcador: '', visivel: true, ...c.etapas[ordem] }
}

/** para gravar: a configuração com as escolhas de TODAS as etapas escritas (o dashboard lê direto) */
export function configParaGravar(c: ConfigGraficos, etapas: Etapa[]): ConfigGraficos {
  return { ...c, etapas: Object.fromEntries(etapas.map((e, i) => [String(e.ordem), etapaGrafico(c, e.ordem, i)])) }
}

// ---- pedido ----
export type Modo = 'combinado' | 'darcy'
export type Formato = 'png' | 'svg' | 'pdf'

export interface DadosEnsaio {
  leituras: Leitura[]
  etapas: Etapa[]
  usadas: Set<number>
  comprimento_cm: number | null
  diametro_cm: number | null
  viscosidade_cp: number | null
  /** reta ΔP × Q: com intercepto (padrão, como no Origin) ou pela origem */
  ajuste?: ModoAjuste
}

const limite = (l: Limite) => (l[0] == null && l[1] == null ? null : l)

export function montarPedido(d: DadosEnsaio, c: ConfigGraficos, modo: Modo, formato: Formato, dpi: number) {
  const darcy = modo === 'darcy'
  return {
    leituras: d.leituras.filter((l) => l.dp != null).map((l) => ({ t: l.tempo_s, dp: l.dp as number, q: l.q })),
    etapas: d.etapas.map((e, i) => {
      const g = etapaGrafico(c, e.ordem, i)
      return {
        ordem: e.ordem, q: e.q, t_inicio: e.t_inicio_s, t_fim: e.t_fim_s, j_inicio: e.j_inicio_s, j_fim: e.j_fim_s,
        dp_medio: e.dp_medio, k_md: e.k_md, usada: d.usadas.has(e.ordem),
        cor: g.cor, rotulo: g.rotulo.trim() || null, marcador: g.marcador || null, visivel: g.visivel,
      }
    }),
    config: {
      modo, formato, dpi, sobrepor: c.sobrepor, continuo: true,
      largura_cm: c.largura_cm, altura_cm: c.altura_cm, fonte: c.fonte, tamanho_fonte: c.tamanho_fonte,
      espessura_linha: c.espessura_linha, espessura_eixo: c.espessura_eixo, ticks_para_dentro: c.ticks_para_dentro,
      // o ΔP × Q tem eixo X próprio ("Q (cm³/min)" quando eixo_x é o padrão), sem título nem limites do gráfico de tempo
      titulo: darcy ? null : c.titulo.trim() || null,
      eixo_x: darcy ? CONFIG_PADRAO.eixo_x : c.eixo_x.trim() || CONFIG_PADRAO.eixo_x,
      eixo_y: c.eixo_y.trim() || CONFIG_PADRAO.eixo_y,
      tempo_relativo: c.tempo_relativo, tempo_em_minutos: c.tempo_em_minutos,
      xlim: darcy ? null : limite(c.xlim), ylim: darcy ? null : limite(c.ylim),
      mostrar_janela: c.mostrar_janela, mostrar_media: c.mostrar_media, mostrar_k: c.mostrar_k, mostrar_legenda: c.mostrar_legenda,
      comprimento_cm: d.comprimento_cm, diametro_cm: d.diametro_cm, viscosidade_cp: d.viscosidade_cp,
      ajuste: d.ajuste ?? 'intercepto',
    },
  }
}

/** POST de JSON no serviço (gráfico ou planilha para o Origin) */
export function pedirAoServico(rota: 'grafico' | 'origin', corpo: string, sinal?: AbortSignal): Promise<Blob> {
  return postar(rota, corpo, { 'Content-Type': 'application/json' }, sinal)
}

/** Etapa como vai para /permeabilidade/planilha-etapas (o trecho estável de cada vazão) */
export interface EtapaPlanilha {
  ordem: number; q: number; j_inicio: number; j_fim: number
  dp_medio: number | null; dp_desvio: number | null; n_pontos: number
  volume_injetado_cm3: number | null; volume_bombeado_cm3: number | null; k_md: number | null; usada: boolean
}

/**
 * Planilha separada por etapa no formato do pesquisador (Planilha1 com a Tabela2 em B2 + aba Resumo).
 * O serviço lê o próprio arquivo do equipamento, para não perder coluna nem casa decimal.
 */
export function pedirPlanilhaEtapas(arquivo: File, pedido: {
  etapas: EtapaPlanilha[]; metodo_k: string
  comprimento_cm: number | null; diametro_cm: number | null; viscosidade_cp: number | null
  /** reta ΔP × Q do Resumo: 'intercepto' (como no Origin) ou 'origem' */
  ajuste?: ModoAjuste
  /** mesmo corpo do /grafico (montarPedido): a planilha ganha a aba "Gráficos" com o gráfico único e o ΔP × Q */
  grafico?: ReturnType<typeof montarPedido>
}): Promise<Blob> {
  const form = new FormData()
  form.append('arquivo', arquivo, arquivo.name)
  form.append('pedido', JSON.stringify(pedido))
  return postar('planilha-etapas', form, {})  // o navegador põe o Content-Type multipart com o boundary
}

/** POST no serviço com o token da sessão; devolve o arquivo ou lança o erro já em português */
async function postar(rota: string, corpo: BodyInit, cabecalhos: Record<string, string>, sinal?: AbortSignal): Promise<Blob> {
  if (!URL_GRAFICOS) throw new Error('Falta o endereço do serviço de gráficos: coloque VITE_URL_GRAFICOS no .env.local e reinicie o npm run dev.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sua sessão expirou: entre de novo no gerencial para usar o serviço de gráficos.')
  let r: Response
  try {
    r = await fetch(`${URL_GRAFICOS}/permeabilidade/${rota}`, {
      method: 'POST', signal: sinal, body: corpo, headers: { ...cabecalhos, Authorization: `Bearer ${token}` },
    })
  } catch (e) {
    if (sinal?.aborted) throw e
    throw new Error(`O serviço de gráficos não respondeu (${URL_GRAFICOS}). Confira se ele está rodando: `
      + 'na pasta Dashboard-Back/servico-graficos, "uvicorn app:app --port 8010 --reload".')
  }
  if (r.ok) return r.blob()
  const detalhe = await r.json().then((j: { detail?: unknown }) => j.detail).catch(() => null)
  const texto = Array.isArray(detalhe)
    ? detalhe.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join('; ')
    : detalhe ? String(detalhe) : r.statusText
  if (r.status === 401) throw new Error(`O serviço de gráficos recusou o login (${texto}). Entre de novo no gerencial.`)
  if (r.status === 422) throw new Error(`O serviço de gráficos não aceitou os dados: ${texto}.`)
  throw new Error(`Erro ${r.status} no serviço de gráficos: ${texto}.`)
}

export function baixarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
