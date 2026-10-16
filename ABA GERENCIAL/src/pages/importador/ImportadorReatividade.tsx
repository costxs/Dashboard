import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, Loader2, RotateCcw } from 'lucide-react'
import { Alert, Card } from '../../components/UI'
import { lerArquivo, lerArquivoBruto } from '../../importador/lerArquivo'
import { ABAS_OBRIGATORIAS, analisarBdd, gravarBdd, type Analise } from '../../importador/planilhaBdd'
import { supabase } from '../../lib/supabase'
import { fmt, mensagemErro } from '../../utils/formatacao'
import {
  AreaArquivo, BarrasProgresso, detectarTipo, explicarFalha, LINHAS_PREVIA, PainelProblemas, SugestaoTipo,
  type Filtro, type OutroTipo, type PropsImportador,
} from './comum'

// Importador da planilha BDD_LCPETRO_Reatividade (literatura geral).
// 1) escolhe o arquivo  2) o app LÊ e ANALISA todas as abas e mostra a prévia
// 3) só grava quando a pessoa confirma (upsert por id: reimportar atualiza, não duplica, não apaga).
// Base: docs/referencia/painel-cadastro/src/pages/ImportadorPage.tsx (telas/painel_05_importador_previa.png)
const DESTINOS: { chave: keyof Analise['contagens']; rotulo: string; aba: string }[] = [
  { chave: 'publicacoes', rotulo: 'Referências', aba: 'referencias' },
  { chave: 'litologias', rotulo: 'Litologias', aba: 'listas / rochas' },
  { chave: 'lit_rochas', rotulo: 'Rochas', aba: 'rochas' },
  { chave: 'fluidos_prop', rotulo: 'Fluidos', aba: 'fluidos_prop' },
  { chave: 'sistemas_acidos', rotulo: 'Sistemas ácidos', aba: 'sistemas_acidos' },
  { chave: 'lit_dados_rda', rotulo: 'Medidas de taxa (RDA)', aba: 'ensaios' },
]
const ABAS_OPCIONAIS = ['referencias', 'fluidos_prop', 'listas']

type Etapa = 'escolher' | 'analisando' | 'previa' | 'gravando' | 'concluido'
type Resultado = Awaited<ReturnType<typeof gravarBdd>>

export const ImportadorReatividade: React.FC<PropsImportador> = ({ arquivoInicial, aoTrocarTipo, aoOcupado }) => {
  const [etapa, setEtapa] = useState<Etapa>('escolher')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('ERRO')
  const [pularErros, setPularErros] = useState(false)
  const [progresso, setProgresso] = useState<Record<string, [number, number]>>({})
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [outroTipo, setOutroTipo] = useState<OutroTipo | null>(null)

  async function carregar(arquivo?: File | null, conferirTipo = true) {
    if (!arquivo) return
    setErro(null)
    setResultado(null)
    setProgresso({})
    setPularErros(false)
    setOutroTipo(null)
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

  async function gravar() {
    if (!analise) return
    setErro(null)
    setProgresso({})
    setEtapa('gravando')
    aoOcupado(true)
    try {
      const r = await gravarBdd(supabase, analise, {
        pularErros,
        aoProgresso: (tabela, feitas, total) => setProgresso((p) => ({ ...p, [tabela]: [feitas, total] })),
      })
      setResultado(r)
      setEtapa('concluido')
    } catch (e) {
      setErro(explicarFalha(e, 'publicacoes'))
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
  }

  const linhasComErro = useMemo(
    () => new Set((analise?.problemas ?? []).filter((p) => p.severidade === 'ERRO' && p.aba === 'ensaios').map((p) => p.linha)),
    [analise])

  const medidas = analise?.dados.lit_dados_rda ?? []

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
            dica={<>Abas obrigatórias: {ABAS_OBRIGATORIAS.join(', ')} · opcionais: {ABAS_OPCIONAIS.join(', ')}</>}
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

      {analise && analise.abasFaltando.length > 0 && (
        <Alert
          tipo="erro"
          mensagem={`Este arquivo não parece ser a planilha BDD_LCPETRO_Reatividade: ${analise.abasFaltando.length > 1 ? 'faltam as abas obrigatórias' : 'falta a aba obrigatória'} `
            + `${analise.abasFaltando.map((a) => `"${a}"`).join(', ')}. `
            + 'Confira o nome das abas no Excel (sem acento, como na aba LEIA-ME) e escolha o arquivo de novo.'}
        />
      )}

      {analise && etapa !== 'escolher' && etapa !== 'analisando' && (
        <>
          {/* 2. o que vai para o banco */}
          <div className="cartao">
            <div className="cartao-topo">
              <div>
                <h2>2. O que vai para o banco</h2>
                <p>Linhas lidas em cada aba e a tabela de destino</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-[var(--color-neutral-300)]">
              {DESTINOS.map((d) => (
                <div key={d.chave} className="p-5 border-r border-[var(--color-neutral-300)] last:border-r-0">
                  <p className="rotulo m-0">{d.rotulo}</p>
                  <p className="numero mt-2 text-[28px] leading-none">{analise.contagens[d.chave]}</p>
                  <p className="mt-1.5 text-[11px] text-[var(--color-neutral-500)]">aba {d.aba}</p>
                </div>
              ))}
            </div>

            <PainelProblemas problemas={analise.problemas} erros={analise.erros} avisos={analise.avisos} corrigidos={analise.corrigidos}
              filtro={filtro} aoFiltrar={setFiltro} nomeArquivo={nomeArquivo} />

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

          {/* 3. gravar */}
          <Card titulo="3. Gravar no banco" subtitulo="Linhas com o mesmo ID são atualizadas, não duplicadas. Nada é apagado.">
            <div className="flex flex-col gap-4">
              {analise.erros > 0 && analise.abasFaltando.length === 0 && etapa !== 'concluido' && (
                <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={pularErros} disabled={etapa === 'gravando'}
                    onChange={(e) => setPularErros(e.target.checked)} />
                  <span>
                    Gravar o que está certo e <strong>deixar de fora as linhas com erro</strong> ({analise.erros} erro(s);
                    corrija-as na planilha e importe de novo depois).
                  </span>
                </label>
              )}

              <BarrasProgresso progresso={progresso} />

              {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}

              {resultado ? (
                <div className="aviso aviso-ok" role="status">
                  <p className="m-0 flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Importação concluída.</p>
                  <p className="m-0 mt-1">
                    {Object.entries(resultado.gravadas).map(([t, n]) => `${t}: ${n}`).join(' · ')}
                    {resultado.deixadasDeFora > 0 && ` · ${resultado.deixadasDeFora} medida(s) ficaram de fora por erro.`}
                    {' '}Os dados já aparecem no dashboard em Literatura › Geral.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary" onClick={gravar}
                    disabled={etapa === 'gravando' || (analise.erros > 0 && !pularErros) || analise.abasFaltando.length > 0}>
                    {etapa === 'gravando' ? <><Loader2 size={14} className="animate-spin" /> Gravando…</> : 'Gravar no banco'}
                  </button>
                  {analise.abasFaltando.length > 0 ? (
                    <span className="text-[12px] text-[var(--color-red-700)]">Falta aba obrigatória: escolha a planilha completa para gravar.</span>
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
