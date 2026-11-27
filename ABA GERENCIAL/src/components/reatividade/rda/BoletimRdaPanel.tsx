// REATIVIDADE › Dissolução dinâmica (RDA) › Boletim de disco.
//   - importa o boletim do laboratório (.xlsx: lerBoletimRda) ou lança à mão (mesmos campos + tabela de leituras);
//   - acha o disco (amostra) pelo código e o sistema ácido igual ao do boletim; oferece criar os que faltam;
//   - prévia ao vivo com calcularBoletim + gráfico científico padrão Origin ([H⁺], Δ[H⁺], [Ca²⁺], exportação PNG 300 dpi/SVG/PDF/CSV);
//   - salva TODOS os dados na amostra: analise_rda, rda_leituras, curvas ([H⁺], [Ca²⁺], [Mg²⁺]), cadastro físico do disco,
//     petrofísica (φ, K, massas antes/depois) e anexo da planilha .xlsx original.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ClipboardPaste, ExternalLink, FilePlus2, Paperclip, Plus, Save, Trash2, Upload } from 'lucide-react'
import { LISTA_ANALISES } from '../../../config/analises'
import { supabase } from '../../../lib/supabase'
import { lerArquivoBruto } from '../../../importador/lerArquivo'
import { acharSistemaIgual } from '../../../importador/cadastroReatividade'
import { calcularBoletim, concentracaoInicialMolL, reta, type EntradaBoletim, type Mineral } from '../../../reatividade/calculoRda'
import { gravarBoletimRda, sistemaDoBoletim } from '../../../reatividade/gravarRda'
import { lerBoletimRda, type BoletimLido } from '../../../reatividade/lerBoletimRda'
import {
  buscarAmostraPorCodigo,
  listarArquivosAnexos,
  listarLitologias,
  listarProjetos,
  listarSistemasAcidos,
  salvarAmostra,
  uploadArquivoStorage,
  type AmostraResumo,
} from '../../../servicos/api'
import { useContexto } from '../../../store/useContexto'
import type { Litologia, Projeto, SistemaAcido } from '../../../tipos/banco'
import { mensagemErro } from '../../../utils/formatacao'
import { Alert, Badge, Button, Card, Input, Select } from '../../UI'
import { CartaoNumero, GraficoHTempo, ListaAvisos, type PontoRdaGrafico } from './comum'
import { cient, lerNumero, num, paraCampo, temErro } from './numeros'

interface Linha { rotulo: string; tempo: string; ca: string; mg: string }

const CFG_RDA = LISTA_ANALISES.find((c) => c.chave === 'rda')!

const VAZIO = {
  codigo: '', estudo: '', operadores: '', data_inicio: '', data_fim: '',
  temperatura_c: '', rotacao_rpm: '', pressao_psi: '', volume_acido_ml: '', massa_antes_g: '', massa_depois_g: '',
  diametro_cm: '3,81', comprimento_cm: '', porosidade_pct: '', permeabilidade_md: '',
  fluido: '', conc_wt_pct: '', densidade_g_ml: '', massa_molar_fluido: '', c0_manual: '',
  ca_k: '', ca_dil: '', ca_mm: '40,078', ca_data: '', mg_k: '', mg_dil: '', mg_mm: '24,305', mg_data: '',
  janela_s: '', serie: '', observacoes: '',
}
type Form = typeof VAZIO

/** colado do Excel: "rótulo? | tempo | abs Ca | abs Mg?" por linha (tab, ; ou espaços) */
function colar(texto: string): Linha[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).flatMap((l) => {
    const c = l.split(/\t|;|\s{2,}|\s(?=[-\d])/).map((x) => x.trim()).filter((x) => x !== '')
    if (!c.length) return []
    const rot = lerNumero(c[0]) == null ? c.shift()! : ''
    if (lerNumero(c[0]) == null) return []   // cabeçalho
    return [{ rotulo: rot, tempo: c[0] ?? '', ca: c[1] ?? '', mg: c[2] ?? '' }]
  })
}

