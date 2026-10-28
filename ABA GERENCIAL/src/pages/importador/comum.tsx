import React, { useState, type DragEvent } from 'react'
import { AlertTriangle, Download, Upload, Wand2, XCircle } from 'lucide-react'
import { encontrarBlocos, type PlanilhaBruta } from '../../importador/planilhaAmostras'
import type { Problema, Severidade } from '../../importador/planilhaBdd'
import { mensagemErro } from '../../utils/formatacao'

// Peças comuns aos três importadores (planilha de reatividade, controle de amostras e base de PVbt).

export type TipoImportacao = 'reatividade' | 'amostras' | 'pvbt'
export const ROTULO_TIPO: Record<TipoImportacao, string> = {
  reatividade: 'Planilha de reatividade (literatura)',
  amostras: 'Controle de amostras',
  pvbt: 'Base de PVbt',
}

export type Filtro = Severidade | 'TODOS'
export const LINHAS_PREVIA = 15

export interface PropsImportador {
  /** arquivo já escolhido no outro tipo (a pessoa aceitou a sugestão de trocar) */
  arquivoInicial: File | null
  aoTrocarTipo: (tipo: TipoImportacao, arquivo: File) => void
  /** true enquanto grava: a página trava a troca de tipo */
  aoOcupado: (ocupado: boolean) => void
}

/** Arquivo que parece ser de outro tipo de planilha (vira a sugestão de trocar). */
export interface OutroTipo { arquivo: File; tipo: TipoImportacao }

/**
 * Tipo de planilha sugerido pelo conteúdo: abas "experimento" e "amostras" (base de PVbt), abas
 * da BDD de reatividade, ou alguma aba com a coluna "Código" (controle de amostras).
 * null = não deu para saber.
 */
export function detectarTipo(bruta: PlanilhaBruta): TipoImportacao | null {
  const abas = Object.keys(bruta).map((a) => a.trim().toLowerCase())
  if ((abas.includes('experimento') || abas.includes('experimentos')) && abas.includes('amostras')) return 'pvbt'
  if (abas.includes('ensaios') && (abas.includes('rochas') || abas.includes('sistemas_acidos'))) return 'reatividade'
  return encontrarBlocos(bruta).length > 0 ? 'amostras' : null
}

/** Erro da gravação em português e dizendo o que fazer (a gravação é tabela a tabela, na ordem). */
export function explicarFalha(e: unknown, primeiraTabela: string): string {
  const msg = mensagemErro(e)
  const tabela = /Falha ao gravar (\w+)/.exec(msg)?.[1]
  const retomar = ' As tabelas já concluídas na lista abaixo ficaram gravadas; ao gravar de novo elas são só atualizadas.'
  if (/editor ou administrador|editor do projeto|row-level security/i.test(msg)) {
    return `Sem permissão para gravar${tabela ? ` em ${tabela}` : ''}: seu usuário precisa ser editor ou administrador. ` +
      'Peça o acesso ao administrador do LC PETRO (Administração › Acessos) e grave de novo.' + (tabela === primeiraTabela ? ' Nada foi gravado.' : retomar)
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return `Sem conexão com o Supabase${tabela ? ` ao gravar ${tabela}` : ''}. Confira a internet e clique em "Gravar no banco" de novo.` + retomar
  }
  return msg + (tabela ? retomar : '')
}

/** Área de soltar/escolher o arquivo .xlsx. */
export const AreaArquivo: React.FC<{ dica: React.ReactNode; aoEscolher: (arquivo?: File | null) => void; desabilitado?: boolean }> = ({ dica, aoEscolher, desabilitado }) => {
  const [arrastando, setArrastando] = useState(false)
  if (desabilitado) return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)] px-6 py-12 text-center opacity-60"
      aria-disabled="true">
      <Upload size={28} className="text-[var(--color-neutral-500)]" />
      <p className="m-0 font-semibold text-[var(--color-neutral-600)]">Envio de arquivo indisponível</p>
      <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">{dica}</p>
    </div>
  )
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e: DragEvent) => { e.preventDefault(); setArrastando(false); aoEscolher(e.dataTransfer.files?.[0]) }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-12 text-center transition-colors ${arrastando
        ? 'border-[var(--color-orange)] bg-[var(--color-orange-50)]'
        : 'border-[var(--color-blue-200)] bg-[var(--color-blue-50)] hover:border-[var(--color-blue)]'}`}
    >
      <Upload size={28} className="text-[var(--color-blue)]" />
      <p className="m-0 font-semibold text-[var(--color-blue-800)]">Arraste a planilha aqui ou clique para escolher</p>
      <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">{dica}</p>
      <span className="btn btn-blue mt-2">Escolher arquivo</span>
      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { aoEscolher(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
}

/** "Este arquivo parece ser do outro tipo": a pessoa troca ou continua assim mesmo. */
export const SugestaoTipo: React.FC<{ arquivo: string; sugerido: TipoImportacao; aoTrocar: () => void; aoContinuar: () => void }> = (p) => (
  <div className="aviso aviso-info flex flex-wrap items-center gap-3" role="status">
    <span className="flex-1 min-w-[260px]">
      Pelas abas e colunas, <strong>{p.arquivo}</strong> parece ser de outro tipo: <strong>{ROTULO_TIPO[p.sugerido]}</strong>.
    </span>
    <button type="button" className="btn btn-blue" onClick={p.aoTrocar}>Usar “{ROTULO_TIPO[p.sugerido]}”</button>
    <button type="button" className="btn btn-secondary" onClick={p.aoContinuar}>Continuar assim mesmo</button>
  </div>
)

const ICONE: Record<Severidade, typeof XCircle> = { ERRO: XCircle, AVISO: AlertTriangle, CORRIGIDO: Wand2 }
const CLASSE: Record<Severidade, string> = { ERRO: 'tag tag-accent', AVISO: 'tag tag-orange', CORRIGIDO: 'tag tag-blue' }
const TEXTO_CONTADOR: Record<Severidade, string> = {
  ERRO: 'erros · bloqueiam', AVISO: 'avisos · conferir', CORRIGIDO: 'corrigidos · padronizados',
}
const COR_CONTADOR: Record<Severidade, string> = {
  ERRO: 'var(--color-red)', AVISO: 'var(--color-orange-700)', CORRIGIDO: 'var(--color-blue)',
}

function Contador(p: { sev: Severidade; n: number; ativo: boolean; aoClicar: () => void }) {
  const Icone = ICONE[p.sev]
  return (
    <button type="button" onClick={p.aoClicar} aria-pressed={p.ativo}
      className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] cursor-pointer transition-colors ${p.ativo
        ? 'border-current bg-white shadow-sm' : 'border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-neutral-400)]'}`}
      style={{ color: COR_CONTADOR[p.sev] }}>
      <Icone size={15} />
      <strong className="font-heading text-[16px]">{p.n}</strong>
      <span className="text-[var(--color-neutral-700)]">{TEXTO_CONTADOR[p.sev]}</span>
    </button>
  )
}

