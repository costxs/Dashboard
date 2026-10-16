import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Columns3, ExternalLink, FileSpreadsheet, FlaskConical, Loader2, RotateCcw, Search } from 'lucide-react'
import { Alert, Card, Input, Select } from '../../components/UI'
import { usePapeis } from '../../hooks/usePapel'
import { lerArquivoBruto } from '../../importador/lerArquivo'
import {
  analisarAmostras, conferirNoBanco, DESTINOS, encontrarBlocos, gravarAmostras,
  type AmostraImportada, type AnaliseAmostras, type BlocoAmostras, type Destino, type ResultadoAmostras, type TipoBloco,
} from '../../importador/planilhaAmostras'
import { supabase } from '../../lib/supabase'
import { listarLitologias, listarProjetos } from '../../servicos/api'
import { useContexto } from '../../store/useContexto'
import type { Projeto, TipoOrigem } from '../../tipos/banco'
import { fmt, fmtData, mensagemErro } from '../../utils/formatacao'
import { classeStatus, rotuloStatus } from '../../utils/status'
import {
  AreaArquivo, BarrasProgresso, detectarTipo, LINHAS_PREVIA, PainelProblemas, SugestaoTipo,
  type Filtro, type OutroTipo, type PropsImportador,
} from './comum'

// Importador da planilha de CONTROLE DE ROCHAS (amostras do laboratório): abas de coreflooding e de RDA.
// 1) projeto de destino e arquivo  2) tipo de cada aba e mapeamento das colunas (já sugeridos; a pessoa confere)
// 3) prévia com erros e avisos  4) só grava quando a pessoa confirma.
// As regras estão em src/importador/planilhaAmostras.ts (cópia de docs/referencia/importador).
const URL_DASHBOARD = import.meta.env.VITE_URL_DASHBOARD as string | undefined
const ROTULO_TIPO_BLOCO: Record<TipoBloco, string> = { coreflooding: 'Coreflooding (plugs)', rda: 'RDA (discos)' }
const TEM_DATA = /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/

type Etapa = 'escolher' | 'lendo' | 'mapear' | 'analisando' | 'previa' | 'gravando' | 'concluido'

const letraColuna = (i: number): string => (i >= 26 ? letraColuna(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))

function exemplo(b: BlocoAmostras, coluna: number): string {
  const bruto = b.linhas.map((l) => l.valores[coluna]).find((x) => x != null && String(x).trim() !== '')
  if (bruto == null) return '—'
  const v = typeof bruto === 'number' ? fmt(bruto, 4) : String(bruto).trim()
  return v.length > 42 ? `${v.slice(0, 40)}…` : v
}

/** Erros que não são de uma amostra (projeto, origem, mapeamento, linha sem código): impedem a gravação. */
const errosGerais = (a: AnaliseAmostras) => a.problemas.filter((p) => p.severidade === 'ERRO' && !p.id)

