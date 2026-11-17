// LITERATURA › REATIVIDADE › Nova série: o cadastro que substitui o preenchimento da planilha.
// Uma série = uma condição (publicação, rocha, sistema ácido, temperatura, pressão, disco) em várias rotações.
// A lógica (leitura dos textos, conversões, validação, Levich, gravação) está em src/importador/cadastroReatividade.ts.
import { useEffect, useMemo, useState, type ClipboardEvent } from 'react'
import { BookOpen, CheckCircle2, FlaskConical, Layers, ListOrdered, Loader2, Plus, Thermometer, Trash2 } from 'lucide-react'
import { Alert, Card, Input, Select } from '../../components/UI'
import { URL_DASHBOARD } from '../../config/urls'
import { useConsulta } from '../../hooks/useConsulta'
import {
  acharSistemaIgual, ajusteLevich, concMassica, concMolar, gravarSerieLiteratura, lerComposicaoRocha, lerComposicaoSistema,
  paraCelsius, paraMolCm2s, paraPolegada, paraPsi, raizOmega, sistemaDosComponentes, temperaturaNominal, validarSerie,
  type Condicao, type Existente, type NovaSerieLiteratura, type Ponto, type Problema,
  type UnComprimento, type UnPressao, type UnTaxa, type UnTemperatura,
} from '../../importador/cadastroReatividade'
import { dobra, normalizaComponente, numero } from '../../importador/planilhaBdd'
import { supabase } from '../../lib/supabase'
import { listarLitologias } from '../../servicos/api'
import { fmt } from '../../utils/formatacao'
import { listarPublicacoes, listarRochasLiteratura } from '../servico'
import { Escolher, GraficoLevich, ListaProblemas, Modo } from './pecas'
import { explicarErro020, listarFluidos, listarListas, listarSistemasBanco, medidasDaRochaSistema, type SistemaBanco } from './servico'

const UN_COMPONENTE = ['wt%', 'vol%', 'N', 'M', 'mM', 'gpt', 'ppm', 'mg/L', 'g/L', 'mL/L']
const QUALIFICADORES: [string, string][] = [['=', '='], ['>', '>'], ['>=', '≥'], ['<', '<'], ['<=', '≤'], ['~', '≈']]
const UN_TEMPERATURA: UnTemperatura[] = ['°C', '°F', 'K']
const UN_PRESSAO: UnPressao[] = ['psi', 'bar', 'MPa', 'kPa', 'atm']
const UN_COMPRIMENTO: UnComprimento[] = ['in', 'cm', 'mm']
const UN_TAXA: UnTaxa[] = ['mol/(cm²·s)', 'mol/(m²·s)', 'mol/(cm²·min)', 'mmol/(cm²·s)', 'mol/(cm²·h)']
const TIPOS = ['rotação (RDA)', 'taxa de cisalhamento', 'não informada'] as const
const OBTENCAO = ['tabelado', 'lido de gráfico', 'medida na superfície', 'não catalogado'] as const
const NOVA_LITOLOGIA = '__nova__'

interface CompForm { componente: string; valor: string; unidade: string }
interface LinhaPonto { v: string; taxa: string; coef: string; obs: string }
const COLUNAS_PONTO = ['v', 'taxa', 'coef', 'obs'] as const

const compVazio = (): CompForm => ({ componente: '', valor: '', unidade: '' })
const pontoVazio = (): LinhaPonto => ({ v: '', taxa: '', coef: '', obs: '' })
const pontosIniciais = () => Array.from({ length: 6 }, pontoVazio)
const pubInicial = () => ({ nova: false, id: '', autor: '', ano: '', titulo: '', periodico: '', doi: '', link: '' })
const rochaInicial = () => ({
  nova: false, id: '', litologia: '', novaLitologia: '', texto: '',
  calcita_pct: '', calcita_qualificador: '=', dolomita_pct: '', dolomita_qualificador: '=', razao_ca_mg: '',
})
const sistemaInicial = () => ({ novo: false, id: '', texto: '', nome: '', comps: [compVazio(), compVazio(), compVazio(), compVazio()] })
const condInicial = () => ({
  temperatura: '', uT: '°C' as UnTemperatura, pressao: '', uP: 'psi' as UnPressao, d1: '', d2: '', uL: 'in' as UnComprimento,
  tipo: 'rotação (RDA)' as (typeof TIPOS)[number], metQ: '', metD: '', obtencao: '' as '' | (typeof OBTENCAO)[number],
  fonte_local: '', ano: '', observacao: '',
})

const txt = (s: string) => s.trim() || null
const arred = (v: number, casas: number) => Number(v.toFixed(casas))
const paraTexto = (v: unknown) => (v == null ? '' : String(v).replace('.', ','))
/** texto -> número; devolve [valor ou null, inválido?] */
function ler(s: string): [number | null, boolean] {
  const n = numero(s)
  return n == null ? [null, false] : Number.isNaN(n) ? [null, true] : [n, false]
}

function composicaoDoSistema(s: Record<string, unknown>): string {
  return [1, 2, 3, 4].filter((k) => s[`componente_${k}`])
    .map((k) => [s[`componente_${k}`], s[`valor_${k}`] != null ? paraTexto(s[`valor_${k}`]) : null, s[`unidade_${k}`]].filter(Boolean).join(' ')).join(' + ')
}

