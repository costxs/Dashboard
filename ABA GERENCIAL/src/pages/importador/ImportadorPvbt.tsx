import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, FileSpreadsheet, Loader2, Lock, RotateCcw, Search } from 'lucide-react'
import { Alert, Card, Select } from '../../components/UI'
import { usePapeis } from '../../hooks/usePapel'
import { lerArquivoBruto } from '../../importador/lerArquivo'
import type { PlanilhaBruta } from '../../importador/planilhaAmostras'
import {
  ABAS_PVBT, analisarPvbt, conferirPvbtNoBanco, gravarPvbt,
  type AnalisePvbt, type Fonte, type OpcoesPvbt, type ResultadoPvbt,
} from '../../importador/planilhaPvbt'
import { supabase } from '../../lib/supabase'
import { listarEmpresas, listarLitologias, listarProjetos } from '../../servicos/api'
import { useContexto } from '../../store/useContexto'
import type { Empresa, Projeto } from '../../tipos/banco'
import { fmt, mensagemErro } from '../../utils/formatacao'
import {
  AreaArquivo, BarrasProgresso, detectarTipo, LINHAS_PREVIA, PainelProblemas, SugestaoTipo,
  type Filtro, type OutroTipo, type PropsImportador,
} from './comum'

// Importador da planilha "Banco de dados de PVbt — LCPETRO/UFPA" (três fontes de coreflooding).
// 1) empresa dos dados Petrobras, projeto das amostras LCPETRO novas e arquivo
// 2) o app LÊ, ANALISA e CONFERE com o banco (só leitura) e mostra a prévia por fonte
// 3) só grava quando a pessoa confirma (por id: reimportar atualiza, não duplica, não apaga).
// As regras estão em src/importador/planilhaPvbt.ts (cópia de docs/importador).
const URL_DASHBOARD = import.meta.env.VITE_URL_DASHBOARD as string | undefined
const FONTES: { fonte: Fonte; rotulo: string; classe: string }[] = [
  { fonte: 'LCPETRO', rotulo: 'LC PETRO', classe: 'tag tag-orange' },
  { fonte: 'Literatura', rotulo: 'Literatura', classe: 'tag tag-blue' },
  { fonte: 'Petrobras', rotulo: 'Petrobras', classe: 'tag tag-solid' },
]
const ROTULO_TABELA: Record<string, string> = {
  fluidos_prop: 'Fluidos', litologias: 'Litologias novas', publicacoes: 'Referências', sistemas_acidos: 'Sistemas ácidos',
  lit_amostras_pvbt: 'Amostras de literatura/Petrobras', lit_dados_pvbt: 'Ensaios de literatura/Petrobras',
  analise_coreflooding: 'Ensaios LC PETRO (coreflooding)',
}

type Etapa = 'escolher' | 'lendo' | 'analisando' | 'previa' | 'gravando' | 'concluido'
type Ensaio = AnalisePvbt['coreflooding'][number]

const fonteDe = (d: Ensaio): Fonte => (d.fonte as Fonte | undefined) ?? 'LCPETRO'
const amostraDe = (d: Ensaio) => (d.id_amostra ?? d._codigo) as string | null
const txt = (v: unknown) => (v == null || v === '' ? '—' : String(v))

/** Erros que não são de uma linha (aba faltando, empresa Petrobras, projeto): impedem a gravação. */
const errosGerais = (a: AnalisePvbt) => a.problemas.filter((p) => p.severidade === 'ERRO' && !p.id)