export const BoletimRdaPanel: React.FC = () => {
  const navigate = useNavigate()
  const empresaId = useContexto((s) => s.empresaId)
  const projetoContexto = useContexto((s) => s.projetoId)

  const [f, setF] = useState<Form>(VAZIO)
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const [mineral, setMineral] = useState<Mineral>('calcita')
  const [linhas, setLinhas] = useState<Linha[]>([{ rotulo: '', tempo: '0', ca: '', mg: '' }])
  const [boletim, setBoletim] = useState<BoletimLido | null>(null)
  const [arquivoBoletim, setArquivoBoletim] = useState<File | null>(null)
  const [salvarTudoNaAmostra, setSalvarTudoNaAmostra] = useState(true)
  const [ultimoSalvo, setUltimoSalvo] = useState<{ amostraId: string; codigo: string; itens: string[] } | null>(null)
  const [textoColar, setTextoColar] = useState('')
  const [mostrarColar, setMostrarColar] = useState(false)

  const [sistemas, setSistemas] = useState<SistemaAcido[]>([])
  const [litologias, setLitologias] = useState<Litologia[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [series, setSeries] = useState<string[]>([])
  const [idSistema, setIdSistema] = useState('')
  const [amostra, setAmostra] = useState<AmostraResumo | null>(null)
  const [procurando, setProcurando] = useState(false)
  const [novoDisco, setNovoDisco] = useState({ projeto_id: projetoContexto ?? '', litologia: '' })

  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'sucesso' | 'info'; texto: string } | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const carregarCatalogos = useCallback(async () => {
    const [sis, lits, prjs] = await Promise.all([
      listarSistemasAcidos().catch(() => []), listarLitologias().catch(() => []), listarProjetos(empresaId ?? undefined, true).catch(() => []),
    ])
    setSistemas(sis); setLitologias(lits); setProjetos(prjs)
    let q = supabase.from('rda_series').select('nome')
    if (projetoContexto) q = q.eq('projeto_id', projetoContexto)
    const { data: s1 } = await q
    let q2 = supabase.from('v_analise_rda').select('serie').not('serie', 'is', null)
    if (projetoContexto) q2 = q2.eq('projeto_id', projetoContexto)
    const { data: s2 } = await q2
    setSeries([...new Set([...(s1 ?? []).map((x) => x.nome as string), ...(s2 ?? []).map((x) => x.serie as string)])].sort())
  }, [empresaId, projetoContexto])
  useEffect(() => { void carregarCatalogos() }, [carregarCatalogos])

  // disco pelo código (espera parar de digitar)
  useEffect(() => {
    const cod = f.codigo.trim()
    if (!cod) { setAmostra(null); return }
    setProcurando(true)
    const t = setTimeout(() => {
      buscarAmostraPorCodigo(cod).then((a) => {
        setAmostra(a)
        if (a?.litologia && /dolom/i.test(a.litologia) && !boletim) setMineral('dolomita')
      }).catch(() => setAmostra(null)).finally(() => setProcurando(false))
    }, 400)
    return () => clearTimeout(t)
  }, [f.codigo, boletim])

  // sistema igual ao do boletim / do fluido digitado
  const sistemaSugerido = useMemo(() => sistemaDoBoletim({ fluido: f.fluido || null, conc_wt_pct: lerNumero(f.conc_wt_pct) }), [f.fluido, f.conc_wt_pct])
  useEffect(() => {
    if (!sistemaSugerido || idSistema) return
    const id = acharSistemaIgual(sistemas as unknown as Record<string, unknown>[], sistemaSugerido)
    if (id) setIdSistema(id)
  }, [sistemaSugerido, sistemas, idSistema])

  // -------------------------------------------------------------------------
  // entrada do cálculo
  // -------------------------------------------------------------------------
  const c0Calculado = useMemo(() => {
    const wt = lerNumero(f.conc_wt_pct), mm = lerNumero(f.massa_molar_fluido), rho = lerNumero(f.densidade_g_ml)
    return wt != null && mm && rho ? concentracaoInicialMolL(wt, mm, rho) : null
  }, [f.conc_wt_pct, f.massa_molar_fluido, f.densidade_g_ml])
  const c0 = lerNumero(f.c0_manual) ?? c0Calculado

  const { entrada, faltando } = useMemo(() => {
    const falta: string[] = []
    const d = lerNumero(f.diametro_cm), k = lerNumero(f.ca_k), dil = lerNumero(f.ca_dil), mm = lerNumero(f.ca_mm)
    if (!d) falta.push('diâmetro do disco')
    if (c0 == null) falta.push('C₀ (ou wt%, ρ e massa molar do fluido)')
    if (!k) falta.push('inclinação k da calibração do Ca')
    if (!dil) falta.push('fator de diluição do Ca')
    const leituras = linhas.map((l) => ({ rotulo: l.rotulo || null, tempo_s: lerNumero(l.tempo) ?? NaN, abs_ca: lerNumero(l.ca), abs_mg: lerNumero(l.mg) }))
      .filter((l) => Number.isFinite(l.tempo_s))
    if (leituras.length < 3) falta.push('pelo menos 3 leituras')
    const mgK = lerNumero(f.mg_k), mgDil = lerNumero(f.mg_dil), mgMm = lerNumero(f.mg_mm)
    if (falta.length) return { entrada: null, faltando: falta }
    const e: EntradaBoletim = {
      mineral, diametro_cm: d!, porosidade_pct: lerNumero(f.porosidade_pct), c0_mol_l: c0!,
      calCa: { inclinacao: k!, diluicao: dil!, massaMolar: mm ?? 40.078, data: f.ca_data || null },
      calMg: mineral === 'dolomita' && mgK && mgDil ? { inclinacao: mgK, diluicao: mgDil, massaMolar: mgMm ?? 24.305, data: f.mg_data || null } : null,
      leituras, tempoMaximo_s: lerNumero(f.janela_s),
      massa_antes_g: lerNumero(f.massa_antes_g), massa_depois_g: lerNumero(f.massa_depois_g), volume_acido_ml: lerNumero(f.volume_acido_ml),
    }
    return { entrada: e, faltando: [] }
  }, [f, linhas, mineral, c0])

  const resultado = useMemo(() => (entrada ? calcularBoletim(entrada) : null), [entrada])

  const grafico = useMemo(() => {
    if (!resultado) return null
    const campo = mineral === 'dolomita' ? 'h_so_ca_mol_l' : 'h_mol_l'
    const pts = resultado.pontos.filter((p) => p[campo] != null)
    const paraPonto = (p: (typeof pts)[number]): PontoRdaGrafico => ({
      x: p.tempo_s,
      y: p[campo] as number,
      rotulo: p.rotulo ?? null,
      ca_mol_l: p.ca_mol_l,
      mg_mol_l: p.mg_mol_l,
      h_mol_l: p[campo] as number,
      abs_ca: p.abs_ca,
      abs_mg: p.abs_mg,
      usado: p.usado,
    })
    const usados = pts.filter((p) => p.usado).map(paraPonto)
    const fora = pts.filter((p) => !p.usado).map(paraPonto)
    const pontosCompletos = pts.map(paraPonto)
    return { usados, fora, pontosCompletos, reta: reta(usados.map((p) => p.x), usados.map((p) => p.y)) }
  }, [resultado, mineral])

  // conferência com o que a planilha calculou
  const conferencia = useMemo(() => {
    if (!boletim || !resultado) return []
    const p = boletim.planilha
    const itens: [string, number | null | undefined, number | null][] = mineral === 'dolomita'
      ? [['TR só Ca', p.taxa_so_ca ?? p.taxa, resultado.taxa_so_ca], ['TR Ca + Mg', p.taxa_ca_mg, resultado.taxa_ca_mg]]
      : [['TR', p.taxa, resultado.taxa_reacao]]
    itens.push(['C₀ (mol/L)', p.c0_mol_l, c0], ['Área corrigida (cm²)', p.area_corrigida_cm2, resultado.area_corrigida_cm2])
    return itens.filter(([, a, b]) => a != null && b != null).map(([rot, a, b]) => ({ rot, planilha: a as number, sistema: b as number, difere: Math.abs((b as number) - (a as number)) / Math.abs(a as number) > 0.001 }))
  }, [boletim, resultado, mineral, c0])

  // -------------------------------------------------------------------------
  // ações
  // -------------------------------------------------------------------------
  async function importar(arquivo: File) {
    setMsg(null); setUltimoSalvo(null)
    try {
      const b = lerBoletimRda(await lerArquivoBruto(arquivo))
      setBoletim(b)
      setArquivoBoletim(arquivo)
      const e = b.entrada
      setMineral(b.mineral)
      setIdSistema('')
      setF({
        ...VAZIO,
        codigo: b.codigo ?? '', estudo: b.estudo ?? '', operadores: b.operadores ?? '',
        data_inicio: b.data_inicio ?? '', data_fim: b.data_fim ?? '',
        temperatura_c: paraCampo(b.temperatura_c), rotacao_rpm: paraCampo(b.rotacao_rpm), volume_acido_ml: paraCampo(b.volume_acido_ml),
        massa_antes_g: paraCampo(e?.massa_antes_g), massa_depois_g: paraCampo(e?.massa_depois_g),
        diametro_cm: paraCampo(e?.diametro_cm), comprimento_cm: paraCampo(b.comprimento_cm),
        porosidade_pct: paraCampo(e?.porosidade_pct), permeabilidade_md: paraCampo(b.permeabilidade_md),
        fluido: b.fluido ?? '', conc_wt_pct: paraCampo(b.conc_wt_pct), densidade_g_ml: paraCampo(b.densidade_g_ml), massa_molar_fluido: paraCampo(b.massa_molar_fluido),
        c0_manual: c0DoBoletimDiferente(b) ? paraCampo(e?.c0_mol_l) : '',
        ca_k: paraCampo(e?.calCa.inclinacao), ca_dil: paraCampo(e?.calCa.diluicao), ca_mm: paraCampo(e?.calCa.massaMolar ?? 40.078), ca_data: e?.calCa.data ?? '',
        mg_k: paraCampo(e?.calMg?.inclinacao), mg_dil: paraCampo(e?.calMg?.diluicao), mg_mm: paraCampo(e?.calMg?.massaMolar ?? 24.305), mg_data: e?.calMg?.data ?? '',
        janela_s: paraCampo(e?.tempoMaximo_s), observacoes: b.observacoes ?? '',
      })
      setLinhas((e?.leituras ?? []).map((l) => ({ rotulo: l.rotulo ?? '', tempo: paraCampo(l.tempo_s), ca: paraCampo(l.abs_ca), mg: paraCampo(l.abs_mg) })))
      const lit = litologias.find((l) => b.litologia_texto && l.nome.toLowerCase().includes(b.litologia_texto.toLowerCase()))
      setNovoDisco((n) => ({ ...n, litologia: lit?.nome ?? n.litologia }))
      setMsg({ tipo: 'info', texto: `Boletim lido (${arquivo.name}, aba "${b.aba}"). Confira os campos e o gráfico Origin antes de salvar na amostra.` })
    } catch (e) {
      setMsg({ tipo: 'erro', texto: `Não foi possível ler o boletim: ${mensagemErro(e)}` })
    }
  }

  function novoManual() {
    setBoletim(null); setArquivoBoletim(null); setUltimoSalvo(null); setF(VAZIO); setIdSistema(''); setMineral('calcita'); setAmostra(null)
    setLinhas([{ rotulo: '', tempo: '0', ca: '', mg: '' }]); setMsg(null)
  }

  async function criarDisco() {
    setMsg(null)
    const projeto = novoDisco.projeto_id || projetoContexto
    if (!projeto || !novoDisco.litologia) { setMsg({ tipo: 'erro', texto: 'Para criar o disco, escolha o projeto e a litologia.' }); return }
    setOcupado(true)
    try {
      await salvarAmostra({
        codigo: f.codigo.trim().toUpperCase(), projeto_id: projeto, litologia: novoDisco.litologia, tipo_origem: 'afloramento',
        finalidade: 'RDA', tipo_amostra: 'disco',
        diametro_cm: lerNumero(f.diametro_cm), comprimento_cm: lerNumero(f.comprimento_cm),
        massa_seca_g: lerNumero(f.massa_antes_g), permeabilidade_fabricante_md: lerNumero(f.permeabilidade_md),
        responsavel: f.operadores.trim() || null,
      })
      setAmostra(await buscarAmostraPorCodigo(f.codigo.trim().toUpperCase()))
      setMsg({ tipo: 'sucesso', texto: `Disco ${f.codigo.trim().toUpperCase()} cadastrado no banco de amostras.` })
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }) } finally { setOcupado(false) }
  }

  async function criarSistema() {
    if (!sistemaSugerido) return
    setOcupado(true); setMsg(null)
    try {
      const { data, error } = await supabase.from('sistemas_acidos').insert(sistemaSugerido).select('id_sistema').single()
      if (error) throw new Error(error.message)
      setSistemas(await listarSistemasAcidos())
      setIdSistema((data as { id_sistema: string }).id_sistema)
      setMsg({ tipo: 'sucesso', texto: `Sistema ${sistemaSugerido.nome_sistema} cadastrado (${(data as { id_sistema: string }).id_sistema}).` })
    } catch (e) { setMsg({ tipo: 'erro', texto: `Não foi possível criar o sistema: ${mensagemErro(e)}` }) } finally { setOcupado(false) }
  }

  async function gravar() {
    if (!entrada || !resultado || !amostra || !idSistema) return
    const rpm = lerNumero(f.rotacao_rpm)
    if (!rpm) { setMsg({ tipo: 'erro', texto: 'Informe a rotação (rpm).' }); return }
    setOcupado(true); setMsg(null); setUltimoSalvo(null)
    try {
      const base: BoletimLido = boletim ?? {
        aba: '', codigo: null, litologia_texto: null, mineral, estudo: null, operadores: null, boletim_por: null, observacoes: null,
        data_inicio: null, data_fim: null, data_boletim: null, temperatura_c: null, rotacao_rpm: null, volume_acido_ml: null, n_coletas: null,
        comprimento_cm: null, permeabilidade_md: null, fluido: null, conc_wt_pct: null, densidade_g_ml: null, massa_molar_fluido: null,
        planilha: {}, extras: {}, entrada: null, problemas: [],
      }
      const b: BoletimLido = {
        ...base, estudo: f.estudo || null, operadores: f.operadores || null, data_inicio: f.data_inicio || null, data_fim: f.data_fim || null,
        comprimento_cm: lerNumero(f.comprimento_cm), permeabilidade_md: lerNumero(f.permeabilidade_md),
        fluido: f.fluido || base.fluido || null, conc_wt_pct: lerNumero(f.conc_wt_pct),
        densidade_g_ml: lerNumero(f.densidade_g_ml), massa_molar_fluido: lerNumero(f.massa_molar_fluido),
        observacoes: f.observacoes || null, temperatura_c: lerNumero(f.temperatura_c),
      }
      const r = await gravarBoletimRda(supabase, {
        amostra_id: amostra.id, id_sistema: idSistema, serie: f.serie.trim() || null, rotacao_rpm: rpm,
        temperatura_c: lerNumero(f.temperatura_c), pressao_psi: lerNumero(f.pressao_psi),
        permeabilidade_md: lerNumero(f.permeabilidade_md),
        entrada, resultado, boletim: b, data_ensaio: f.data_inicio || null,
        incluirCurvasIons: salvarTudoNaAmostra,
        sincronizarAmostra: salvarTudoNaAmostra,
      })

      const itensSalvos: string[] = [
        `ensaio RDA #${r.analise_id}`,
        `${resultado.pontos.length} leituras AA`,
        `${r.nCurvas} curva(s) numérica(s)`,
      ]
      if (r.amostraAtualizada) itensSalvos.push('geometria/massa no cadastro do disco')
      if (r.petrofisicaSincronizada) itensSalvos.push('petrofísica (φ/K/massas)')

      let avisoAnexo = ''
      if (salvarTudoNaAmostra && arquivoBoletim && CFG_RDA) {
        try {
          const anexosExistentes = await listarArquivosAnexos(amostra.id, CFG_RDA).catch(() => [])
          const jaAnexado = anexosExistentes.some(
            (a) => a.analise_id === r.analise_id && a.nome_original === arquivoBoletim.name && a.tamanho_bytes === arquivoBoletim.size,
          )
          if (!jaAnexado) {
            await uploadArquivoStorage(amostra.id, CFG_RDA, arquivoBoletim, r.analise_id)
          }
          itensSalvos.push(`planilha "${arquivoBoletim.name}" anexada`)
        } catch (errAnexo) {
          avisoAnexo = ` (Aviso: o boletim e os dados foram salvos, mas o anexo .xlsx não pôde ser enviado ao Storage: ${mensagemErro(errAnexo)})`
        }
      }

      const amAtualizada = await buscarAmostraPorCodigo(amostra.codigo).catch(() => amostra)
      if (amAtualizada) setAmostra(amAtualizada)

      setUltimoSalvo({ amostraId: amostra.id, codigo: amostra.codigo, itens: itensSalvos })
      setMsg({
        tipo: 'sucesso',
        texto: `Todos os dados foram gravados no disco ${amostra.codigo}: TR = ${cient(resultado.taxa_reacao)} mol/(cm²·s)${f.serie.trim() ? `, série "${f.serie.trim()}"` : ''}.${avisoAnexo}`,
      })
      void carregarCatalogos()
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }) } finally { setOcupado(false) }
  }

  const podeGravar = !!entrada && !!resultado && !temErro(resultado.avisos) && !!amostra && !!idSistema && !!lerNumero(f.rotacao_rpm)
  const sistemaEscolhido = sistemas.find((s) => s.id_sistema === idSistema)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={arquivoRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const a = e.target.files?.[0]; if (a) void importar(a); e.target.value = '' }} />
        <Button variant="blue" icon={<Upload size={15} />} onClick={() => arquivoRef.current?.click()}>Importar boletim (.xlsx)</Button>
        <Button variant="secondary" icon={<FilePlus2 size={15} />} onClick={novoManual}>Novo boletim (manual)</Button>
        {boletim && <Badge variant="amber">importado: {boletim.codigo ?? 'sem código'}</Badge>}
        {arquivoBoletim && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-blue-200)] bg-[var(--color-blue-50)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--color-blue-800)]">
            <Paperclip size={12} /> {arquivoBoletim.name}
          </span>
        )}
      </div>

      {msg && <Alert tipo={msg.tipo} mensagem={msg.texto} onClose={() => setMsg(null)} />}
      {ultimoSalvo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-emerald-300 bg-emerald-50/80 px-4 py-3 text-[13px] text-emerald-950">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" />
            <div>
              <strong>Salvo na amostra {ultimoSalvo.codigo}:</strong> {ultimoSalvo.itens.join(' · ')}.
            </div>
          </div>
          <Button size="sm" variant="blue" icon={<ExternalLink size={14} />} onClick={() => navigate(`/amostras/${ultimoSalvo.amostraId}?aba=rda`)}>
            Abrir ficha da amostra
          </Button>
        </div>
      )}
      {boletim && boletim.problemas.length > 0 && (
        <Card titulo="O que o leitor do boletim encontrou"><ListaAvisos avisos={boletim.problemas} /></Card>
      )}

      {/* ------------------------------------------------------------ disco e sistema */}
      <Card titulo="Disco e sistema ácido" subtitulo="O disco é a amostra (formato disco). O sistema é procurado pela composição do fluido.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input label="Código do disco" value={f.codigo} onChange={set('codigo')} placeholder="RDA901" obrigatorio
            ajuda={procurando ? 'procurando…' : amostra ? `${amostra.litologia ?? ''} · ${amostra.projeto ?? ''}` : f.codigo ? 'não cadastrado' : undefined} />
          <Select label="Mineral" value={mineral} onChange={(e) => setMineral(e.target.value as Mineral)}>
            <option value="calcita">calcita (2 H⁺ por Ca)</option>
            <option value="dolomita">dolomita (Ca e Mg)</option>
          </Select>
          <div>
            <Select label="Sistema ácido" value={idSistema} onChange={(e) => setIdSistema(e.target.value)} obrigatorio>
              <option value="">— escolha —</option>
              {sistemas.map((s) => <option key={s.id_sistema} value={s.id_sistema}>{s.id_sistema} · {s.nome_sistema}</option>)}
            </Select>
            {!idSistema && sistemaSugerido && (
              <button type="button" className="mt-1 text-[12px] font-semibold text-[var(--color-blue)] hover:underline" onClick={() => void criarSistema()} disabled={ocupado}>
                + criar "{sistemaSugerido.nome_sistema}"
              </button>
            )}
          </div>
        </div>
        {f.codigo.trim() && !procurando && !amostra && (
          <div className="mt-4 rounded-[10px] border border-dashed border-[var(--color-orange)] p-4">
            <p className="m-0 mb-3 text-[13px] text-[var(--color-neutral-700)]">O disco <strong>{f.codigo.trim().toUpperCase()}</strong> não está no banco de amostras. Criar como disco (finalidade RDA)?</p>
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
              <Select label="Projeto" value={novoDisco.projeto_id} onChange={(e) => setNovoDisco((n) => ({ ...n, projeto_id: e.target.value }))}>
                <option value="">— escolha —</option>
                {projetos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
              </Select>
              <Select label="Litologia" value={novoDisco.litologia} onChange={(e) => setNovoDisco((n) => ({ ...n, litologia: e.target.value }))}>
                <option value="">— escolha —</option>
                {litologias.map((l) => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
              </Select>
              <Button variant="blue" icon={<Plus size={15} />} loading={ocupado} onClick={() => void criarDisco()}>Criar disco</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------ cabeçalho */}
      <Card titulo="Boletim" subtitulo="Condições do ensaio, disco, petrofísica, fluido e calibração da absorção atômica">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Input label="Estudo" value={f.estudo} onChange={set('estudo')} />
          <Input label="Operadores" value={f.operadores} onChange={set('operadores')} />
          <Input label="Início" type="date" value={f.data_inicio} onChange={set('data_inicio')} />
          <Input label="Fim" type="date" value={f.data_fim} onChange={set('data_fim')} />
          <Input label="Temperatura" unidade="°C" value={f.temperatura_c} onChange={set('temperatura_c')} />
          <Input label="Rotação" unidade="rpm" value={f.rotacao_rpm} onChange={set('rotacao_rpm')} obrigatorio />
          <Input label="Pressão" unidade="psi" value={f.pressao_psi} onChange={set('pressao_psi')} />
          <Input label="Volume de ácido" unidade="mL" value={f.volume_acido_ml} onChange={set('volume_acido_ml')} />
          <Input label="Série" value={f.serie} onChange={set('serie')} list="rda-series-sugestoes" placeholder="IL HAc 10% 45 °C" />
          <Input label="Diâmetro" unidade="cm" value={f.diametro_cm} onChange={set('diametro_cm')} obrigatorio />
          <Input label="Comprimento" unidade="cm" value={f.comprimento_cm} onChange={set('comprimento_cm')} />
          <Input label="Porosidade φ" unidade="%" value={f.porosidade_pct} onChange={set('porosidade_pct')} />
          <Input label="Permeabilidade K" unidade="mD" value={f.permeabilidade_md} onChange={set('permeabilidade_md')} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Massa antes" unidade="g" value={f.massa_antes_g} onChange={set('massa_antes_g')} />
            <Input label="Massa depois" unidade="g" value={f.massa_depois_g} onChange={set('massa_depois_g')} />
          </div>
          <Input label="Fluido" value={f.fluido} onChange={set('fluido')} placeholder="Ácido acético" />
          <Input label="Concentração" unidade="wt%" value={f.conc_wt_pct} onChange={set('conc_wt_pct')} />
          <Input label="Densidade ρ" unidade="g/mL" value={f.densidade_g_ml} onChange={set('densidade_g_ml')} />
          <Input label="Massa molar do fluido" unidade="g/mol" value={f.massa_molar_fluido} onChange={set('massa_molar_fluido')} />
          <Input label="C₀" unidade="mol/L" value={f.c0_manual} onChange={set('c0_manual')}
            placeholder={c0Calculado != null ? num(c0Calculado, 5) : ''} ajuda={c0Calculado != null && !f.c0_manual ? 'calculado: wt% / MM × 10 × ρ' : 'vazio = calcular de wt%, ρ e MM'} />
        </div>
        <datalist id="rda-series-sugestoes">{series.map((s) => <option key={s} value={s} />)}</datalist>

        <h3 className="mb-2 mt-6 text-[13px] font-bold text-[var(--color-blue-800)]">Calibração (Abs = k·[íon])</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Input label="Ca: inclinação k" unidade="L/mg" value={f.ca_k} onChange={set('ca_k')} obrigatorio />
          <Input label="Ca: fator de diluição" value={f.ca_dil} onChange={set('ca_dil')} obrigatorio ajuda="100, 25, 1… (não é volume)" />
          <Input label="Ca: massa molar" unidade="g/mol" value={f.ca_mm} onChange={set('ca_mm')} />
          <Input label="Ca: data da curva" type="date" value={f.ca_data} onChange={set('ca_data')} />
          {mineral === 'dolomita' && <>
            <Input label="Mg: inclinação k" unidade="L/mg" value={f.mg_k} onChange={set('mg_k')} />
            <Input label="Mg: fator de diluição" value={f.mg_dil} onChange={set('mg_dil')} />
            <Input label="Mg: massa molar" unidade="g/mol" value={f.mg_mm} onChange={set('mg_mm')} />
            <Input label="Mg: data da curva" type="date" value={f.mg_data} onChange={set('mg_data')} />
          </>}
        </div>
      </Card>

      {/* ------------------------------------------------------------ leituras */}
      <Card titulo="Leituras" subtitulo="Cada coleta: tempo e absorbância. A primeira leitura é o branco (Abs₀)."
        acoes={<>
          <Button size="sm" variant="secondary" icon={<ClipboardPaste size={14} />} onClick={() => setMostrarColar((v) => !v)}>Colar do Excel</Button>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setLinhas((l) => [...l, { rotulo: '', tempo: '', ca: '', mg: '' }])}>Linha</Button>
        </>}>
        {mostrarColar && (
          <div className="mb-4 space-y-2">
            <textarea className="input min-h-[110px] w-full font-mono text-[12px]" value={textoColar} onChange={(e) => setTextoColar(e.target.value)}
              placeholder={'Cole as colunas: [Amostra] | Tempo (s) | Abs Ca | Abs Mg\nT0\t0\t0,012\nT1\t180\t0,145'} />
            <Button size="sm" variant="blue" onClick={() => { const l = colar(textoColar); if (l.length) { setLinhas(l); setMostrarColar(false); setTextoColar('') } }}>Usar estas leituras</Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="table text-[13px]">
            <thead>
              <tr>
                <th>Amostra</th><th className="text-right">Tempo (s)</th><th className="text-right">Abs Ca</th>
                {mineral === 'dolomita' && <th className="text-right">Abs Mg</th>}
                <th className="text-right">[Ca] (mol/L)</th>{mineral === 'dolomita' && <th className="text-right">[Mg] (mol/L)</th>}
                <th className="text-right">[H⁺] (mol/L)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const p = resultado?.pontos.find((x) => x.tempo_s === lerNumero(l.tempo) && (x.rotulo ?? '') === (l.rotulo || ''))
                const muda = (k: keyof Linha) => (e: React.ChangeEvent<HTMLInputElement>) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                return (
                  <tr key={i} className={p && !p.usado ? 'text-[var(--color-neutral-500)]' : ''}>
                    <td><input className="input !py-1 w-20" value={l.rotulo} onChange={muda('rotulo')} /></td>
                    <td className="text-right"><input className="input !py-1 w-24 text-right" value={l.tempo} onChange={muda('tempo')} /></td>
                    <td className="text-right"><input className="input !py-1 w-24 text-right" value={l.ca} onChange={muda('ca')} /></td>
                    {mineral === 'dolomita' && <td className="text-right"><input className="input !py-1 w-24 text-right" value={l.mg} onChange={muda('mg')} /></td>}
                    <td className="text-right font-mono">{num(p?.ca_mol_l, 6)}</td>
                    {mineral === 'dolomita' && <td className="text-right font-mono">{num(p?.mg_mol_l, 6)}</td>}
                    <td className="text-right font-mono">{num(mineral === 'dolomita' ? p?.h_so_ca_mol_l : p?.h_mol_l, 5)}{p && !p.usado ? ' (fora)' : ''}</td>
                    <td><button type="button" className="btn-icone" title="Remover" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------ prévia */}
      <Card titulo="Prévia do resultado e Gráfico Padrão Origin" subtitulo="TR = 2 × (− inclinação de [H⁺] × tempo) / área corrigida · exporte em PNG 300 dpi, SVG, PDF ou CSV"
        acoes={<div className="w-44"><Input label="Janela até" unidade="s" value={f.janela_s} onChange={set('janela_s')} placeholder="todas" /></div>}>
        {!resultado ? (
          <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Falta: {faltando.join(', ')}.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {mineral === 'dolomita' ? <>
                <CartaoNumero rotulo="TR só Ca (principal)" valor={cient(resultado.taxa_so_ca)} detalhe="mol/(cm²·s), 4 H⁺ por Ca" destaque />
                <CartaoNumero rotulo="TR Ca + Mg" valor={cient(resultado.taxa_ca_mg)} detalhe="mol/(cm²·s)" />
              </> : <CartaoNumero rotulo="TR" valor={cient(resultado.taxa_reacao)} detalhe="mol/(cm²·s)" destaque />}
              <CartaoNumero rotulo="R² [H⁺] × t" valor={num(resultado.r2_h, 4)} detalhe={`${resultado.n_pontos} pontos`} />
              <CartaoNumero rotulo="Área corrigida" valor={num(resultado.area_corrigida_cm2, 4)} detalhe={`cm² (sem correção: ${num(resultado.area_cm2, 4)})`} />
              <CartaoNumero rotulo="Perda de massa" valor={resultado.perda_massa_pct != null ? `${num(resultado.perda_massa_pct, 2)} %` : '—'} />
              <CartaoNumero rotulo="C₀" valor={num(entrada!.c0_mol_l, 5)} detalhe="mol/L" />
              <CartaoNumero rotulo="Balanço de H⁺ (conferência)" valor={cient(resultado.taxa_balanco_h)} detalhe="|d[H⁺]/dt|·V / área (mol/cm²·s)" />
            </div>
            {conferencia.length > 0 && (
              <div className="rounded-[10px] border border-[var(--color-neutral-300)] p-3 text-[13px]">
                <strong className="text-[var(--color-blue-800)]">Conferência com a planilha</strong>
                <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
                  {conferencia.map((c) => (
                    <li key={c.rot} className={c.difere ? 'font-semibold text-[var(--color-red-700)]' : ''}>
                      {c.rot}: planilha {Math.abs(c.planilha) < 0.01 ? cient(c.planilha) : num(c.planilha, 5)} · sistema {Math.abs(c.sistema) < 0.01 ? cient(c.sistema) : num(c.sistema, 5)}
                      {c.difere ? ` (diferem ${num((100 * Math.abs(c.sistema - c.planilha)) / Math.abs(c.planilha), 2)} %)` : ' ✓'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ListaAvisos avisos={resultado.avisos} />
            {grafico && (
              <GraficoHTempo
                usados={grafico.usados}
                fora={grafico.fora}
                pontosCompletos={grafico.pontosCompletos}
                reta={grafico.reta}
                rotuloY={mineral === 'dolomita' ? '[H⁺] só Ca (mol/L)' : '[H⁺] (mol/L)'}
                c0MolL={entrada?.c0_mol_l ?? null}
                taxaReacao={resultado.taxa_reacao}
                r2={resultado.r2_h}
                codigoAmostra={f.codigo.trim().toUpperCase() || null}
                sistemaAcido={sistemaEscolhido ? `${sistemaEscolhido.id_sistema} (${sistemaEscolhido.nome_sistema})` : f.fluido || null}
                rotacaoRpm={lerNumero(f.rotacao_rpm)}
                temperaturaC={lerNumero(f.temperatura_c)}
                mineral={mineral}
              />
            )}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------ salvar todos os dados na amostra */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[var(--color-neutral-300)] bg-white px-5 py-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-[var(--color-neutral-800)]">
          <input
            type="checkbox"
            checked={salvarTudoNaAmostra}
            onChange={(e) => setSalvarTudoNaAmostra(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-blue)]"
          />
          <span>
            <strong>Salvar todos os dados na amostra:</strong> grava o ensaio RDA completo, todas as leituras AA, curvas numéricas ([H⁺], [Ca²⁺]{mineral === 'dolomita' ? ', [Mg²⁺]' : ''}), atualiza dimensões e massa inicial no cadastro do disco, sincroniza petrofísica (φ, K e massas antes/depois){arquivoBoletim ? ` e anexa a planilha "${arquivoBoletim.name}"` : ''}.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          {!podeGravar && (
            <span className="text-[12px] text-[var(--color-neutral-600)]">
              {!amostra ? 'Falta o disco cadastrado. ' : ''}{!idSistema ? 'Falta o sistema ácido. ' : ''}{!lerNumero(f.rotacao_rpm) ? 'Falta a rotação. ' : ''}
              {resultado && temErro(resultado.avisos) ? 'O cálculo tem erro. ' : ''}
            </span>
          )}
          <Button icon={<Save size={15} />} loading={ocupado} disabled={!podeGravar} onClick={() => void gravar()}>
            Salvar todos os dados{amostra ? ` em ${amostra.codigo}` : ''}{sistemaEscolhido ? ` · ${sistemaEscolhido.id_sistema}` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** C₀ que a planilha trouxe difere do recalculado por wt%, ρ e MM? (então o campo manual guarda o do boletim) */
function c0DoBoletimDiferente(b: BoletimLido) {
  const c = b.entrada?.c0_mol_l
  if (c == null || b.conc_wt_pct == null || !b.massa_molar_fluido || !b.densidade_g_ml) return c != null
  return Math.abs(concentracaoInicialMolL(b.conc_wt_pct, b.massa_molar_fluido, b.densidade_g_ml) - c) / c > 1e-9
}