/** Contadores de erros/avisos/corrigidos, filtro, relatório .csv e a lista dos problemas. */
export const PainelProblemas: React.FC<{
  problemas: Problema[]
  erros: number
  avisos: number
  corrigidos: number
  filtro: Filtro
  aoFiltrar: (f: Filtro) => void
  nomeArquivo: string
}> = ({ problemas, erros, avisos, corrigidos, filtro, aoFiltrar, nomeArquivo }) => {
  const visiveis = problemas.filter((p) => filtro === 'TODOS' || p.severidade === filtro)
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-6 py-4">
        <Contador sev="ERRO" n={erros} ativo={filtro === 'ERRO'} aoClicar={() => aoFiltrar('ERRO')} />
        <Contador sev="AVISO" n={avisos} ativo={filtro === 'AVISO'} aoClicar={() => aoFiltrar('AVISO')} />
        <Contador sev="CORRIGIDO" n={corrigidos} ativo={filtro === 'CORRIGIDO'} aoClicar={() => aoFiltrar('CORRIGIDO')} />
        <button type="button" className={`btn ${filtro === 'TODOS' ? 'btn-blue' : 'btn-secondary'}`} onClick={() => aoFiltrar('TODOS')}>
          Todos
        </button>
        <button type="button" className="btn btn-secondary ml-auto" onClick={() => baixarRelatorio(problemas, nomeArquivo)}>
          <Download size={14} /> Relatório (.csv)
        </button>
      </div>

      {visiveis.length > 0 ? (
        <div className="max-h-[320px] overflow-auto border-t border-[var(--color-neutral-300)] px-6">
          <table className="table text-[13px]">
            <thead className="sticky top-0 bg-white">
              <tr><th>Tipo</th><th>Aba</th><th>Linha</th><th>ID</th><th>Campo</th><th>O que aconteceu</th></tr>
            </thead>
            <tbody>
              {visiveis.map((p, i) => (
                <tr key={i} className="lcp-row">
                  <td className="!py-2"><span className={CLASSE[p.severidade]}>{p.severidade.toLowerCase()}</span></td>
                  <td className="!py-2">{p.aba}</td>
                  <td className="!py-2 tabular-nums">{p.linha ?? '—'}</td>
                  <td className="!py-2 font-semibold">{p.id ?? '—'}</td>
                  <td className="!py-2 font-mono text-[12px]">{p.campo}</td>
                  <td className="!py-2">{p.mensagem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 border-t border-[var(--color-neutral-300)] px-6 py-4 text-[13px] text-[var(--color-neutral-600)]">
          {problemas.length === 0 ? 'Nenhum problema encontrado na planilha.' : 'Nada nesta categoria.'}
        </p>
      )}
    </>
  )
}

/** Barras de progresso da gravação, uma por tabela. */
export const BarrasProgresso: React.FC<{ progresso: Record<string, [number, number]> }> = ({ progresso }) => {
  if (Object.keys(progresso).length === 0) return null
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
      {Object.entries(progresso).map(([tabela, [feitas, total]]) => (
        <div key={tabela} className="flex items-center gap-3 text-[13px]">
          <span className="w-[130px] font-mono text-[12px]">{tabela}</span>
          <div className="h-[8px] flex-1 rounded-full bg-[var(--color-neutral-200)]"
            role="progressbar" aria-label={`Gravação de ${tabela}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitas}>
            <div className="h-full rounded-full bg-[var(--color-blue)] transition-all" style={{ width: `${total ? (100 * feitas) / total : 100}%` }} />
          </div>
          <span className="w-[70px] text-right tabular-nums">{feitas}/{total}</span>
        </div>
      ))}
    </div>
  )
}

/** Relatório completo (todos os problemas, não só os filtrados) em CSV com ; para abrir direto no Excel. */
function baixarRelatorio(problemas: Problema[], nome: string) {
  const esc = (v: unknown) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`)
  const csv = ['severidade;aba;linha;id;campo;mensagem',
    ...problemas.map((p) => [p.severidade, p.aba, p.linha, p.id, p.campo, p.mensagem].map(esc).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const el = document.createElement('a')
  el.href = url
  el.download = `relatorio_${nome.replace(/\.[^.]+$/, '')}.csv`
  el.click()
  URL.revokeObjectURL(url)
}
