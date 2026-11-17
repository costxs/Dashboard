import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, GitCompareArrows, Loader2, RotateCcw } from 'lucide-react'
import { Alert, Card } from '../../components/UI'
import { confirmar } from '../../components/Confirmar'
import { lerArquivo, lerArquivoBruto } from '../../importador/lerArquivo'
import {
  ABAS_OBRIGATORIAS, analisarBdd, conferirBddNoBanco, gravarBdd, type Analise, type ConferenciaTabela, type DadosBdd,
} from '../../importador/planilhaBdd'
import { supabase } from '../../lib/supabase'
import { explicarErro020, MSG_MIGRACAO_020, migracao020Aplicada } from '../../literatura/reatividade/servico'
import { fmt, fmtExato, mensagemErro } from '../../utils/formatacao'
import {
  AreaArquivo, BarrasProgresso, detectarTipo, explicarFalha, LINHAS_PREVIA, PainelProblemas, SugestaoTipo,
  type Filtro, type OutroTipo, type PropsImportador,
} from './comum'

// Importador da planilha BDD_LCPETRO_Reatividade (literatura geral), em 4 passos:
// 1) arquivo  2) prévia (o que vai para cada tabela + erros/avisos/corrigidos)
// 3) comparar com o banco (novos / alterados campo a campo / iguais / só no banco)  4) gravar, com confirmação.
// Reimportar é seguro: mesmo código = atualiza; nada é apagado. Lógica em src/importador/planilhaBdd.ts (v2).
const DESTINOS: { chave: keyof DadosBdd; rotulo: string; aba: string }[] = [
  { chave: 'publicacoes', rotulo: 'Publicações', aba: 'referencias' },
  { chave: 'fluidos_prop', rotulo: 'Fluidos', aba: 'fluidos_prop' },
  { chave: 'litologias', rotulo: 'Litologias', aba: 'listas / rochas' },
  { chave: 'lit_listas', rotulo: 'Listas (métodos)', aba: 'listas' },
  { chave: 'lit_rochas', rotulo: 'Rochas', aba: 'rochas' },
  { chave: 'sistemas_acidos', rotulo: 'Sistemas ácidos', aba: 'sistemas_acidos' },
  { chave: 'lit_dados_rda', rotulo: 'Medidas de taxa (RDA)', aba: 'ensaios' },
  { chave: 'lit_qualidade', rotulo: 'Anotações de qualidade', aba: 'qualidade' },
  { chave: 'analise_rda', rotulo: 'Ensaios RDA do LC PETRO', aba: 'ensaios › ficha da amostra' },
]
const ROTULO_TABELA = Object.fromEntries(DESTINOS.map((d) => [d.chave, d.rotulo])) as Record<string, string>
const ABAS_OPCIONAIS = ['rochas', 'sistemas_acidos', 'referencias', 'fluidos_prop', 'listas', 'qualidade']

type Etapa = 'escolher' | 'analisando' | 'previa' | 'gravando' | 'concluido'
type Resultado = Awaited<ReturnType<typeof gravarBdd>>

const mostrar = (v: unknown) => (v == null || v === '' ? '(vazio)' : typeof v === 'number' ? fmtExato(v) : String(v))