export function NovaSerie({ aoGravar }: { aoGravar?: () => void }) {
  const pubs = useConsulta(() => listarPublicacoes({ categoria: 'geral' }), [])
  const rochas = useConsulta(listarRochasLiteratura, [])
  const litologias = useConsulta(listarLitologias, [])
  const sistemas = useConsulta(listarSistemasBanco, [])
  const fluidos = useConsulta(listarFluidos, [])
  const listas = useConsulta(() => listarListas(true), [])

  const [pub, setPub] = useState(pubInicial)
  const [rocha, setRocha] = useState(rochaInicial)
  const [sistema, setSistema] = useState(sistemaInicial)
  const [probSistema, setProbSistema] = useState<Problema[]>([])
  const [cond, setCond] = useState(condInicial)
  const [uTaxa, setUTaxa] = useState<UnTaxa>('mol/(cm²·s)')
  const [linhas, setLinhas] = useState<LinhaPonto[]>(pontosIniciais)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [gravada, setGravada] = useState<{ id_referencia: string; id_rocha: string; id_sistema: string; ids: string[] } | null>(null)

  // ---- b) rocha: o texto do artigo preenche os campos
  function mudarTextoRocha(texto: string) {
    const r = lerComposicaoRocha(texto)
    setRocha((a) => ({
      ...a, texto,
      calcita_pct: r.calcita_pct != null ? paraTexto(r.calcita_pct) : a.calcita_pct,
      calcita_qualificador: (r.calcita_qualificador as string | null) ?? a.calcita_qualificador,
      dolomita_pct: r.dolomita_pct != null ? paraTexto(r.dolomita_pct) : a.dolomita_pct,
      dolomita_qualificador: (r.dolomita_qualificador as string | null) ?? a.dolomita_qualificador,
      razao_ca_mg: r.razao_ca_mg != null ? paraTexto(r.razao_ca_mg) : a.razao_ca_mg,
    }))
  }

  // ---- c) sistema: o texto colado vira a tabela de componentes
  function mudarTextoSistema(texto: string) {
    if (!texto.trim()) { setSistema((s) => ({ ...s, texto })); setProbSistema([]); return }
    const r = lerComposicaoSistema(texto)
    const comps = r.componentes.slice(0, 4).map((c) => ({ componente: c.componente ?? '', valor: paraTexto(c.valor), unidade: c.unidade ?? '' }))
    while (comps.length < 4) comps.push(compVazio())
    setSistema((s) => ({ ...s, texto, comps }))
    setProbSistema(r.problemas)
  }
  function mudarComp(i: number, campo: keyof CompForm, valor: string) {
    setSistema((s) => ({ ...s, comps: s.comps.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)) }))
  }

  const compsPreenchidos = useMemo(() => sistema.comps.filter((c) => c.componente.trim()).map((c) => ({
    componente: normalizaComponente(c.componente)!, valor: ler(c.valor)[0], unidade: c.unidade || null,
  })), [sistema.comps])
  const sistemaNovo = useMemo(
    () => sistemaDosComponentes(compsPreenchidos, txt(sistema.nome) ?? undefined, txt(sistema.texto) ?? undefined),
    [compsPreenchidos, sistema.nome, sistema.texto])
  const sistemaIgual = useMemo(
    () => (sistema.novo && compsPreenchidos.length ? acharSistemaIgual(sistemas.dados ?? [], sistemaNovo) : null),
    [sistema.novo, compsPreenchidos, sistemas.dados, sistemaNovo])
  const primeiro = compsPreenchidos[0]
  const fluido = primeiro ? (fluidos.dados ?? []).find((f) => dobra(f.componente) === dobra(primeiro.componente)) : undefined
  const concM = primeiro?.valor != null && primeiro.unidade ? concMolar(primeiro.valor, primeiro.unidade, fluido) : null
  const concPct = primeiro?.valor != null && primeiro.unidade ? concMassica(primeiro.valor, primeiro.unidade, fluido) : null

  // ---- d) condição, já nas unidades do banco (°C, psi, in)
  const { condicao, errosNumero } = useMemo(() => {
    const errosNumero: Problema[] = []
    const num = (s: string, campo: string, rotulo: string) => {
      const [v, invalido] = ler(s)
      if (invalido) errosNumero.push({ severidade: 'ERRO', campo, mensagem: `${rotulo}: "${s}" não é um número` })
      return v
    }
    const t = num(cond.temperatura, 'temperatura_c', 'temperatura')
    const p = num(cond.pressao, 'pressao_psi', 'pressão')
    const d1 = num(cond.d1, 'dim_h_in', 'diâmetro')
    const d2 = num(cond.d2, 'dim_d_in', 'espessura')
    const ano = num(cond.ano, 'ano', 'ano')
    const condicao: Condicao = {
      ano: ano != null ? Math.round(ano) : null,
      temperatura_c: t != null ? arred(paraCelsius(t, cond.uT), 3) : null,
      pressao_psi: p != null ? arred(paraPsi(p, cond.uP), 3) : null,
      dim_h_in: d1 != null ? arred(paraPolegada(d1, cond.uL), 4) : null,
      dim_d_in: d2 != null ? arred(paraPolegada(d2, cond.uL), 4) : null,
      tipo_variavel: cond.tipo,
      metodo_quantificacao: txt(cond.metQ), metodo_coef_difusao: txt(cond.metD),
      obtencao_dado: cond.obtencao || undefined,
      fonte_local: txt(cond.fonte_local), observacao: txt(cond.observacao),
      unidades_originais: { temperatura: cond.uT, pressao: cond.uP, dimensao: cond.uL, taxa: uTaxa },
    }
    return { condicao, errosNumero }
  }, [cond, uTaxa])

  // ---- e) pontos
  const { pontos, errosPonto } = useMemo(() => {
    const errosPonto: Problema[] = []
    const pontos: Ponto[] = []
    for (const l of linhas) {
      if (!l.v.trim() && !l.taxa.trim() && !l.coef.trim() && !l.obs.trim()) continue
      const n = pontos.length + 1
      const num = (s: string, campo: string, rotulo: string) => {
        const [v, invalido] = ler(s)
        if (invalido) errosPonto.push({ severidade: 'ERRO', campo, ponto: n, mensagem: `${rotulo}: "${s}" não é um número` })
        return v
      }
      const v = cond.tipo === 'não informada' ? null : num(l.v, 'rotacao_rpm', cond.tipo === 'rotação (RDA)' ? 'rotação' : 'cisalhamento')
      const taxa = num(l.taxa, 'taxa_reacao_mol_cm2_s', 'taxa')
      pontos.push({
        rotacao_rpm: cond.tipo === 'rotação (RDA)' ? v : null,
        shear_rate_s1: cond.tipo === 'taxa de cisalhamento' ? v : null,
        taxa_reacao_mol_cm2_s: taxa != null ? paraMolCm2s(taxa, uTaxa) : null,
        coef_difusao_cm2_s: num(l.coef, 'coef_difusao_cm2_s', 'coef. de difusão'),
        observacao: txt(l.obs),
      })
    }
    return { pontos, errosPonto }
  }, [linhas, cond.tipo, uTaxa])

  // ---- f) medidas já cadastradas com a mesma rocha e sistema (lançamento repetido + comparação no gráfico)
  const idRef = pub.nova ? null : pub.id || null
  const idRocha = rocha.nova ? null : rocha.id || null
  const idSistema = sistema.novo ? null : sistema.id || null
  const idSistemaConsulta = idSistema ?? sistemaIgual
  const [existentes, setExistentes] = useState<Existente[]>([])
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    let vivo = true
    if (!idRocha || !idSistemaConsulta) { setExistentes([]); return }
    medidasDaRochaSistema(idRocha, idSistemaConsulta).then((m) => { if (vivo) setExistentes(m) }).catch(() => { if (vivo) setExistentes([]) })
    return () => { vivo = false }
  }, [idRocha, idSistemaConsulta, versao])

  const problemas = useMemo(() => {
    const pr: Problema[] = []
    const erroDe = (campo: string, mensagem: string) => pr.push({ severidade: 'ERRO', campo, mensagem })
    if (pub.nova ? !pub.autor.trim() : !pub.id) erroDe('publicacao', pub.nova ? 'publicação: informe o autor' : 'escolha a publicação (ou cadastre uma nova)')
    if (pub.nova && !pub.doi.trim() && !pub.link.trim()) pr.push({ severidade: 'AVISO', campo: 'publicacao', mensagem: 'publicação sem DOI nem link: anote onde achar o artigo' })
    if (rocha.nova) {
      if (!(rocha.litologia === NOVA_LITOLOGIA ? rocha.novaLitologia.trim() : rocha.litologia)) erroDe('rocha', 'rocha: escolha a litologia')
      for (const [s, rotulo] of [[rocha.calcita_pct, 'calcita %'], [rocha.dolomita_pct, 'dolomita %'], [rocha.razao_ca_mg, 'razão Ca/Mg']] as const) {
        const [v, invalido] = ler(s)
        if (invalido) erroDe('rocha', `rocha: ${rotulo} "${s}" não é um número`)
        else if (v != null && rotulo !== 'razão Ca/Mg' && (v < 0 || v > 100)) erroDe('rocha', `rocha: ${rotulo} deve ficar entre 0 e 100`)
        else if (v != null && rotulo === 'razão Ca/Mg' && v <= 0) erroDe('rocha', 'rocha: razão Ca/Mg deve ser maior que zero')
      }
    } else if (!rocha.id) erroDe('rocha', 'escolha a rocha (ou cadastre uma nova)')
    if (sistema.novo) {
      if (!compsPreenchidos.length) erroDe('sistema', 'sistema ácido: informe pelo menos o ácido principal')
      sistema.comps.forEach((c, i) => {
        if (c.componente.trim() && ler(c.valor)[1]) erroDe('sistema', `sistema ácido: valor do componente ${i + 1} "${c.valor}" não é um número`)
        if (!c.componente.trim() && (c.valor.trim() || c.unidade)) erroDe('sistema', `sistema ácido: o componente ${i + 1} tem valor ou unidade, mas está sem nome`)
        if (c.componente.trim() && c.unidade === '%') pr.push({ severidade: 'AVISO', campo: 'sistema', mensagem: `"${c.componente}": '%' não diz se é wt% ou vol% — escolha` })
      })
      pr.push(...probSistema.filter((x) => x.severidade === 'ERRO' && x.campo === 'composicao' && /mais de 4/.test(x.mensagem)))
    } else if (!sistema.id) erroDe('sistema', 'escolha o sistema ácido (ou cole a composição de um novo)')
    if (!cond.obtencao) erroDe('obtencao_dado', 'procedência do valor é obrigatória (tabelado, lido de gráfico…)')
    pr.push(...errosNumero, ...errosPonto)
    pr.push(...validarSerie({ id_referencia: idRef, id_rocha: idRocha, id_sistema: idSistemaConsulta }, condicao, pontos, existentes))
    return pr
  }, [pub, rocha, sistema, compsPreenchidos, probSistema, cond.obtencao, errosNumero, errosPonto, idRef, idRocha, idSistemaConsulta, condicao, pontos, existentes])
  const nErros = problemas.filter((p) => p.severidade === 'ERRO').length

  // ---- gráfico
  const levich = useMemo(() => ajusteLevich(pontos), [pontos])
  const xyNovos = useMemo(() => pontos.filter((p) => p.rotacao_rpm != null && p.rotacao_rpm > 0 && p.taxa_reacao_mol_cm2_s != null && p.taxa_reacao_mol_cm2_s > 0)
    .map((p) => ({ x: raizOmega(p.rotacao_rpm!), y: p.taxa_reacao_mol_cm2_s!, rotulo: `${fmt(p.rotacao_rpm, 0)} rpm` })), [pontos])
  const idsGravados = useMemo(() => new Set(gravada?.ids ?? []), [gravada])
  const xyBanco = useMemo(() => existentes.filter((e) => !idsGravados.has(e.id_ensaio) && e.rotacao_rpm != null && e.rotacao_rpm > 0 && e.taxa_reacao_mol_cm2_s != null && e.taxa_reacao_mol_cm2_s > 0)
    .map((e) => ({ x: raizOmega(e.rotacao_rpm!), y: e.taxa_reacao_mol_cm2_s!, rotulo: `${e.id_ensaio} · ${e.id_referencia} · ${fmt(e.temperatura_c, 0)} °C` })), [existentes, idsGravados])

  // ---- colar do Excel: várias linhas (tab ou ;) a partir da célula onde colou
  function colar(e: ClipboardEvent<HTMLInputElement>, linha: number, coluna: number) {
    const texto = e.clipboardData.getData('text')
    if (!/[\t\n]/.test(texto.trim())) return
    e.preventDefault()
    const brutas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
    const sep = brutas.some((l) => l.includes('\t')) ? '\t' : ';'
    setLinhas((atuais) => {
      const novas = atuais.map((l) => ({ ...l }))
      brutas.forEach((b, i) => {
        while (novas.length <= linha + i) novas.push(pontoVazio())
        b.split(sep).forEach((cel, j) => {
          const col = COLUNAS_PONTO[coluna + j]
          if (col) novas[linha + i][col] = cel.trim()
        })
      })
      return novas
    })
  }
  const mudarLinha = (i: number, campo: keyof LinhaPonto, valor: string) =>
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)))

  // ---- g) gravar
  async function gravar() {
    setErro(null)
    setGravando(true)
    try {
      const litologia = rocha.litologia === NOVA_LITOLOGIA ? rocha.novaLitologia.trim() : rocha.litologia
      const pct = (s: string) => ler(s)[0]
      const s: NovaSerieLiteratura = {
        ...(pub.nova
          ? { publicacao: { autor: pub.autor.trim(), ano: txt(pub.ano), titulo: txt(pub.titulo), periodico: txt(pub.periodico), doi: txt(pub.doi), link: txt(pub.link) } }
          : { id_referencia: pub.id }),
        ...(rocha.nova
          ? {
            rocha: {
              litologia, composicao_texto: txt(rocha.texto),
              calcita_pct: pct(rocha.calcita_pct), calcita_qualificador: pct(rocha.calcita_pct) != null ? rocha.calcita_qualificador : null,
              dolomita_pct: pct(rocha.dolomita_pct), dolomita_qualificador: pct(rocha.dolomita_pct) != null ? rocha.dolomita_qualificador : null,
              razao_ca_mg: pct(rocha.razao_ca_mg),
            },
          }
          : { id_rocha: rocha.id }),
        ...(sistema.novo ? { sistema: sistemaNovo } : { id_sistema: sistema.id }),
        condicao, pontos,
      }
      const r = await gravarSerieLiteratura(supabase, s)
      // o que era novo agora existe: o formulário passa a apontar para os códigos criados
      setPub({ ...pubInicial(), id: r.id_referencia })
      setRocha({ ...rochaInicial(), id: r.id_rocha })
      setSistema({ ...sistemaInicial(), id: r.id_sistema })
      setProbSistema([])
      setGravada(r)
      pubs.recarregar(); rochas.recarregar(); sistemas.recarregar(); litologias.recarregar()
      setVersao((v) => v + 1)
      aoGravar?.()
    } catch (e) {
      setErro(explicarErro020(e))
    } finally {
      setGravando(false)
    }
  }
  function mesmaCondicao() {
    setLinhas(pontosIniciais())
    setGravada(null)
    setErro(null)
  }
  function limparTudo() {
    setPub(pubInicial()); setRocha(rochaInicial()); setSistema(sistemaInicial()); setProbSistema([])
    setCond(condInicial()); setLinhas(pontosIniciais()); setGravada(null); setErro(null)
  }

  const erroCatalogo = listas.erro ?? pubs.erro ?? rochas.erro ?? sistemas.erro ?? fluidos.erro ?? litologias.erro
  const metodos = (lista: string) => (listas.dados ?? []).filter((l) => l.lista === lista).map((l) => l.valor)
  const tNominal = temperaturaNominal(condicao.temperatura_c ?? null)
  const rotuloVar = cond.tipo === 'taxa de cisalhamento' ? 'Cisalhamento (1/s)' : 'Rotação (rpm)'
  const unidade = <T extends string>(valor: T, opcoes: readonly T[], aoMudar: (v: T) => void, rotulo: string) => (
    <select className="input !w-[92px] shrink-0" aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value as T)}>
      {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div className="flex flex-col gap-6">
      {erroCatalogo && <Alert tipo="erro" mensagem={erroCatalogo} />}

      {/* a) publicação */}
      <Card titulo="a) Publicação" subtitulo="De onde saíram os números" icone={<BookOpen size={18} />}
        acoes={<Modo novo={pub.nova} aoMudar={(nova) => setPub({ ...pub, nova })} existente="Escolher existente" criar="Cadastrar nova" />}>
        {pub.nova ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            <div className="md:col-span-4"><Input label="Autor" obrigatorio placeholder="Ex.: Silva et al." value={pub.autor} onChange={(e) => setPub({ ...pub, autor: e.target.value })} /></div>
            <div className="md:col-span-2"><Input label="Ano" placeholder="Ex.: 2019" inputMode="numeric" value={pub.ano} onChange={(e) => setPub({ ...pub, ano: e.target.value })} /></div>
            <div className="md:col-span-6"><Input label="Título" value={pub.titulo} onChange={(e) => setPub({ ...pub, titulo: e.target.value })} /></div>
            <div className="md:col-span-2"><Input label="Periódico" value={pub.periodico} onChange={(e) => setPub({ ...pub, periodico: e.target.value })} /></div>
            <div className="md:col-span-2"><Input label="DOI" placeholder="10.xxxx/…" value={pub.doi} onChange={(e) => setPub({ ...pub, doi: e.target.value })} /></div>
            <div className="md:col-span-2"><Input label="Link" placeholder="https://…" value={pub.link} onChange={(e) => setPub({ ...pub, link: e.target.value })} /></div>
            <p className="m-0 text-[12px] text-[var(--color-neutral-600)] md:col-span-6">Uma publicação = um artigo. O código (REF-R…) é dado pelo banco ao gravar.</p>
          </div>
        ) : (
          <>
            <Escolher itens={pubs.dados ?? []} carregando={pubs.carregando} valor={pub.id} aoEscolher={(id) => setPub({ ...pub, id })}
              chave={(p) => p.id_referencia} titulo={(p) => `${p.autor}${p.ano ? ` (${p.ano})` : ''}`}
              detalhe={(p) => [p.titulo, p.periodico].filter(Boolean).join(' · ')} placeholder="Buscar por autor, ano, título ou código…" />
            <p className="m-0 mt-2 text-[12px] text-[var(--color-neutral-600)]">Uma publicação = um artigo.</p>
          </>
        )}
      </Card>

      {/* b) rocha */}
      <Card titulo="b) Rocha" subtitulo="Como o artigo descreve a rocha" icone={<Layers size={18} />}
        acoes={<Modo novo={rocha.nova} aoMudar={(nova) => setRocha({ ...rocha, nova })} existente="Escolher existente" criar="Cadastrar nova" />}>
        {rocha.nova ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <Select label="Litologia" obrigatorio value={rocha.litologia} onChange={(e) => setRocha({ ...rocha, litologia: e.target.value })}>
                <option value="">Selecione…</option>
                {(litologias.dados ?? []).map((l) => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
                <option value={NOVA_LITOLOGIA}>+ Nova litologia…</option>
              </Select>
            </div>
            {rocha.litologia === NOVA_LITOLOGIA && (
              <div className="md:col-span-2"><Input label="Nome da nova litologia" obrigatorio placeholder="Ex.: Indiana Limestone" value={rocha.novaLitologia} onChange={(e) => setRocha({ ...rocha, novaLitologia: e.target.value })} /></div>
            )}
            <div className={rocha.litologia === NOVA_LITOLOGIA ? 'md:col-span-2' : 'md:col-span-4'}>
              <Input label="Composição como no artigo" placeholder="Ex.: [Calcita] > 99 %  ou  RM Ca/Mg = 1,1" value={rocha.texto}
                onChange={(e) => mudarTextoRocha(e.target.value)} ajuda="Ao digitar, os campos abaixo são preenchidos (pode corrigir à mão)." />
            </div>
            {([['calcita', 'Calcita'], ['dolomita', 'Dolomita']] as const).map(([k, r]) => (
              <div key={k} className="md:col-span-2">
                <span className="rotulo">{r} <span className="normal-case tracking-normal font-normal text-[var(--color-neutral-500)]">(%)</span></span>
                <div className="mt-1 flex gap-2">
                  <select className="input !w-[72px] shrink-0" aria-label={`Qualificador da ${k}`} value={rocha[`${k}_qualificador`]}
                    onChange={(e) => setRocha({ ...rocha, [`${k}_qualificador`]: e.target.value })}>
                    {QUALIFICADORES.map(([v, s]) => <option key={v} value={v}>{s}</option>)}
                  </select>
                  <input className="input" inputMode="decimal" placeholder="ex.: 99" value={rocha[`${k}_pct`]}
                    onChange={(e) => setRocha({ ...rocha, [`${k}_pct`]: e.target.value })} />
                </div>
              </div>
            ))}
            <div className="md:col-span-2"><Input label="Razão Ca/Mg" inputMode="decimal" placeholder="ex.: 1,1" value={rocha.razao_ca_mg} onChange={(e) => setRocha({ ...rocha, razao_ca_mg: e.target.value })} /></div>
          </div>
        ) : (
          <Escolher itens={rochas.dados ?? []} carregando={rochas.carregando} valor={rocha.id} aoEscolher={(id) => setRocha({ ...rocha, id })}
            chave={(r) => r.id_rocha} titulo={(r) => r.litologia} detalhe={(r) => r.composicao_texto ?? 'composição não informada'}
            placeholder="Buscar por litologia, composição ou código…" />
        )}
      </Card>

      {/* c) sistema ácido */}
      <Card titulo="c) Sistema ácido" subtitulo="O 1º componente é o ácido principal; os demais são aditivos" icone={<FlaskConical size={18} />}
        acoes={<Modo novo={sistema.novo} aoMudar={(novo) => setSistema({ ...sistema, novo })} existente="Escolher existente" criar="Colar composição" />}>
        {sistema.novo ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input label="Composição como no artigo" placeholder="Ex.: [HCl]=15 wt% [IC]=0,5 vol%   ou   15 wt% HCl + 0,5 vol% IC"
                  value={sistema.texto} onChange={(e) => mudarTextoSistema(e.target.value)} ajuda="Cole o texto: a tabela abaixo é preenchida (até 4 componentes) e pode ser corrigida." />
              </div>
              <Input label="Nome do sistema" placeholder={compsPreenchidos.map((c) => c.componente).join(' + ') || 'Ex.: HCl 15% + IC'}
                value={sistema.nome} onChange={(e) => setSistema({ ...sistema, nome: e.target.value })} ajuda="Em branco: usa os nomes dos componentes." />
            </div>
            <div className="overflow-x-auto">
              <table className="table text-[13px]">
                <thead><tr><th className="w-[40px]">#</th><th>Componente</th><th className="w-[160px]">Valor</th><th className="w-[140px]">Unidade</th></tr></thead>
                <tbody>
                  {sistema.comps.map((c, i) => (
                    <tr key={i}>
                      <td className="!py-1.5 text-[var(--color-neutral-600)]">{i + 1}</td>
                      <td className="!py-1.5"><input className="input !py-1.5" aria-label={`Componente ${i + 1}`} placeholder={i === 0 ? 'ácido principal, ex.: HCl' : 'aditivo (opcional)'} value={c.componente} onChange={(e) => mudarComp(i, 'componente', e.target.value)} /></td>
                      <td className="!py-1.5"><input className="input !py-1.5" aria-label={`Valor ${i + 1}`} inputMode="decimal" value={c.valor} onChange={(e) => mudarComp(i, 'valor', e.target.value)} /></td>
                      <td className="!py-1.5">
                        <select className="input !py-1.5" aria-label={`Unidade ${i + 1}`} value={c.unidade} onChange={(e) => mudarComp(i, 'unidade', e.target.value)}>
                          <option value="">—</option>
                          {UN_COMPONENTE.map((u) => <option key={u} value={u}>{u}</option>)}
                          {c.unidade && !UN_COMPONENTE.includes(c.unidade) && <option value={c.unidade}>{c.unidade} (escolha wt% ou vol%)</option>}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListaProblemas problemas={probSistema} />
            {primeiro && (
              <p className="m-0 text-[13px] text-[var(--color-neutral-700)]">
                {primeiro.componente}:{' '}
                {concM != null
                  ? <><strong className="text-[var(--color-blue-800)]">{fmt(concM, 3)} M</strong>{concPct != null && <> · <strong className="text-[var(--color-blue-800)]">{fmt(concPct, 2)} wt%</strong></>} <span className="text-[var(--color-neutral-500)]">(mesma conta do banco)</span></>
                  : <span className="text-[var(--color-orange-700)]">sem conversão para M{!fluido ? ' (componente sem propriedades em fluidos_prop)' : ''}</span>}
              </p>
            )}
            {sistemaIgual && (
              <div className="aviso aviso-info flex flex-wrap items-center gap-3" role="status">
                <span className="flex-1 min-w-[220px]">
                  Esse sistema já existe: <strong>{sistemaIgual} — {(sistemas.dados ?? []).find((s) => s.id_sistema === sistemaIgual)?.nome_sistema}</strong>.
                </span>
                <button type="button" className="btn btn-blue btn-sm" onClick={() => { setSistema({ ...sistemaInicial(), id: sistemaIgual }); setProbSistema([]) }}>Usar ele</button>
              </div>
            )}
          </div>
        ) : (
          <Escolher<SistemaBanco> itens={sistemas.dados ?? []} carregando={sistemas.carregando} valor={sistema.id} aoEscolher={(id) => setSistema({ ...sistema, id })}
            chave={(s) => s.id_sistema} titulo={(s) => s.nome_sistema} detalhe={(s) => composicaoDoSistema(s) || (s.composicao_original ?? '')}
            placeholder="Buscar por nome, composição ou código…" />
        )}
      </Card>

      {/* d) condição */}
      <Card titulo="d) Condição do ensaio" subtitulo="Digite na unidade do artigo: o banco guarda em °C, psi e polegadas, e lembra a unidade original" icone={<Thermometer size={18} />}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className="rotulo">Temperatura <span className="text-[var(--color-red)]">*</span></span>
            <div className="mt-1 flex gap-2">
              <input className="input" inputMode="decimal" value={cond.temperatura} onChange={(e) => setCond({ ...cond, temperatura: e.target.value })} />
              {unidade(cond.uT, UN_TEMPERATURA, (uT) => setCond({ ...cond, uT }), 'Unidade da temperatura')}
            </div>
            <span className="ajuda mt-1 block text-[12px] text-[var(--color-neutral-600)]">
              {condicao.temperatura_c != null ? <>{cond.uT !== '°C' && <>{fmt(condicao.temperatura_c, 1)} °C · </>}nominal <strong>{fmt(tNominal, 0)} °C</strong></> : 'temperatura nominal: —'}
            </span>
          </div>
          <div>
            <span className="rotulo">Pressão</span>
            <div className="mt-1 flex gap-2">
              <input className="input" inputMode="decimal" value={cond.pressao} onChange={(e) => setCond({ ...cond, pressao: e.target.value })} />
              {unidade(cond.uP, UN_PRESSAO, (uP) => setCond({ ...cond, uP }), 'Unidade da pressão')}
            </div>
            {condicao.pressao_psi != null && cond.uP !== 'psi' && <span className="mt-1 block text-[12px] text-[var(--color-neutral-600)]">{fmt(condicao.pressao_psi, 1)} psi</span>}
          </div>
          <div className="md:col-span-2">
            <span className="rotulo">Disco: diâmetro (1ª dimensão) e espessura (2ª dimensão)</span>
            <div className="mt-1 flex gap-2">
              <input className="input" inputMode="decimal" aria-label="Diâmetro do disco" placeholder="diâmetro" value={cond.d1} onChange={(e) => setCond({ ...cond, d1: e.target.value })} />
              <input className="input" inputMode="decimal" aria-label="Espessura do disco" placeholder="espessura" value={cond.d2} onChange={(e) => setCond({ ...cond, d2: e.target.value })} />
              {unidade(cond.uL, UN_COMPRIMENTO, (uL) => setCond({ ...cond, uL }), 'Unidade das dimensões')}
            </div>
            {cond.uL !== 'in' && (condicao.dim_h_in != null || condicao.dim_d_in != null) && (
              <span className="mt-1 block text-[12px] text-[var(--color-neutral-600)]">{fmt(condicao.dim_h_in, 3)} in × {fmt(condicao.dim_d_in, 3)} in</span>
            )}
          </div>
          <Select label="Tipo da variável" value={cond.tipo} onChange={(e) => setCond({ ...cond, tipo: e.target.value as (typeof TIPOS)[number] })}>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="Método de quantificação" value={cond.metQ} onChange={(e) => setCond({ ...cond, metQ: e.target.value })}>
            <option value="">—</option>
            {metodos('metodo_quantificacao').map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select label="Método do coef. de difusão" value={cond.metD} onChange={(e) => setCond({ ...cond, metD: e.target.value })}>
            <option value="">—</option>
            {metodos('metodo_coef_difusao').map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Input label="Ano do dado" inputMode="numeric" placeholder="em branco: ano da publicação" value={cond.ano} onChange={(e) => setCond({ ...cond, ano: e.target.value })} />
          <Select label="Procedência do valor" obrigatorio value={cond.obtencao} onChange={(e) => setCond({ ...cond, obtencao: e.target.value as typeof cond.obtencao })}>
            <option value="">Selecione…</option>
            {OBTENCAO.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Input label="Onde está na fonte" placeholder="Ex.: Tabela 3, Fig. 7b" value={cond.fonte_local} onChange={(e) => setCond({ ...cond, fonte_local: e.target.value })} />
          <div className="md:col-span-2"><Input label="Observação da série" value={cond.observacao} onChange={(e) => setCond({ ...cond, observacao: e.target.value })} /></div>
        </div>
      </Card>

      {/* e) pontos + gráfico */}
      <Card titulo="e) Pontos" subtitulo="Uma linha por rotação. Pode colar várias linhas do Excel (aceita vírgula decimal)" icone={<ListOrdered size={18} />}
        acoes={<label className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-neutral-700)]">Unidade da taxa
          {<select className="input !w-auto !py-1.5" value={uTaxa} onChange={(e) => setUTaxa(e.target.value as UnTaxa)}>{UN_TAXA.map((u) => <option key={u} value={u}>{u}</option>)}</select>}
        </label>}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <div className="overflow-x-auto">
              <table className="table text-[13px]">
                <thead>
                  <tr>
                    <th className="w-[36px]">#</th><th>{cond.tipo === 'não informada' ? 'Variável' : rotuloVar}</th>
                    {cond.tipo === 'rotação (RDA)' && <th className="text-right">√ω</th>}
                    <th>Taxa ({uTaxa})</th><th>Coef. difusão (cm²/s)</th><th>Observação</th><th className="w-[36px]" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const [rpm] = ler(l.v)
                    return (
                      <tr key={i}>
                        <td className="!py-1 text-[var(--color-neutral-600)] tabular-nums">{i + 1}</td>
                        <td className="!py-1"><input className="input !py-1.5 min-w-[90px]" inputMode="decimal" aria-label={`${rotuloVar} do ponto ${i + 1}`} disabled={cond.tipo === 'não informada'}
                          placeholder={cond.tipo === 'não informada' ? 'não informada' : ''} value={l.v} onChange={(e) => mudarLinha(i, 'v', e.target.value)} onPaste={(e) => colar(e, i, 0)} /></td>
                        {cond.tipo === 'rotação (RDA)' && <td className="!py-1 text-right tabular-nums text-[var(--color-neutral-700)]">{rpm != null && rpm >= 0 ? fmt(raizOmega(rpm), 3) : '—'}</td>}
                        <td className="!py-1"><input className="input !py-1.5 min-w-[110px]" inputMode="decimal" aria-label={`Taxa do ponto ${i + 1}`} placeholder="ex.: 2,5E-6" value={l.taxa} onChange={(e) => mudarLinha(i, 'taxa', e.target.value)} onPaste={(e) => colar(e, i, 1)} /></td>
                        <td className="!py-1"><input className="input !py-1.5 min-w-[100px]" inputMode="decimal" aria-label={`Coeficiente de difusão do ponto ${i + 1}`} value={l.coef} onChange={(e) => mudarLinha(i, 'coef', e.target.value)} onPaste={(e) => colar(e, i, 2)} /></td>
                        <td className="!py-1"><input className="input !py-1.5 min-w-[110px]" aria-label={`Observação do ponto ${i + 1}`} value={l.obs} onChange={(e) => mudarLinha(i, 'obs', e.target.value)} onPaste={(e) => colar(e, i, 3)} /></td>
                        <td className="!py-1"><button type="button" className="btn-icone perigo" title="Remover a linha" onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : [pontoVazio()]))}><Trash2 size={14} /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLinhas((ls) => [...ls, pontoVazio()])}><Plus size={14} /> Linha</button>
              <span className="text-[12px] text-[var(--color-neutral-600)]">{pontos.length} ponto(s) preenchido(s). Colunas ao colar: variável, taxa, coef. de difusão, observação.</span>
            </div>
          </div>
          <GraficoLevich pontos={xyNovos} existentes={xyBanco} levich={levich} />
        </div>
      </Card>

      {/* f) validação + g) gravar */}
      <Card titulo="Conferir e gravar" subtitulo="Erros (vermelho) bloqueiam a gravação; avisos (laranja) só chamam a atenção">
        <div className="flex flex-col gap-4">
          {!gravada && (
            <ListaProblemas problemas={problemas}
              vazio={<p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-700)]"><CheckCircle2 size={15} className="text-[var(--color-blue)]" /> Nenhum problema encontrado.</p>} />
          )}
          {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}
          {gravada ? (
            <div className="aviso aviso-ok" role="status">
              <p className="m-0 flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} />
                Série gravada: {gravada.ids.length > 1 ? `${gravada.ids[0]} a ${gravada.ids[gravada.ids.length - 1]}` : gravada.ids[0]}
                {' '}({gravada.id_referencia} · {gravada.id_rocha} · {gravada.id_sistema})
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary" onClick={mesmaCondicao}>Nova série com a mesma condição</button>
                <button type="button" className="btn btn-secondary" onClick={limparTudo}>Nova série do zero</button>
                <a className="btn btn-blue" href={`${URL_DASHBOARD}/literatura`} target="_blank" rel="noreferrer">Ver no dashboard</a>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" onClick={gravar} disabled={gravando || nErros > 0 || !!erroCatalogo}>
                {gravando ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : `Gravar série (${pontos.length} ponto${pontos.length === 1 ? '' : 's'})`}
              </button>
              {nErros > 0 && <span className="text-[12px] text-[var(--color-red-700)]">{nErros} erro(s) a corrigir antes de gravar.</span>}
              <span className="text-[12px] text-[var(--color-neutral-600)]">Publicação, rocha e sistema novos e todos os pontos são gravados juntos: ou grava tudo, ou nada.</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
