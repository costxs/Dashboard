import React, { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { Alert, Input, Select } from '../../components/UI'
import { usePapeis } from '../../hooks/usePapel'
import { listarLitologias, listarProjetos, salvarAmostra } from '../../servicos/api'
import { useContexto } from '../../store/useContexto'
import type { Litologia, Projeto } from '../../tipos/banco'
import { mensagemErro, numeroParaInput, paraNumero } from '../../utils/formatacao'

// Cadastro rápido da amostra dentro do tratamento de coreflood, para quando o arquivo é de uma
// amostra que ainda não está no catálogo. Só o que o banco exige (código, projeto, litologia,
// origem e, se testemunho, o poço) + as dimensões do ensaio. O resto se completa em Amostras e ensaios.
// Quem decide se a pessoa pode cadastrar no projeto é o banco (RLS); a lista só mostra onde ela é editora.

const positivo = (s: string) => { const n = paraNumero(s); return n != null && Number.isFinite(n) && n > 0 ? n : null }

export const CadastroRapidoAmostra: React.FC<{
  codigo?: string | null
  comprimento_cm?: number | null
  diametro_cm?: number | null
  aoCadastrar: (id: string) => void
  aoFechar: () => void
}> = (p) => {
  const empresaId = useContexto((s) => s.empresaId)
  const projetoAberto = useContexto((s) => s.projetoId)
  const [projetos, setProjetos] = useState<Projeto[] | null>(null)
  const [litologias, setLitologias] = useState<Litologia[]>([])
  const [codigo, setCodigo] = useState(p.codigo ?? '')
  const [projetoId, setProjetoId] = useState(projetoAberto ?? '')
  const [litologia, setLitologia] = useState('')
  const [origem, setOrigem] = useState<'afloramento' | 'testemunho'>('afloramento')
  const [poco, setPoco] = useState('')
  const [comprimento, setComprimento] = useState(numeroParaInput(p.comprimento_cm))
  const [diametro, setDiametro] = useState(numeroParaInput(p.diametro_cm))
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    listarProjetos(empresaId, true).then((x) => { if (vivo) setProjetos(x) }).catch((e) => { if (vivo) { setProjetos([]); setErro(mensagemErro(e)) } })
    listarLitologias().then((x) => { if (vivo) setLitologias(x) }).catch(() => { /* a lista fica vazia e o banco recusa */ })
    return () => { vivo = false }
  }, [empresaId])

  const papeis = usePapeis((projetos ?? []).map((x) => x.id))
  // com um projeto aberto no topo, a lista de amostras da tela é só dele: cadastra nele
  const editaveis = useMemo(
    () => (projetos ?? []).filter((x) => papeis[x.id] === 'editor' && (!projetoAberto || x.id === projetoAberto)),
    [projetos, papeis, projetoAberto],
  )
  useEffect(() => {
    // projeto aberto no topo, se a pessoa for editora nele; senão, o único possível
    if (!projetoId && editaveis.length === 1) setProjetoId(editaveis[0].id)
  }, [editaveis, projetoId])

  const L = positivo(comprimento), D = positivo(diametro)
  const falta = !codigo.trim() ? 'Informe o código.' : !projetoId ? 'Escolha o projeto.' : !litologia ? 'Escolha a litologia.'
    : origem === 'testemunho' && !poco.trim() ? 'Informe o poço (obrigatório para testemunho).' : null

  async function cadastrar() {
    if (falta) return
    setErro(null)
    setGravando(true)
    try {
      const a = await salvarAmostra({
        codigo: codigo.trim().replace(/\s+/g, '').toUpperCase(), projeto_id: projetoId, litologia, tipo_origem: origem,
        poco: origem === 'testemunho' ? poco.trim() : null, comprimento_cm: L, diametro_cm: D, finalidade: 'coreflooding',
      })
      p.aoCadastrar(a.id)
    } catch (e) {
      const msg = mensagemErro(e)
      setErro(/duplicate|23505|já existe/i.test(msg)
        ? `Já existe uma amostra com o código ${codigo.trim().toUpperCase()} (talvez em outro projeto, que você não vê). Confira o código.`
        : msg)
    } finally {
      setGravando(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-[var(--color-blue-200)] bg-[var(--color-blue-50)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="m-0 font-semibold text-[var(--color-blue-800)]">Cadastrar amostra que não está no catálogo</p>
        <button type="button" className="btn-icone" title="Fechar" onClick={p.aoFechar} disabled={gravando}><X size={15} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input label="Código" obrigatorio value={codigo} disabled={gravando} onChange={(e) => setCodigo(e.target.value)} />
        <Select label="Projeto" obrigatorio value={projetoId} disabled={gravando} onChange={(e) => setProjetoId(e.target.value)}>
          <option value="">{projetos ? (editaveis.length ? 'Escolha o projeto…' : 'Você não é editor de nenhum projeto') : 'Carregando…'}</option>
          {editaveis.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.nome}</option>)}
        </Select>
        <Select label="Litologia" obrigatorio value={litologia} disabled={gravando} onChange={(e) => setLitologia(e.target.value)}>
          <option value="">Escolha a litologia…</option>
          {litologias.map((x) => <option key={x.nome} value={x.nome}>{x.nome}</option>)}
        </Select>
        <Select label="Origem" value={origem} disabled={gravando} onChange={(e) => setOrigem(e.target.value as 'afloramento' | 'testemunho')}>
          <option value="afloramento">Afloramento</option>
          <option value="testemunho">Testemunho</option>
        </Select>
        {origem === 'testemunho' && (
          <Input label="Poço" obrigatorio value={poco} disabled={gravando} onChange={(e) => setPoco(e.target.value)} />
        )}
        <Input label="Comprimento" unidade="cm" inputMode="decimal" value={comprimento} disabled={gravando}
          error={comprimento.trim() && L == null ? 'Número maior que zero' : undefined} onChange={(e) => setComprimento(e.target.value)} />
        <Input label="Diâmetro" unidade="cm" inputMode="decimal" value={diametro} disabled={gravando}
          error={diametro.trim() && D == null ? 'Número maior que zero' : undefined} onChange={(e) => setDiametro(e.target.value)} />
      </div>
      {erro && <div className="mt-4"><Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} /></div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-blue" onClick={cadastrar} disabled={gravando || falta != null}>
          {gravando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Cadastrar e usar esta amostra
        </button>
        <span className="text-[12px] text-[var(--color-neutral-600)]">
          {falta ?? 'Os demais dados (bloco, fornecedor, massa...) se completam depois em Amostras e ensaios.'}
        </span>
      </div>
    </div>
  )
}