export const ImportadorReatividade: React.FC<PropsImportador> = ({ arquivoInicial, aoTrocarTipo, aoOcupado }) => {
  const [etapa, setEtapa] = useState<Etapa>('escolher')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('ERRO')
  const [progresso, setProgresso] = useState<Record<string, [number, number]>>({})
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [outroTipo, setOutroTipo] = useState<OutroTipo | null>(null)
  // passo 3: comparação com o banco (obrigatória antes de gravar)
  const [conferencia, setConferencia] = useState<ConferenciaTabela[] | null>(null)
  const [comparando, setComparando] = useState(false)
  const [erroComparacao, setErroComparacao] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)

  async function comparar(a: Analise) {
    setComparando(true)
    setErroComparacao(null)
    setConferencia(null)
    try {
      if (!(await migracao020Aplicada())) throw new Error(MSG_MIGRACAO_020)
      setConferencia(await conferirBddNoBanco(supabase, a))
    } catch (e) {
      setErroComparacao(explicarErro020(e))
    } finally {
      setComparando(false)
    }
  }

  async function carregar(arquivo?: File | null, conferirTipo = true) {
    if (!arquivo) return
    setErro(null)
    setResultado(null)
    setProgresso({})
    setOutroTipo(null)
    setConferencia(null)
    setErroComparacao(null)
    if (!/\.xlsx?$/i.test(arquivo.name)) {
      setErro(`"${arquivo.name}" não é uma planilha do Excel. Escolha o arquivo BDD_LCPETRO_Reatividade no formato .xlsx.`)
      return
    }
    setNomeArquivo(arquivo.name)
    setEtapa('analisando')
    try {
      const buffer = await arquivo.arrayBuffer()
      const sugerido = conferirTipo ? detectarTipo(await lerArquivoBruto(buffer)) : null
      if (sugerido && sugerido !== 'reatividade') {
        setOutroTipo({ arquivo, tipo: sugerido })
        setEtapa('escolher')
        return
      }
      const a = analisarBdd(await lerArquivo(buffer))
      setAnalise(a)
      setFiltro(a.erros ? 'ERRO' : a.avisos ? 'AVISO' : 'TODOS')
      setEtapa('previa')
      if (a.abasFaltando.length === 0) void comparar(a)
    } catch (e) {
      setErro(`Não consegui ler "${arquivo.name}": ${mensagemErro(e)}. ` +
        'Confira se o arquivo é um .xlsx válido, sem senha, e se não está aberto com alterações por salvar; depois escolha de novo.')
      setAnalise(null)
      setEtapa('escolher')
    }
  }

  // arquivo que veio do outro tipo: a pessoa já escolheu este tipo, não sugerir de volta
  useEffect(() => {
    if (arquivoInicial) carregar(arquivoInicial, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivoInicial])

  // linhas da planilha com ERRO (ficam de fora quando grava "pulando")
  const linhasComErroTotal = useMemo(
    () => new Set((analise?.problemas ?? []).filter((p) => p.severidade === 'ERRO' && p.linha != null).map((p) => `${p.aba}:${p.linha}`)).size,
    [analise])
  const linhasComErro = useMemo(
    () => new Set((analise?.problemas ?? []).filter((p) => p.severidade === 'ERRO' && p.aba === 'ensaios').map((p) => p.linha)),
    [analise])

  async function gravar() {
    if (!analise || !conferencia) return
    const novos = conferencia.reduce((s, t) => s + t.novos.length, 0)
    const alterados = conferencia.reduce((s, t) => s + t.alterados.length, 0)
    const sim = await confirmar(
      `Gravar a planilha "${nomeArquivo}" no banco?\n\n${novos} registro(s) novo(s) e ${alterados} alterado(s). Nada é apagado.` +
      (analise.erros > 0 ? `\n\n${linhasComErroTotal} linha(s) com erro ficam de fora.` : ''),
      { titulo: 'Gravar no banco', textoSim: 'Gravar' })
    if (!sim) return
    setErro(null)
    setProgresso(Object.fromEntries(DESTINOS.map((d) => [d.chave, [0, analise.contagens[d.chave]] as [number, number]])))
    setEtapa('gravando')
    aoOcupado(true)
    try {
      const r = await gravarBdd(supabase, analise, {
        pularErros: analise.erros > 0,
        aoProgresso: (tabela, feitas, total) => setProgresso((p) => ({ ...p, [tabela]: [feitas, total] })),
      })
      setResultado(r)
      setEtapa('concluido')
    } catch (e) {
      const msg = mensagemErro(e)
      setErro(/schema cache|does not exist|não existe/i.test(msg) ? `${MSG_MIGRACAO_020} (${msg})`
        : /editor ou administrador|row-level security/i.test(msg) ? `Só editor ou administrador grava. ${explicarFalha(e, 'publicacoes')}`
          : explicarFalha(e, 'publicacoes'))
      setEtapa('previa')
    } finally {
      aoOcupado(false)
    }
  }

  function recomecar() {
    setEtapa('escolher')
    setAnalise(null)
    setResultado(null)
    setProgresso({})
    setErro(null)
    setNomeArquivo('')
    setConferencia(null)
    setErroComparacao(null)
  }

  const medidas = analise?.dados.lit_dados_rda ?? []
  const laboratorio = analise?.dados.analise_rda ?? []
  const semAbas = (analise?.abasFaltando.length ?? 0) > 0

  return (
    <>
      {/* 1. arquivo */}
      <Card
        titulo="1. Arquivo"
        icone={<FileSpreadsheet size={18} />}
        acoes={etapa !== 'escolher' && (
          <button type="button" className="btn btn-secondary" onClick={recomecar} disabled={etapa === 'gravando'}>
            <RotateCcw size={14} /> Trocar arquivo
          </button>
        )}
      >
        {etapa === 'escolher' ? (
          <AreaArquivo
            aoEscolher={carregar}
            dica={<>Abas obrigatórias: {ABAS_OBRIGATORIAS.join(', ')} · opcionais: {ABAS_OPCIONAIS.join(', ')}<br />
              Ensaios do LC PETRO: na aba ensaios, preencha a coluna <strong>amostra</strong> (código, ex.: IL076); opcionais: serie, data_ensaio, responsavel.</>}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <FileSpreadsheet size={20} className="text-[var(--color-blue)]" />
            <strong>{nomeArquivo}</strong>
            {etapa === 'analisando' && (
              <span className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
                <Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> lendo e conferindo…
              </span>
            )}
            {analise && (
              <div className="flex flex-wrap gap-1.5" title="Abas encontradas no arquivo">
                {analise.abasEncontradas.map((a) => <span key={a} className="tag tag-neutral">{a}</span>)}
              </div>
            )}
          </div>
        )}
      </Card>

      {outroTipo && (
        <SugestaoTipo arquivo={outroTipo.arquivo.name} sugerido={outroTipo.tipo}
          aoTrocar={() => aoTrocarTipo(outroTipo.tipo, outroTipo.arquivo)} aoContinuar={() => carregar(outroTipo.arquivo, false)} />
      )}

      {erro && !analise && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}

      {analise && semAbas && (
        <Alert
          tipo="erro"
          mensagem={`Este arquivo não parece ser a planilha BDD_LCPETRO_Reatividade: ${analise.abasFaltando.length > 1 ? 'faltam as abas obrigatórias' : 'falta a aba obrigatória'} `
            + `${analise.abasFaltando.map((a) => `"${a}"`).join(', ')}. `
            + 'Confira o nome das abas no Excel (sem acento, como na aba LEIA-ME) e escolha o arquivo de novo.'}
        />
      )}

      {analise && etapa !== 'escolher' && etapa !== 'analisando' && (
        <>
          {/* 2. prévia */}
          <div className="cartao">
            <div className="cartao-topo">
              <div>
                <h2>2. Prévia: o que vai para o banco</h2>
                <p>Linhas lidas em cada aba e a tabela de destino. Nada foi gravado ainda.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-[var(--color-neutral-300)] bg-[var(--color-neutral-300)] md:grid-cols-3 xl:grid-cols-5">
              {DESTINOS.map((d) => (
                <div key={d.chave} className={`p-5 ${d.chave === 'analise_rda' ? 'bg-[var(--color-orange-50)]' : 'bg-white'}`}>
                  <p className="rotulo m-0">{d.rotulo}</p>
                  <p className="numero mt-2 text-[28px] leading-none">{analise.contagens[d.chave]}</p>
                  <p className="mt-1.5 text-[11px] text-[var(--color-neutral-500)]">aba {d.aba}</p>
                </div>
              ))}
            </div>
            <p className="m-0 border-b border-[var(--color-neutral-300)] px-6 py-3 text-[12px] text-[var(--color-neutral-600)]">
              Linhas da aba ensaios com a coluna <strong>amostra</strong> preenchida (ou com referência do LC PETRO) são ensaios do laboratório:
              vão para a ficha da amostra › 5. RDA, não para a literatura.
            </p>

            <PainelProblemas problemas={analise.problemas} erros={analise.erros} avisos={analise.avisos} corrigidos={analise.corrigidos}
              filtro={filtro} aoFiltrar={setFiltro} nomeArquivo={nomeArquivo} filtrarPorAba rotuloId="Código" />

            {analise.colunasIgnoradas.length > 0 && (
              <p className="m-0 border-t border-[var(--color-neutral-300)] px-6 py-3 text-[12px] text-[var(--color-neutral-600)]">
                Colunas calculadas ignoradas (o banco recalcula): {analise.colunasIgnoradas.join(', ')}
              </p>
            )}
          </div>

          {/* prévia das medidas */}
          <Card
            titulo="Prévia das medidas"
            subtitulo={`Primeiras ${Math.min(LINHAS_PREVIA, medidas.length)} de ${medidas.length} linhas da aba ensaios · em vermelho, linhas com erro (não serão gravadas)`}
          >
            {medidas.length > 0 ? (
              <div className="overflow-x-auto -my-4">
                <table className="table text-[12px]">
                  <thead>
                    <tr>
                      <th>Linha</th><th>Ensaio</th><th>Referência</th><th>Rocha</th><th>Sistema</th>
                      <th className="text-right">T (°C)</th><th className="text-right">rpm</th>
                      <th className="text-right">Taxa (mol/cm²·s)</th><th>Obtenção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medidas.slice(0, LINHAS_PREVIA).map((d) => (
                      <tr key={d._linha} className={linhasComErro.has(d._linha) ? 'bg-[var(--color-red-50)] text-[var(--color-red-800)]' : 'lcp-row'}>
                        <td className="!py-2 tabular-nums">{d._linha}</td>
                        <td className="!py-2 font-semibold">{String(d.id_ensaio)}</td>
                        <td className="!py-2">{String(d.id_referencia ?? '—')}</td>
                        <td className="!py-2">{String(d.id_rocha ?? '—')}</td>
                        <td className="!py-2">{String(d.id_sistema ?? '—')}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.temperatura_c, 1)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.rotacao_rpm, 0)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.taxa_reacao_mol_cm2_s, 3, true)}</td>
                        <td className="!py-2">{String(d.obtencao_dado ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhuma medida lida na aba ensaios.</p>
            )}
          </Card>

          {/* ensaios do laboratório */}
          {laboratorio.length > 0 && (
            <Card titulo="Ensaios RDA do LC PETRO"
              subtitulo={`${laboratorio.length} linha(s) da aba ensaios que vão para a ficha da amostra (5. RDA), não para a literatura`}>
              <div className="-my-4 max-h-[320px] overflow-auto">
                <table className="table text-[12px]">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th>Linha</th><th>Ensaio</th><th>Amostra</th><th>Série</th><th>Sistema</th>
                      <th className="text-right">T (°C)</th><th className="text-right">rpm</th><th className="text-right">Taxa (mol/cm²·s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laboratorio.map((d) => (
                      <tr key={d._linha} className={linhasComErro.has(d._linha) ? 'bg-[var(--color-red-50)] text-[var(--color-red-800)]' : 'lcp-row'}>
                        <td className="!py-2 tabular-nums">{d._linha}</td>
                        <td className="!py-2 font-semibold">{String(d.id_ensaio_planilha)}</td>
                        <td className="!py-2 font-semibold text-[var(--color-red)]">{String(d._amostra ?? '—')}</td>
                        <td className="!py-2">{String(d.serie ?? '—')}</td>
                        <td className="!py-2">{String(d.id_sistema ?? '—')}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.temperatura_c, 1)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.rotacao_rpm, 0)}</td>
                        <td className="!py-2 text-right tabular-nums">{fmt(d.taxa_reacao_mol_cm2_s, 3, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 3. comparar com o banco */}
          <Card
            titulo="3. Comparar com o banco"
            subtitulo="O que é novo, o que muda campo a campo e o que fica igual. Só leitura: nada é gravado neste passo."
            icone={<GitCompareArrows size={18} />}
            acoes={!semAbas && etapa === 'previa' && (
              <button type="button" className="btn btn-secondary" onClick={() => comparar(analise)} disabled={comparando}>
                {comparando ? <><Loader2 size={14} className="animate-spin" /> Comparando…</> : conferencia ? 'Comparar de novo' : 'Comparar com o banco'}
              </button>
            )}
          >
            {semAbas ? (
              <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Falta aba obrigatória: escolha a planilha completa para comparar.</p>
            ) : comparando ? (
              <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
                <Loader2 size={14} className="animate-spin text-[var(--color-orange)]" /> lendo o que já está no banco…
              </p>
            ) : erroComparacao ? (
              <Alert tipo="erro" mensagem={erroComparacao} />
            ) : conferencia ? (
              <div className="-my-2 divide-y divide-[var(--color-neutral-200)]">
                {conferencia.map((t) => {
                  const abre = aberta === t.tabela
                  return (
                    <div key={t.tabela} className="py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                        <strong className="w-[190px] text-[var(--color-blue-800)]">{ROTULO_TABELA[t.tabela] ?? t.tabela}</strong>
                        <span><strong className="tabular-nums">{t.novos.length}</strong> novos</span>
                        <span>·</span>
                        {t.alterados.length > 0 ? (
                          <button type="button" className="flex items-center gap-1 font-semibold text-[var(--color-orange-700)] cursor-pointer hover:underline"
                            aria-expanded={abre} onClick={() => setAberta(abre ? null : t.tabela)}>
                            {abre ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span className="tabular-nums">{t.alterados.length}</span> alterados
                          </button>
                        ) : <span><strong className="tabular-nums">0</strong> alterados</span>}
                        <span>·</span>
                        <span><strong className="tabular-nums">{t.iguais}</strong> iguais</span>
                        <span>·</span>
                        <span className="text-[var(--color-neutral-600)]" title={t.soNoBanco.slice(0, 40).join(', ')}>
                          <strong className="tabular-nums">{t.soNoBanco.length}</strong> só no banco (não serão apagados)
                        </span>
                      </div>
                      {!!t.semAmostra?.length && (
                        <p className="m-0 mt-2 text-[12px] text-[var(--color-orange-700)]">
                          {t.semAmostra.length} ensaio(s) com amostra que não está no banco (ou que você não vê) ficam de fora:{' '}
                          {t.semAmostra.slice(0, 12).join(', ')}{t.semAmostra.length > 12 ? '…' : ''}. Cadastre a amostra em Amostras e ensaios e importe de novo.
                        </p>
                      )}
                      {abre && (
                        <div className="mt-3 max-h-[280px] overflow-auto rounded-[10px] border border-[var(--color-neutral-300)]">
                          <table className="table text-[12px]">
                            <thead className="sticky top-0 bg-white"><tr><th>Código</th><th>Campo</th><th>No banco (antes)</th><th>Na planilha (depois)</th></tr></thead>
                            <tbody>
                              {t.alterados.flatMap((a) => a.campos.map((c) => (
                                <tr key={`${a.id}|${c.campo}`} className="lcp-row">
                                  <td className="!py-2 font-semibold whitespace-nowrap">{a.id}</td>
                                  <td className="!py-2 font-mono text-[11px]">{c.campo}</td>
                                  <td className="!py-2 text-[var(--color-neutral-600)]">{mostrar(c.banco)}</td>
                                  <td className="!py-2 font-semibold text-[var(--color-blue-800)]">{mostrar(c.planilha)}</td>
                                </tr>
                              )))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
                <p className="m-0 pt-3 text-[12px] text-[var(--color-neutral-600)]">
                  Listas de métodos e anotações de qualidade só acrescentam: o que já existe no banco não é alterado.
                </p>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Compare com o banco para liberar a gravação.</p>
            )}
          </Card>

          {/* 4. gravar */}
          <Card titulo="4. Gravar no banco" subtitulo="Linhas com o mesmo código são atualizadas, não duplicadas. Nada é apagado.">
            <div className="flex flex-col gap-4">
              <BarrasProgresso progresso={Object.fromEntries(Object.entries(progresso).map(([t, v]) => [ROTULO_TABELA[t] ?? t, v]))} />

              {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}

              {resultado ? (
                <div className="aviso aviso-ok" role="status">
                  <p className="m-0 flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Importação concluída.</p>
                  <p className="m-0 mt-1">
                    {Object.entries(resultado.gravadas).map(([t, n]) => `${ROTULO_TABELA[t] ?? t}: ${n}`).join(' · ')}
                  </p>
                  {resultado.deixadasDeFora > 0 && (
                    <p className="m-0 mt-1">{resultado.deixadasDeFora} medida(s) ficaram de fora por erro: corrija na planilha e importe de novo.</p>
                  )}
                  {resultado.laboratorioDeFora > 0 && (
                    <p className="m-0 mt-1">
                      {resultado.laboratorioDeFora} ensaio(s) do LC PETRO ficaram de fora
                      {resultado.laboratorioSemAmostra.length > 0 && <> ({resultado.laboratorioSemAmostra.length} sem a amostra no banco: {resultado.laboratorioSemAmostra.slice(0, 8).join(', ')}{resultado.laboratorioSemAmostra.length > 8 ? '…' : ''})</>}.
                    </p>
                  )}
                  {(resultado.gravadas.analise_rda ?? 0) > 0 && (
                    <p className="m-0 mt-1">{resultado.gravadas.analise_rda} ensaio(s) do LC PETRO já estão na ficha de cada amostra › 5. RDA.</p>
                  )}
                  <Link to="/publicacoes?aba=geral&ver=conferencia" className="btn btn-blue mt-3">Ver pendências</Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary" onClick={gravar}
                    disabled={etapa === 'gravando' || semAbas || !conferencia}>
                    {etapa === 'gravando' ? <><Loader2 size={14} className="animate-spin" /> Gravando…</>
                      : analise.erros > 0 ? `Gravar pulando ${linhasComErroTotal} linha(s) com erro` : 'Gravar no banco'}
                  </button>
                  {semAbas ? (
                    <span className="text-[12px] text-[var(--color-red-700)]">Falta aba obrigatória: escolha a planilha completa para gravar.</span>
                  ) : !conferencia ? (
                    <span className="text-[12px] text-[var(--color-neutral-600)]">Faça o passo 3 (comparar com o banco) para liberar a gravação.</span>
                  ) : analise.erros > 0 && (
                    <span className="text-[12px] text-[var(--color-red-700)]">
                      Há {analise.erros} erro(s): as linhas com erro não são gravadas. Corrija-as na planilha e importe de novo depois.
                    </span>
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