export const ImportadorAmostras: React.FC<PropsImportador> = ({ arquivoInicial, aoTrocarTipo, aoOcupado }) => {
  const empresaId = useContexto((s) => s.empresaId)
  const projetoContexto = useContexto((s) => s.projetoId)

  const [projetos, setProjetos] = useState<Projeto[] | null>(null)
  const [projetoId, setProjetoId] = useState('')
  const [tipoOrigem, setTipoOrigem] = useState<TipoOrigem>('afloramento')
  const [confData, setConfData] = useState('')
  const [confResponsaveis, setConfResponsaveis] = useState('')

  const [etapa, setEtapa] = useState<Etapa>('escolher')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [abas, setAbas] = useState<string[]>([])
  const [blocos, setBlocos] = useState<BlocoAmostras[]>([])
  const [analise, setAnalise] = useState<AnaliseAmostras | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('ERRO')
  const [pularErros, setPularErros] = useState(false)
  const [progresso, setProgresso] = useState<Record<string, [number, number]>>({})
  const [resultado, setResultado] = useState<ResultadoAmostras | null>(null)
  const [outroTipo, setOutroTipo] = useState<OutroTipo | null>(null)

  // projetos de destino: só os que o usuário pode editar
  useEffect(() => {
    let vivo = true
    listarProjetos(empresaId)
      .then((p) => { if (vivo) setProjetos(p) })
      .catch((e) => { if (vivo) { setProjetos([]); setErro(`Não consegui carregar os projetos: ${mensagemErro(e)}`) } })
    return () => { vivo = false }
  }, [empresaId])
  const papeis = usePapeis(useMemo(() => (projetos ?? []).map((p) => p.id), [projetos]))
  const editaveis = useMemo(() => (projetos ?? []).filter((p) => papeis[p.id] === 'editor'), [projetos, papeis])
  const papeisProntos = projetos != null && projetos.every((p) => p.id in papeis)
  useEffect(() => {
    if (projetoId || editaveis.length === 0) return
    const padrao = editaveis.find((p) => p.id === projetoContexto) ?? (editaveis.length === 1 ? editaveis[0] : null)
    if (padrao) setProjetoId(padrao.id)
  }, [editaveis, projetoContexto, projetoId])

  const ocupado = etapa === 'gravando' || etapa === 'analisando'

  /** Mudou projeto, origem, tipo ou mapeamento: a prévia anterior não vale mais. */
  function invalidar() {
    setAnalise(null)
    setResultado(null)
    setProgresso({})
    setErro(null)
    setPularErros(false)
    setEtapa((e) => (e === 'previa' || e === 'concluido' ? 'mapear' : e))
  }

  async function carregar(arquivo?: File | null, conferirTipo = true) {
    if (!arquivo) return
    setErro(null)
    setOutroTipo(null)
    setAnalise(null)
    setResultado(null)
    setProgresso({})
    if (!/\.xlsx?$/i.test(arquivo.name)) {
      setErro(`"${arquivo.name}" não é uma planilha do Excel. Escolha a planilha de controle de amostras no formato .xlsx.`)
      return
    }
    setNomeArquivo(arquivo.name)
    setEtapa('lendo')
    try {
      const bruta = await lerArquivoBruto(arquivo)
      const sugerido = conferirTipo ? detectarTipo(bruta) : null
      if (sugerido && sugerido !== 'amostras') {
        setOutroTipo({ arquivo, tipo: sugerido })
        setEtapa('escolher')
        return
      }
      const lidos = encontrarBlocos(bruta)
      if (lidos.length === 0) {
        setErro(`Não achei nenhuma tabela de amostras em "${arquivo.name}": nenhuma aba tem uma linha de cabeçalho com a coluna "Código". ` +
          'Confira se é a planilha de controle de rochas e se o título da coluna do código é "Código".')
        setEtapa('escolher')
        return
      }
      setAbas(Object.keys(bruta))
      setBlocos(lidos)
      setEtapa('mapear')
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

  function alterarBloco(indice: number, troca: Partial<BlocoAmostras>) {
    setBlocos((bs) => bs.map((b, i) => (i === indice ? { ...b, ...troca } : b)))
    invalidar()
  }

  // coluna "Conferência" sem data no título (aba de RDA): a data e os nomes são pedidos na tela
  const conferenciaSemData = blocos.some((b) => b.mapeamento.some((d, i) => d === 'conferencia' && !TEM_DATA.test(b.colunas[i])))

  /** Analisa e confere com o banco (só leitura: catálogo de litologias e códigos que já existem). */
  async function analisar() {
    setErro(null)
    setEtapa('analisando')
    try {
      const litologias = await listarLitologias()
      const a = await conferirNoBanco(supabase, analisarAmostras(blocos, {
        projetoId, tipoOrigem,
        litologiasExistentes: litologias.map((l) => l.nome),
        conferenciaPadrao: conferenciaSemData
          ? { data: confData || undefined, responsaveis: confResponsaveis.trim() || undefined }
          : undefined,
      }))
      setAnalise(a)
      setFiltro(a.erros ? 'ERRO' : a.avisos ? 'AVISO' : 'TODOS')
      setEtapa('previa')
    } catch (e) {
      setErro(`Não consegui conferir a planilha com o banco: ${mensagemErro(e)}. Confira a internet e clique em "Analisar" de novo.`)
      setEtapa('mapear')
    }
  }

  async function gravar() {
    if (!analise) return
    setErro(null)
    setProgresso({})
    setEtapa('gravando')
    aoOcupado(true)
    try {
      const r = await gravarAmostras(supabase, analise, {
        pularErros,
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
    invalidar()
    setEtapa('escolher')
    setBlocos([])
    setNomeArquivo('')
  }

  // resumo do que vai entrar: as amostras com erro ficam de fora
  const resumo = useMemo(() => {
    if (!analise) return null
    const fora = new Set(analise.codigosComErro)
    const existentes = new Set(analise.existentes ?? [])
    const entram = analise.amostras.filter((x) => !fora.has(x.codigo) && x.litologia)
    const litologias = new Set(entram.map((x) => x.litologia))
    const petro = analise.petrofisicas.filter((p) => !fora.has(p.codigo))
    return {
      fora, existentes,
      contagens: [
        { rotulo: 'Amostras novas', n: entram.filter((x) => !existentes.has(x.codigo)).length, destino: 'amostras' },
        { rotulo: 'Já existentes', n: entram.filter((x) => existentes.has(x.codigo)).length, destino: 'serão atualizadas' },
        { rotulo: 'Petrofísica antes', n: petro.filter((p) => p.momento === 'antes').length, destino: 'analise_petrofisica' },
        { rotulo: 'Petrofísica depois', n: petro.filter((p) => p.momento === 'depois').length, destino: 'após a acidificação' },
        { rotulo: 'Conferências', n: analise.conferencias.filter((c) => !fora.has(c.codigo)).length, destino: 'conferencias' },
        { rotulo: 'Litologias novas', n: analise.litologiasNovas.filter((n) => litologias.has(n)).length, destino: 'litologias' },
      ],
    }
  }, [analise])
  const gerais = analise ? errosGerais(analise) : []

  const nomeProjeto = (p: Projeto) => `${p.codigo} · ${p.nome}`
  const projeto = editaveis.find((p) => p.id === projetoId)
  const lendo = etapa === 'lendo'
  const temArquivo = etapa !== 'escolher' && !lendo

  return (
    <>
      {/* 1. projeto de destino e arquivo */}
      <Card
        titulo="1. Projeto de destino e arquivo"
        icone={<FileSpreadsheet size={18} />}
        acoes={etapa !== 'escolher' && (
          <button type="button" className="btn btn-secondary" onClick={recomecar} disabled={ocupado}>
            <RotateCcw size={14} /> Trocar arquivo
          </button>
        )}
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Projeto de destino" obrigatorio value={projetoId} disabled={ocupado}
              onChange={(e) => { setProjetoId(e.target.value); invalidar() }}>
              <option value="">{papeisProntos ? 'Escolha o projeto…' : 'Carregando projetos…'}</option>
              {editaveis.map((p) => <option key={p.id} value={p.id}>{nomeProjeto(p)}</option>)}
            </Select>
            <Select label="Origem das amostras" value={tipoOrigem} disabled={ocupado}
              onChange={(e) => { setTipoOrigem(e.target.value as TipoOrigem); invalidar() }}>
              <option value="afloramento">Afloramento</option>
              <option value="testemunho">Testemunho (de poço)</option>
            </Select>
          </div>
          {tipoOrigem === 'testemunho' && (
            <Alert tipo="erro" mensagem="Testemunho exige o poço e a planilha de controle não tem essa coluna, então a importação é recusada. Importe como afloramento e complete a origem e o poço no cadastro de cada amostra." />
          )}
          {papeisProntos && editaveis.length === 0 && (
            <Alert tipo="erro" mensagem="Seu usuário não é editor de nenhum projeto desta empresa, então não há onde gravar as amostras. Peça o acesso de editor em Administração › Acessos." />
          )}

          {etapa === 'escolher' ? (
            <AreaArquivo aoEscolher={carregar}
              dica={<>Planilha de controle de rochas (.xlsx): uma aba de coreflooding e uma de RDA · o cabeçalho de cada aba precisa da coluna “Código”</>} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <FileSpreadsheet size={20} className="text-[var(--color-blue)]" />
              <strong>{nomeArquivo}</strong>
              {lendo ? (
                <span className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
                  <Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> lendo…
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5" title="Abas encontradas no arquivo">
                  {abas.map((a) => <span key={a} className="tag tag-neutral">{a}</span>)}
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

      {/* 2. tipo e mapeamento de colunas: um cartão por aba */}
      {temArquivo && blocos.map((b, indice) => (
        <div key={`${b.aba}:${b.linhaCabecalho}`} className="cartao">
          <div className="cartao-topo">
            <div className="flex items-center gap-3">
              <span className="text-[var(--color-blue)]"><Columns3 size={18} /></span>
              <div>
                <h2>2. Mapeamento de colunas · aba {b.aba}</h2>
                <p>
                  {b.linhas.length} linha(s) · cabeçalho na linha {b.linhaCabecalho}. O destino de cada coluna já vem sugerido pelo título: confira e corrija se precisar.
                </p>
              </div>
            </div>
            <div className="w-[220px] shrink-0">
              <Select label="Tipo reconhecido" value={b.tipo} disabled={ocupado}
                onChange={(e) => alterarBloco(indice, { tipo: e.target.value as TipoBloco })}>
                {(Object.keys(ROTULO_TIPO_BLOCO) as TipoBloco[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO_BLOCO[t]}</option>)}
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto px-6 pb-2">
            <table className="table text-[13px]">
              <thead>
                <tr><th className="w-[50px]">Col.</th><th>Coluna da planilha</th><th>Exemplo</th><th className="w-[400px]">Destino</th></tr>
              </thead>
              <tbody>
                {b.colunas.map((titulo, i) => (
                  <tr key={i} className="lcp-row">
                    <td className="!py-1.5 tabular-nums text-[var(--color-neutral-500)]">{letraColuna(i)}</td>
                    <td className="!py-1.5 font-semibold">{titulo || <span className="font-normal text-[var(--color-neutral-500)]">(sem título)</span>}</td>
                    <td className="!py-1.5 text-[var(--color-neutral-600)]">{exemplo(b, i)}</td>
                    <td className="!py-1.5">
                      <select className={`input !min-h-0 !py-1.5 text-[13px] ${b.mapeamento[i] === 'ignorar' ? '!text-[var(--color-neutral-500)]' : ''}`}
                        aria-label={`Destino da coluna ${titulo || letraColuna(i)}`} value={b.mapeamento[i]} disabled={ocupado}
                        onChange={(e) => alterarBloco(indice, { mapeamento: b.mapeamento.map((d, j) => (j === i ? e.target.value as Destino : d)) })}>
                        {(Object.keys(DESTINOS) as Destino[]).map((d) => <option key={d} value={d}>{DESTINOS[d]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {temArquivo && (
        <Card titulo="Conferir com o banco" icone={<Search size={18} />}
          subtitulo="Só lê: confere a planilha com o catálogo de litologias e com as amostras que já existem. Nada é gravado.">
          <div className="flex flex-col gap-4">
            {conferenciaSemData && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Data da conferência" type="date" value={confData} disabled={ocupado}
                  ajuda="Há uma coluna Conferência sem data no título."
                  onChange={(e) => { setConfData(e.target.value); invalidar() }} />
                <div className="md:col-span-2">
                  <Input label="Responsáveis pela conferência" value={confResponsaveis} disabled={ocupado} placeholder="ex.: Heitor e Dulcidio"
                    ajuda="Sem a data, as conferências dessa coluna não são gravadas."
                    onChange={(e) => { setConfResponsaveis(e.target.value); invalidar() }} />
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-blue" onClick={analisar} disabled={ocupado || !projetoId}>
                {etapa === 'analisando'
                  ? <><Loader2 size={14} className="animate-spin" /> Analisando…</>
                  : <><Search size={14} /> {analise ? 'Analisar de novo' : 'Confirmar mapeamento e analisar'}</>}
              </button>
              {!projetoId && <span className="text-[12px] text-[var(--color-red-700)]">Escolha o projeto de destino no passo 1.</span>}
            </div>
          </div>
        </Card>
      )}

      {analise && resumo && (
        <>
          {/* 3. o que vai para o banco */}
          <div className="cartao">
            <div className="cartao-topo">
              <div>
                <h2>3. O que vai para o banco</h2>
                <p>
                  Projeto {projeto ? nomeProjeto(projeto) : '—'} · {analise.amostras.length} amostra(s) lida(s)
                  {resumo.fora.size > 0 && `, ${resumo.fora.size} com erro (fora da contagem abaixo)`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-[var(--color-neutral-300)]">
              {resumo.contagens.map((c) => (
                <div key={c.rotulo} className="p-5 border-r border-[var(--color-neutral-300)] last:border-r-0">
                  <p className="rotulo m-0">{c.rotulo}</p>
                  <p className="numero mt-2 text-[28px] leading-none">{c.n}</p>
                  <p className="mt-1.5 text-[11px] text-[var(--color-neutral-500)]">{c.destino}</p>
                </div>
              ))}
            </div>

            <PainelProblemas problemas={analise.problemas} erros={analise.erros} avisos={analise.avisos} corrigidos={analise.corrigidos}
              filtro={filtro} aoFiltrar={setFiltro} nomeArquivo={nomeArquivo} />

            {analise.colunasIgnoradas.length > 0 && (
              <p className="m-0 border-t border-[var(--color-neutral-300)] px-6 py-3 text-[12px] text-[var(--color-neutral-600)]">
                Colunas ignoradas (não vão para o banco): {analise.colunasIgnoradas.map((c) => `${c.coluna} (${c.aba})`).join(', ')}
              </p>
            )}
          </div>

          {/* prévia das amostras */}
          <Card
            titulo="Prévia das amostras"
            subtitulo={`Primeiras ${Math.min(LINHAS_PREVIA, analise.amostras.length)} de ${analise.amostras.length} amostras · em vermelho, linhas com erro (não serão gravadas)`}
          >
            {analise.amostras.length > 0 ? (
              <div className="overflow-x-auto -my-4">
                <table className="table text-[12px]">
                  <thead>
                    <tr>
                      <th>Aba</th><th>Linha</th><th>Código</th><th>Situação</th><th>Litologia</th><th>Finalidade</th><th>Status</th>
                      <th className="text-right">D × L (cm)</th><th className="text-right">Massa (g)</th>
                      <th className="text-right">Porosidade (%)</th><th>Petrofísica em</th><th>Conferência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.amostras.slice(0, LINHAS_PREVIA).map((x) => (
                      <LinhaPrevia key={`${x._aba}:${x._linha}`} x={x} analise={analise}
                        comErro={resumo.fora.has(x.codigo)} existente={resumo.existentes.has(x.codigo)} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhuma amostra lida: confira o mapeamento da coluna do código.</p>
            )}
          </Card>

          {/* sugestões de ensaio RDA: só informação */}
          {analise.sugestoesRda.length > 0 && (
            <Card titulo="Sugestões de ensaio RDA" icone={<FlaskConical size={18} />}
              subtitulo="O que o app entendeu do texto de Utilização. É só informação: nenhuma análise de RDA é criada; o texto vai para as observações da amostra.">
              <div className="overflow-x-auto -my-4">
                <table className="table text-[12px]">
                  <thead>
                    <tr>
                      <th>Código</th><th>Texto da planilha</th><th>Ensaio</th><th>Ácido</th>
                      <th className="text-right">Concentração</th><th className="text-right">T (°C)</th><th className="text-right">rpm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.sugestoesRda.map((s) => (
                      <tr key={`${s._aba}:${s._linha}`} className="lcp-row">
                        <td className="!py-2"><span className="codigo">{s.codigo}</span></td>
                        <td className="!py-2">{s.texto}</td>
                        <td className="!py-2">{s.ensaio ?? '—'}</td>
                        <td className="!py-2">{s.acido ?? '—'}</td>
                        <td className="!py-2 text-right tabular-nums">{s.concentracao != null ? `${fmt(s.concentracao, 3)} ${s.unidade ?? ''}` : '—'}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(s.temperatura_c, 1)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(s.rotacao_rpm, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 4. gravar */}
          <Card titulo="4. Gravar no banco"
            subtitulo="Amostra com o mesmo código é atualizada só nos campos preenchidos. Petrofísica e conferência com a mesma data não duplicam. Nada é apagado.">
            <div className="flex flex-col gap-4">
              {analise.erros > 0 && gerais.length === 0 && etapa !== 'concluido' && (
                <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={pularErros} disabled={etapa === 'gravando'}
                    onChange={(e) => setPularErros(e.target.checked)} />
                  <span>
                    Gravar o que está certo e <strong>deixar de fora as linhas com erro</strong> ({analise.erros} erro(s) em{' '}
                    {analise.codigosComErro.join(', ')}; corrija-as na planilha e importe de novo depois).
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
                      Há erro que impede a importação ({gerais[0].aba}{gerais[0].linha ? `, linha ${gerais[0].linha}` : ''}: {gerais[0].mensagem}). Corrija e analise de novo.
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

function LinhaPrevia({ x, analise, comErro, existente }: { x: AmostraImportada; analise: AnaliseAmostras; comErro: boolean; existente: boolean }) {
  const petro = analise.petrofisicas.filter((p) => p.codigo === x.codigo)
  const antes = petro.find((p) => p.momento === 'antes')
  const depois = petro.find((p) => p.momento === 'depois')
  const conferencias = analise.conferencias.filter((c) => c.codigo === x.codigo)
  return (
    <tr className={comErro ? 'bg-[var(--color-red-50)] text-[var(--color-red-800)]' : 'lcp-row'}>
      <td className="!py-2">{x._aba}</td>
      <td className="!py-2 tabular-nums">{x._linha}</td>
      <td className="!py-2"><span className="codigo">{x.codigo}</span></td>
      <td className="!py-2">
        {comErro ? <span className="tag tag-accent">com erro</span>
          : <span className={`tag ${existente ? 'tag-orange' : 'tag-blue'}`}>{existente ? 'atualiza' : 'nova'}</span>}
      </td>
      <td className="!py-2">{x.litologia || '—'}</td>
      <td className="!py-2">{x.finalidade}</td>
      <td className="!py-2">{x.status ? <span className={classeStatus(x.status)}>{rotuloStatus(x.status)}</span> : '—'}</td>
      <td className="!py-2 text-right tabular-nums">{fmt(x.diametro_cm)} × {fmt(x.comprimento_cm)}</td>
      <td className="!py-2 text-right tabular-nums">{fmt(x.massa_seca_g)}</td>
      <td className="!py-2 text-right tabular-nums">
        {fmt(antes?.porosidade_pct)}{depois?.porosidade_pct != null && ` → ${fmt(depois.porosidade_pct)}`}
      </td>
      <td className="!py-2 tabular-nums">{fmtData(antes?.data_ensaio)}</td>
      <td className="!py-2">{conferencias.map((c) => `${fmtData(c.data)}: ${c.resultado}`).join('; ') || '—'}</td>
    </tr>
  )
}

function ResumoFinal({ r }: { r: ResultadoAmostras }) {
  const linhas: [string, { inseridas: number; atualizadas: number }][] = [
    ['Amostras', r.amostras], ['Petrofísica', r.petrofisicas], ['Conferências', r.conferencias],
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="aviso aviso-ok" role="status">
        <p className="m-0 flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Importação concluída.</p>
        <ul className="m-0 mt-2 list-none p-0 leading-[1.7]">
          {linhas.map(([nome, n]) => (
            <li key={nome}><strong>{nome}:</strong> {n.inseridas} inserida(s) · {n.atualizadas} atualizada(s)</li>
          ))}
          <li><strong>Litologias novas:</strong> {r.litologias}</li>
          {r.deixadasDeFora.length > 0 && (
            <li><strong>Deixadas de fora por erro:</strong> {r.deixadasDeFora.join(', ')}</li>
          )}
        </ul>
        {URL_DASHBOARD && (
          <a className="btn btn-blue mt-3" href={`${URL_DASHBOARD.replace(/\/$/, '')}/amostras`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Ver no dashboard
          </a>
        )}
      </div>
      {r.recusadas.length > 0 && (
        <div className="aviso aviso-erro" role="alert">
          <p className="m-0 font-semibold">{r.recusadas.length} amostra(s) recusada(s) pelo banco (não foram gravadas):</p>
          <ul className="m-0 mt-1 pl-5">
            {r.recusadas.map((x) => <li key={x.codigo}><strong>{x.codigo}</strong>: {x.motivo}</li>)}
          </ul>
          <p className="m-0 mt-1">O código já existe em um projeto que você não vê. Confira o código com o administrador ou use outro.</p>
        </div>
      )}
    </div>
  )
}
