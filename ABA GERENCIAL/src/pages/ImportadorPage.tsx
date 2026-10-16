import React, { useState } from 'react'
import { BookOpen, Database, Droplets } from 'lucide-react'
import { CabecalhoPagina } from '../components/UI'
import { ImportadorAmostras } from './importador/ImportadorAmostras'
import { ImportadorPvbt } from './importador/ImportadorPvbt'
import { ImportadorReatividade } from './importador/ImportadorReatividade'
import { ROTULO_TIPO, type TipoImportacao } from './importador/comum'

// Importação de planilhas: a pessoa escolhe o tipo no topo e cada tipo tem o seu fluxo
// analisar -> prévia -> gravar. Nada é gravado sem confirmação.
const TIPOS: { tipo: TipoImportacao; icone: React.ReactNode; descricao: string; subtitulo: string }[] = [
  {
    tipo: 'reatividade',
    icone: <BookOpen size={18} />,
    descricao: 'BDD_LCPETRO_Reatividade: referências, rochas, sistemas ácidos e medidas de taxa da literatura.',
    subtitulo: 'Planilha BDD_LCPETRO_Reatividade (.xlsx). O app lê todas as abas, confere os dados e mostra uma prévia. Nada é gravado até você confirmar.',
  },
  {
    tipo: 'amostras',
    icone: <Database size={18} />,
    descricao: 'Controle de rochas do laboratório: amostras de coreflooding e de RDA, petrofísica e conferências.',
    subtitulo: 'Planilha de controle de rochas (.xlsx). Você confere o mapeamento das colunas, o app mostra uma prévia e nada é gravado até você confirmar.',
  },
  {
    tipo: 'pvbt',
    icone: <Droplets size={18} />,
    descricao: 'Banco de dados de PVbt: ensaios de coreflooding do LC PETRO, da literatura e da Petrobras (restritos à empresa).',
    subtitulo: 'Planilha "Banco de dados de PVbt — LCPETRO/UFPA" (.xlsx). O app lê as abas, confere com o banco e mostra uma prévia. Nada é gravado até você confirmar.',
  },
]

export const ImportadorPage: React.FC = () => {
  const [tipo, setTipo] = useState<TipoImportacao>('reatividade')
  // arquivo levado de um tipo para o outro quando a pessoa aceita a sugestão
  const [arquivoInicial, setArquivoInicial] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)

  function escolher(novo: TipoImportacao, arquivo: File | null = null) {
    setArquivoInicial(arquivo)
    setTipo(novo)
  }
  const atual = TIPOS.find((t) => t.tipo === tipo)!
  const props = { arquivoInicial, aoOcupado: setOcupado, aoTrocarTipo: escolher }

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina titulo="Importar planilha" subtitulo={atual.subtitulo} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="radiogroup" aria-label="Tipo de planilha">
        {TIPOS.map((t) => {
          const ativo = t.tipo === tipo
          return (
            <button key={t.tipo} type="button" role="radio" aria-checked={ativo} disabled={ocupado && !ativo}
              onClick={() => { if (!ativo) escolher(t.tipo) }}
              className={`flex items-start gap-3 rounded-[14px] border px-5 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${ativo
                ? 'border-[var(--color-orange)] bg-[var(--color-orange-50)] shadow-[inset_0_0_0_1px_var(--color-orange)]'
                : 'cursor-pointer border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-blue)]'}`}>
              <span className={`mt-0.5 ${ativo ? 'text-[var(--color-orange-700)]' : 'text-[var(--color-blue)]'}`}>{t.icone}</span>
              <span>
                <span className="block font-heading text-[15px] font-bold text-[var(--color-blue-800)]">{ROTULO_TIPO[t.tipo]}</span>
                <span className="mt-1 block text-[12px] text-[var(--color-neutral-600)]">{t.descricao}</span>
              </span>
            </button>
          )
        })}
      </div>

      {tipo === 'reatividade' ? <ImportadorReatividade {...props} />
        : tipo === 'amostras' ? <ImportadorAmostras {...props} />
        : <ImportadorPvbt {...props} />}
    </div>
  )
}
