// Amostra do ensaio de dissolução estática (obrigatória): digita-se o código; o que não existe
// no banco é cadastrado aqui mesmo, sem sair da tela.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Plus } from 'lucide-react'
import { buscarAmostraPorCodigo, obterAmostraResumo, type AmostraResumo } from '../../servicos/api'
import { CadastroRapidoAmostra } from '../../pages/tratamento/CadastroRapidoAmostra'
import { mensagemErro } from '../../utils/formatacao'

const normalizar = (s: string) => s.trim().replace(/\s+/g, '').toUpperCase()

export const CampoAmostraEnsaio: React.FC<{
  amostras: AmostraResumo[]
  valor: string
  aoEscolher: (a: AmostraResumo | null) => void
  /** código vindo da planilha importada */
  sugestao?: string | null
  /** tentou salvar sem amostra */
  faltando?: boolean
}> = ({ amostras, valor, aoEscolher, sugestao, faltando }) => {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const [naoExiste, setNaoExiste] = useState<string | null>(null)
  const [cadastrando, setCadastrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const escolhida = useRef<string | null>(null)
  const consulta = useRef(0)

  const atual = amostras.find((a) => a.id === valor) ?? null

  // acompanha a amostra do ensaio carregado (pode ser de um projeto fora da lista atual)
  useEffect(() => {
    if (atual) {
      escolhida.current = atual.id
      setTexto(atual.codigo)
      setNaoExiste(null)
      setCadastrando(false)
    } else if (valor) {
      let vivo = true
      obterAmostraResumo(valor).then((a) => { if (vivo && a) aoEscolher(a) }).catch(() => undefined)
      return () => { vivo = false }
    } else if (escolhida.current) {
      escolhida.current = null
      setTexto('')
    }
  }, [valor, atual, aoEscolher])

  async function conferir(bruto: string) {
    const cod = normalizar(bruto)
    if (!cod || normalizar(atual?.codigo ?? '') === cod) return
    const n = ++consulta.current
    const local = amostras.find((a) => normalizar(a.codigo) === cod)
    if (local) { aoEscolher(local); return }
    setConferindo(true)
    setErro(null)
    try {
      // a lista da tela é da empresa/projeto aberto; o código pode existir em outro projeto
      const achada = await buscarAmostraPorCodigo(cod)
      if (n !== consulta.current) return
      if (achada) aoEscolher(achada)
      else setNaoExiste(cod)
    } catch (e) {
      if (n === consulta.current) setErro(mensagemErro(e))
    } finally {
      if (n === consulta.current) setConferindo(false)
    }
  }

  useEffect(() => {
    if (!sugestao) return
    setTexto(sugestao)
    void conferir(sugestao)
    // só quando chega um código novo da planilha
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestao])

  const opcoes = useMemo(() => {
    const q = normalizar(texto)
    return amostras
      .filter((a) => a.tipo_amostra !== 'mini_plug' && (!q || normalizar(a.codigo).includes(q)))
      .slice(0, 8)
  }, [amostras, texto])

  const destaque = faltando && !valor

  return (
    <div className={`cartao p-4 space-y-3 ${destaque ? '!border-red-400' : ''}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative w-full sm:w-[340px]">
          <label htmlFor="amostra-ensaio" className="rotulo block mb-1.5">Amostra do ensaio *</label>
          <input
            id="amostra-ensaio"
            type="text"
            autoComplete="off"
            value={texto}
            placeholder="Digite o código, ex.: IL057"
            aria-required
            aria-invalid={destaque || undefined}
            className={`input uppercase ${destaque ? '!border-red-400' : ''}`}
            onFocus={() => setAberto(true)}
            onChange={(e) => {
              consulta.current++
              setConferindo(false)
              setTexto(e.target.value)
              setAberto(true)
              setNaoExiste(null)
              setCadastrando(false)
              setErro(null)
              if (valor) { escolhida.current = null; aoEscolher(null) }
            }}
            onBlur={() => { setAberto(false); void conferir(texto) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); setAberto(false); void conferir(texto) }
              if (e.key === 'Escape') setAberto(false)
            }}
          />
          {aberto && !atual && opcoes.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-[10px] border border-[var(--color-neutral-300)] bg-white p-1 shadow-lg list-none m-0">
              {opcoes.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[var(--color-blue-50)] cursor-pointer"
                    // mouseDown vem antes do blur do campo
                    onMouseDown={(e) => { e.preventDefault(); setAberto(false); aoEscolher(a) }}
                  >
                    <strong className="codigo">{a.codigo}</strong>{' '}
                    <span className="text-[var(--color-neutral-600)]">{a.litologia}{a.projeto ? ` · ${a.projeto}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-[43px] flex-1 sm:pt-6 text-[13px]">
          {conferindo ? (
            <span className="inline-flex items-center gap-1.5 text-[var(--color-neutral-600)]">
              <Loader2 size={14} className="animate-spin" /> Procurando a amostra…
            </span>
          ) : atual ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
              <CheckCircle2 size={15} /> {atual.codigo} · {atual.litologia}{atual.projeto ? ` · ${atual.projeto}` : ''}
            </span>
          ) : naoExiste ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-[var(--color-orange-700)] font-semibold">
              <AlertTriangle size={15} /> {naoExiste} não está cadastrada.
              {!cadastrando && (
                <button type="button" className="btn btn-blue btn-sm" onClick={() => setCadastrando(true)}>
                  <Plus size={13} /> Cadastrar amostra
                </button>
              )}
            </span>
          ) : (
            <span className={destaque ? 'text-red-700 font-semibold' : 'text-[var(--color-neutral-600)]'}>
              Obrigatória: os resultados e gráficos ficam gravados nela, na aba RDA.
            </span>
          )}
          {erro && <p className="m-0 mt-1 text-red-700">{erro}</p>}
        </div>
      </div>

      {cadastrando && naoExiste && (
        <CadastroRapidoAmostra
          key={naoExiste}
          codigo={naoExiste}
          finalidade="reatividade estática"
          usarExistente
          aoFechar={() => setCadastrando(false)}
          aoCadastrar={async (id) => {
            try {
              const a = await obterAmostraResumo(id)
              if (a) aoEscolher(a)
            } catch (e) {
              setErro(mensagemErro(e))
            }
          }}
        />
      )}
    </div>
  )
}