export const ImportadorPvbt: React.FC<PropsImportador> = ({ arquivoInicial, aoTrocarTipo, aoOcupado }) => {
  const projetoContexto = useContexto((s) => s.projetoId)

  const [empresas, setEmpresas] = useState<Empresa[] | null>(null)
  const [projetos, setProjetos] = useState<Projeto[] | null>(null)
  const [empresaPbId, setEmpresaPbId] = useState('')
  const [projetoId, setProjetoId] = useState('')

  const [etapa, setEtapa] = useState<Etapa>('escolher')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [bruta, setBruta] = useState<PlanilhaBruta | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [analise, setAnalise] = useState<AnalisePvbt | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('ERRO')
  const [pularErros, setPularErros] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const [progresso, setProgresso] = useState<Record<string, [number, number]>>({})
  const [resultado, setResultado] = useState<ResultadoPvbt | null>(null)
  const [outroTipo, setOutroTipo] = useState<OutroTipo | null>(null)

  // empresas que o usuário vê (padrão: a que tem Petrobras no nome) e projetos onde é editor
  useEffect(() => {
    let vivo = true
    listarEmpresas()
      .then((e) => {
        if (!vivo) return
        setEmpresas(e)
        const petrobras = e.find((x) => /petrobras/i.test(`${x.nome} ${x.sigla}`))
        if (petrobras) setEmpresaPbId((atual) => atual || petrobras.id)
      })
      .catch((e) => { if (vivo) { setEmpresas([]); setErro(`Não consegui carregar as empresas: ${mensagemErro(e)}`) } })
    listarProjetos()
      .then((p) => { if (vivo) setProjetos(p) })
      .catch((e) => { if (vivo) { setProjetos([]); setErro(`Não consegui carregar os projetos: ${mensagemErro(e)}`) } })
    return () => { vivo = false }
  }, [])
  const papeis = usePapeis(useMemo(() => (projetos ?? []).map((p) => p.id), [projetos]))
  const editaveis = useMemo(() => (projetos ?? []).filter((p) => papeis[p.id] === 'editor'), [projetos, papeis])
  const papeisProntos = projetos != null && projetos.every((p) => p.id in papeis)
  useEffect(() => {
    if (projetoId || editaveis.length === 0) return
    const padrao = editaveis.find((p) => p.id === projetoContexto) ?? (editaveis.length === 1 ? editaveis[0] : null)
    if (padrao) setProjetoId(padrao.id)
  }, [editaveis, projetoContexto, projetoId])
  const pronto = empresas != null && papeisProntos

  const siglaEmpresa = (id: string) => empresas?.find((e) => e.id === id)?.sigla
  const nomeProjeto = (p: Projeto) => [siglaEmpresa(p.empresa_id), p.codigo, p.nome].filter(Boolean).join(' · ')
  const empresaPb = empresas?.find((e) => e.id === empresaPbId)
  const projeto = editaveis.find((p) => p.id === projetoId)

  async function carregar(arquivo?: File | null, conferirTipo = true) {
    if (!arquivo) return
    setErro(null)
    setOutroTipo(null)
    setAnalise(null)
    setResultado(null)
    setProgresso({})
    if (!/\.xlsx?$/i.test(arquivo.name)) {
      setErro(`"${arquivo.name}" não é uma planilha do Excel. Escolha a planilha do banco de dados de PVbt no formato .xlsx.`)
      return
    }
    setNomeArquivo(arquivo.name)
    setEtapa('lendo')
    try {
      const lida = await lerArquivoBruto(arquivo)
      const sugerido = conferirTipo ? detectarTipo(lida) : null
      if (sugerido && sugerido !== 'pvbt') {
        setOutroTipo({ arquivo, tipo: sugerido })
        setEtapa('escolher')
        return
      }
      setBruta(lida)
      setEtapa('analisando')
    } catch (e) {
      setErro(`Não consegui ler "${arquivo.name}": ${mensagemErro(e)}. ` +
        'Confira se o arquivo é um .xlsx válido, sem senha, e se não está aberto com alterações por salvar; depois escolha de novo.')
      setEtapa('escolher')
    }
  }

  // arquivo que veio do outro tipo: a pessoa já escolheu este tipo, não sugerir de volta
  useEffect(() => {
    if (arquivoInicial) carregar(arquivoInicial, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivoInicial])

  // Analisa e confere com o banco (só leitura). Refaz sozinho quando muda a empresa ou o projeto:
  // a prévia anterior não vale mais.
  useEffect(() => {
    if (!bruta || !pronto) return
    let vivo = true
    setErro(null)
    setResultado(null)
    setProgresso({})
    setPularErros(false)
    setEtapa('analisando')
    ;(async () => {
      try {
        const litologias = await listarLitologias()
        const opcoes: OpcoesPvbt = {
          litologiasExistentes: litologias.map((l) => l.nome),
          empresaPetrobrasId: empresaPbId || null,
          projetoLcpetroId: projetoId || null,
        }
        const a = await conferirPvbtNoBanco(supabase, analisarPvbt(bruta, opcoes), opcoes)
        if (!vivo) return
        setAnalise(a)
        setFiltro(a.erros ? 'ERRO' : a.avisos ? 'AVISO' : 'TODOS')
        setEtapa('previa')
      } catch (e) {
        if (!vivo) return
        setAnalise(null)
        setErro(`Não consegui conferir a planilha com o banco: ${mensagemErro(e)}. Confira a internet e clique em "Conferir de novo".`)
        setEtapa('previa')
      }
    })()
    return () => { vivo = false }
  }, [bruta, pronto, empresaPbId, projetoId, tentativa])

  // o que vai entrar, por fonte: as linhas com erro ficam de fora
  const resumo = useMemo(() => {
    if (!analise) return null
    const fora = new Set(analise.idsComErro)
    const existentes = new Set(analise.amostrasLabExistentes ?? [])
    const ensaios = [...analise.coreflooding, ...analise.lit_dados_pvbt].sort((x, y) => x._linha - y._linha)
    const amostras = [...analise.amostrasLab, ...analise.lit_amostras_pvbt]
    const comErro = (ids: unknown[]) => ids.filter((id) => fora.has(id as string)).length
    const porFonte = FONTES.map((f) => {
      const ens = ensaios.filter((d) => fonteDe(d) === f.fonte).map((d) => d.id_experimento)
      const ams = amostras.filter((x) => x.fonte === f.fonte).map((x) => x.id_amostra)
      const refs = f.fonte === 'LCPETRO' ? null
        : analise.publicacoes.filter((p) => Boolean(p._sigilosa) === (f.fonte === 'Petrobras')).map((p) => p.id_referencia)
      return {
        ...f,
        ensaios: ens.length, ensaiosErro: comErro(ens),
        amostras: ams.length, amostrasErro: comErro(ams),
        referencias: refs?.length ?? null, referenciasErro: comErro(refs ?? []),
      }
    })
    const labNovas = analise.amostrasLab.filter((x) => !existentes.has(x.id_amostra as string) && !fora.has(x.id_amostra as string))
    return { fora, ensaios, porFonte, labNovas, labExistentes: existentes.size }
  }, [analise])
  const gerais = analise ? errosGerais(analise) : []
  const temPetrobras = Boolean(analise && (analise.contagens.amostras_petrobras + analise.contagens.ensaios_petrobras > 0
    || analise.publicacoes.some((p) => p._sigilosa)))

  async function gravar() {
    if (!analise || !resumo) return
    const nEnsaios = resumo.ensaios.filter((d) => !resumo.fora.has(d.id_experimento as string)).length
    const confirmacao = [
      `Gravar ${nEnsaios} ensaio(s) de "${nomeArquivo}" no banco?`,
      resumo.labNovas.length > 0 && projeto && `• ${resumo.labNovas.length} amostra(s) LCPETRO nova(s) serão criadas no projeto ${nomeProjeto(projeto)}.`,
      temPetrobras && empresaPb && `• Os dados Petrobras ficarão visíveis só para a empresa ${empresaPb.nome}.`,
      pularErros && resumo.fora.size > 0 && `• ${resumo.fora.size} id(s) com erro ficam de fora.`,
      'Linhas com o mesmo id são atualizadas. Nada é apagado.',
    ].filter(Boolean).join('\n')
    if (!confirm(confirmacao)) return
    setErro(null)
    setProgresso({})
    setEtapa('gravando')
    aoOcupado(true)
    try {
      const r = await gravarPvbt(supabase, analise, {
        pularErros,
        projetoLcpetroId: projetoId || null,
        aoProgresso: (tabela, feitas, total) => setProgresso((p) => ({ ...p, [tabela]: [feitas, total] })),
      })
      setResultado(r)
      setEtapa('concluido')
    } catch (e) {
      const msg = mensagemErro(e)
      setErro(/Failed to fetch|NetworkError|Load failed/i.test(msg)
        ? 'Sem conexão com o Supabase. Confira a internet e clique em "Gravar no banco" de novo: o que já entrou é só atualizado, nada duplica.'
        : `${msg} O que já foi gravado antes do erro continua no banco; ao gravar de novo é só atualizado, nada duplica.`)
      setEtapa('previa')
    } finally {
      aoOcupado(false)
    }
  }

  function recomecar() {
    setEtapa('escolher')
    setBruta(null)
    setAnalise(null)
    setResultado(null)
    setProgresso({})
    setErro(null)
    setNomeArquivo('')
    setVerTodos(false)
  }

  const travado = etapa === 'gravando' || etapa === 'concluido'
  const lendo = etapa === 'lendo' || etapa === 'analisando'
  const visiveis = resumo ? (verTodos ? resumo.ensaios : resumo.ensaios.slice(0, LINHAS_PREVIA)) : []

  return (
    <>
      {/* 1. destino dos dados e arquivo */}
      <Card
        titulo="1. Destino dos dados e arquivo"
        icone={<FileSpreadsheet size={18} />}
        acoes={etapa !== 'escolher' && (
          <div className="flex flex-wrap gap-2">
            {bruta && !travado && (
              <button type="button" className="btn btn-secondary" onClick={() => setTentativa((n) => n + 1)} disabled={lendo}>
                <Search size={14} /> Conferir de novo
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={recomecar} disabled={etapa === 'gravando'}>
              <RotateCcw size={14} /> Trocar arquivo
            </button>
          </div>
        )}
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Empresa dos dados Petrobras" value={empresaPbId} disabled={travado}
              onChange={(e) => setEmpresaPbId(e.target.value)}>
              <option value="">{empresas ? 'Escolha a empresa…' : 'Carregando empresas…'}</option>
              {(empresas ?? []).map((e) => <option key={e.id} value={e.id}>{e.sigla} · {e.nome}</option>)}
            </Select>
            <Select label="Projeto para amostras LCPETRO novas" value={projetoId} disabled={travado}
              onChange={(e) => setProjetoId(e.target.value)}>
              <option value="">{papeisProntos ? 'Nenhum (não criar amostras novas)' : 'Carregando projetos…'}</option>
              {editaveis.map((p) => <option key={p.id} value={p.id}>{nomeProjeto(p)}</option>)}
            </Select>
          </div>
          <p className="m-0 -mt-2 text-[12px] text-[var(--color-neutral-600)]">
            Linhas de fonte Petrobras são gravadas com a empresa escolhida e só quem tem acesso a ela as vê. Ensaios de fonte LCPETRO
            entram na ficha da amostra (aba 3. Coreflooding); a amostra que ainda não existe no Banco de Amostras é criada no projeto escolhido.
          </p>
          {papeisProntos && editaveis.length === 0 && (
            <Alert tipo="info" mensagem="Seu usuário não é editor de nenhum projeto: amostras LCPETRO novas não poderão ser criadas. Peça o acesso de editor em Administração › Acessos." />
          )}

          {etapa === 'escolher' ? (
            <AreaArquivo aoEscolher={carregar}
              dica={<>Banco de dados de PVbt (.xlsx) · abas obrigatórias: {ABAS_PVBT.join(', ')} · opcionais: qualidade, listas</>} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <FileSpreadsheet size={20} className="text-[var(--color-blue)]" />
              <strong>{nomeArquivo}</strong>
              {lendo ? (
                <span className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
                  <Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> {etapa === 'lendo' ? 'lendo…' : 'conferindo com o banco…'}
                </span>
              ) : bruta && (
                <div className="flex flex-wrap gap-1.5" title="Abas encontradas no arquivo">
                  {Object.keys(bruta).map((a) => <span key={a} className="tag tag-neutral">{a}</span>)}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {outroTipo && (
        <SugestaoTipo arquivo={outroTipo.arquivo.name} sugerido={outroTipo.tipo}
          aoTrocar={() => aoTrocarTipo(outroTipo.tipo, outroTipo.arquivo)} aoContinuar={() => carregar(outroTipo.arquivo, false)} />
      )}

      {erro && !analise && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}

      {analise && analise.abasFaltando.length > 0 && (
        <Alert
          tipo="erro"
          mensagem={`Este arquivo não parece ser a planilha do banco de dados de PVbt: ${analise.abasFaltando.length > 1 ? 'faltam as abas' : 'falta a aba'} `
            + `${analise.abasFaltando.map((a) => `"${a}"`).join(', ')}. `
            + 'Confira o nome das abas no Excel (sem acento, como na aba LEIA-ME) e escolha o arquivo de novo.'}
        />
      )}

      {analise && resumo && etapa !== 'escolher' && etapa !== 'lendo' && (
        <>
          {/* 2. o que vai para o banco */}
          <div className="cartao">
            <div className="cartao-topo">
              <div>
                <h2>2. O que vai para o banco</h2>
                <p>
                  {resumo.ensaios.length} ensaio(s) lido(s) na aba experimento
                  {resumo.fora.size > 0 && ` · ${resumo.fora.size} id(s) com erro (não serão gravados)`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 border-b border-[var(--color-neutral-300)]">
              {resumo.porFonte.map((f) => (
                <div key={f.fonte} className="p-5 border-r border-[var(--color-neutral-300)] last:border-r-0">
                  <p className="m-0 flex items-center gap-2">
                    <span className={f.classe}>{f.rotulo}</span>
                    {f.fonte === 'Petrobras' && <Lock size={13} className="text-[var(--color-neutral-600)]" aria-label="Restrito à empresa" />}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <Contagem rotulo="Ensaios" n={f.ensaios} comErro={f.ensaiosErro} />
                    <Contagem rotulo="Amostras" n={f.amostras} comErro={f.amostrasErro} />
                    <Contagem rotulo="Referências" n={f.referencias} comErro={f.referenciasErro} />
                  </div>
                  <p className="m-0 mt-3 text-[11px] text-[var(--color-neutral-500)]">
                    {f.fonte === 'LCPETRO'
                      ? `analise_coreflooding · ${resumo.labExistentes} amostra(s) já no Banco de Amostras, ${resumo.labNovas.length} a criar${projeto ? ` em ${projeto.codigo}` : ''}`
                      : f.fonte === 'Literatura' ? 'lit_amostras_pvbt + lit_dados_pvbt · visível a todos'
                      : `lit_amostras_pvbt + lit_dados_pvbt · só ${empresaPb?.nome ?? 'a empresa escolhida'}`}
                  </p>
                </div>
              ))}
            </div>

            <p className="m-0 border-b border-[var(--color-neutral-300)] px-6 py-3 text-[12px] text-[var(--color-neutral-600)]">
              Catálogos: {analise.contagens.sistemas_acidos} sistema(s) ácido(s) · {analise.contagens.fluidos_prop} fluido(s) · {analise.litologias.length} litologia(s) nova(s)
              {analise.litologias.length > 0 && ` (${analise.litologias.join(', ')})`}
            </p>

            {temPetrobras && (
              <div className="aviso aviso-info m-6 mb-0 flex items-start gap-2.5" role="status">
                <Lock size={16} className="mt-0.5 shrink-0" />
                <span>
                  {empresaPb
                    ? <>Os dados Petrobras ficarão visíveis só para a empresa <strong>{empresaPb.nome}</strong> (membros da empresa ou de um projeto dela, e administradores).</>
                    : <>Há dados de fonte Petrobras: escolha a <strong>empresa dos dados Petrobras</strong> no passo 1. Eles ficarão visíveis só para ela.</>}
                </span>
              </div>
            )}

            <PainelProblemas problemas={analise.problemas} erros={analise.erros} avisos={analise.avisos} corrigidos={analise.corrigidos}
              filtro={filtro} aoFiltrar={setFiltro} nomeArquivo={nomeArquivo} />

            {analise.colunasIgnoradas.length > 0 && (
              <p className="m-0 border-t border-[var(--color-neutral-300)] px-6 py-3 text-[12px] text-[var(--color-neutral-600)]">
                Colunas calculadas ignoradas (o banco recalcula na view v_pvbt): {analise.colunasIgnoradas.join(', ')}
              </p>
            )}
          </div>

          {/* prévia dos ensaios */}
          <Card
            titulo="Prévia dos ensaios"
            subtitulo={`${visiveis.length} de ${resumo.ensaios.length} linhas da aba experimento · em vermelho, linhas com erro (não serão gravadas)`}
            acoes={resumo.ensaios.length > LINHAS_PREVIA && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVerTodos((v) => !v)}>
                {verTodos ? `Só os primeiros ${LINHAS_PREVIA}` : `Ver todos (${resumo.ensaios.length})`}
              </button>
            )}
          >
            {resumo.ensaios.length > 0 ? (
              <div className="max-h-[520px] overflow-auto -my-4">
                <table className="table text-[12px]">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th>Linha</th><th>Ensaio</th><th>Fonte</th><th>Amostra</th><th>Referência</th><th>Sistema / ácido</th>
                      <th className="text-right">T (°C)</th><th className="text-right">Vazão (mL/min)</th>
                      <th className="text-right">PVbt</th><th>Condição</th><th>Obtenção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((d) => {
                      const f = FONTES.find((x) => x.fonte === fonteDe(d))!
                      const acido = [d.acido, d.conc_valor != null && `${fmt(d.conc_valor, 3)} ${d.conc_unidade ?? ''}`.trim()].filter(Boolean).join(' ')
                      return (
                        <tr key={d._linha} className={resumo.fora.has(d.id_experimento as string) ? 'bg-[var(--color-red-50)] text-[var(--color-red-800)]' : 'lcp-row'}>
                          <td className="!py-2 tabular-nums">{d._linha}</td>
                          <td className="!py-2 font-semibold">{txt(d.id_experimento)}</td>
                          <td className="!py-2"><span className={f.classe}>{f.rotulo}</span></td>
                          <td className="!py-2"><span className="codigo">{txt(amostraDe(d))}</span></td>
                          <td className="!py-2">{txt(d.id_referencia)}</td>
                          <td className="!py-2">{[d.id_sistema, acido].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="!py-2 text-right tabular-nums">{d.temperatura_c != null ? fmt(d.temperatura_c, 1) : txt(d.temperatura_obs)}</td>
                          <td className="!py-2 text-right tabular-nums">{fmt(d.vazao_ml_min, 3)}</td>
                          <td className="!py-2 text-right tabular-nums">{fmt(d.pvbt, 3)}</td>
                          <td className="!py-2">{txt(d.pvbt_condicao)}</td>
                          <td className="!py-2">{txt(d.obtencao_dado)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhum ensaio lido na aba experimento.</p>
            )}
          </Card>

          {/* 3. gravar */}
          <Card titulo="3. Gravar no banco"
            subtitulo="Linhas com o mesmo ID são atualizadas, não duplicadas. Amostra LCPETRO que já existe não é alterada. Nada é apagado.">
            <div className="flex flex-col gap-4">
              {analise.erros > 0 && gerais.length === 0 && etapa !== 'concluido' && (
                <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={pularErros} disabled={etapa === 'gravando'}
                    onChange={(e) => setPularErros(e.target.checked)} />
                  <span>
                    Gravar o que está certo e <strong>deixar de fora as linhas com erro</strong> ({analise.erros} erro(s) em{' '}
                    {analise.idsComErro.join(', ')}; corrija-as na planilha e importe de novo depois).
                  </span>
                </label>
              )}

              {etapa === 'gravando' && <BarrasProgresso progresso={progresso} />}

              {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}

              {resultado ? (
                <ResumoFinal r={resultado} />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary" onClick={gravar}
                    disabled={etapa !== 'previa' || (analise.erros > 0 && !pularErros) || gerais.length > 0}>
                    {etapa === 'gravando' ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : 'Gravar no banco'}
                  </button>
                  {gerais.length > 0 ? (
                    <span className="text-[12px] text-[var(--color-red-700)]">
                      Há erro que impede a importação ({gerais[0].mensagem}). Corrija no passo 1 ou na planilha.
                    </span>
                  ) : analise.erros > 0 && !pularErros && (
                    <span className="text-[12px] text-[var(--color-red-700)]">Há erros: corrija a planilha ou marque a opção acima.</span>
                  )}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  )
}

function Contagem({ rotulo, n, comErro }: { rotulo: string; n: number | null; comErro: number }) {
  return (
    <div>
      <p className="rotulo m-0">{rotulo}</p>
      <p className="numero mt-1.5 text-[26px] leading-none">{n ?? '—'}</p>
      {comErro > 0 && <p className="m-0 mt-1 text-[11px] text-[var(--color-red-700)]">{comErro} com erro</p>}
    </div>
  )
}

function ResumoFinal({ r }: { r: ResultadoPvbt }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="aviso aviso-ok" role="status">
        <p className="m-0 flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Importação concluída.</p>
        <ul className="m-0 mt-2 list-none p-0 leading-[1.7]">
          {Object.entries(r.gravadas).filter(([, n]) => n > 0).map(([tabela, n]) => (
            <li key={tabela}><strong>{ROTULO_TABELA[tabela] ?? tabela}:</strong> {n} gravada(s) <span className="font-mono text-[11px]">({tabela})</span></li>
          ))}
          <li><strong>Amostras LCPETRO criadas:</strong> {r.amostrasCriadas}</li>
          {r.deixadasDeFora.length > 0 && (
            <li><strong>Deixadas de fora por erro:</strong> {r.deixadasDeFora.join(', ')}</li>
          )}
        </ul>
        {URL_DASHBOARD && (
          <a className="btn btn-blue mt-3" href={`${URL_DASHBOARD.replace(/\/$/, '')}/analises`} target="_blank" rel="noreferrer"
            title="Análises / Resultados › 3. Coreflooding">
            <ExternalLink size={14} /> Ver no dashboard (Análises › 3. Coreflooding)
          </a>
        )}
      </div>
      {r.recusadas.length > 0 && (
        <div className="aviso aviso-erro" role="alert">
          <p className="m-0 font-semibold">{r.recusadas.length} linha(s) recusada(s) (não foram gravadas):</p>
          <ul className="m-0 mt-1 pl-5">
            {r.recusadas.map((x) => <li key={x.id}><strong>{x.id}</strong>: {x.motivo}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
