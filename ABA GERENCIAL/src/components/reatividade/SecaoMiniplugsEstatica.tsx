import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Disc, FlaskConical, Loader2, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cadastrarEstatica } from '../../reatividade/gravarRda'
import { listarAmostras, listarLitologias, listarProjetos, listarSistemasAcidos, type AmostraResumo } from '../../servicos/api'
import { useContexto } from '../../store/useContexto'
import type { Litologia, Projeto, SistemaAcido } from '../../tipos/banco'
import { fmt, fmtData, mensagemErro } from '../../utils/formatacao'
import { Alert, Badge, Button, Card, Input, Select } from '../UI'

interface EnsaioEstaticaLinha {
  id: number
  amostra_id: string
  data_ensaio: string | null
  id_sistema: string | null
  temperatura_c: number | null
  pressao_psi: number | null
  volume_acido_ml: number | null
  tempo_min: number | null
  massa_inicial_g: number | null
  massa_final_g: number | null
  perda_massa_g: number | null
  perda_massa_pct: number | null
  area_cm2: number | null
  taxa_dissolucao_g_cm2_min: number | null
  responsavel: string | null
}

function nOuNull(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

export const SecaoMiniplugsEstatica: React.FC = () => {
  const empresaId = useContexto((s) => s.empresaId)
  const projetoContextoId = useContexto((s) => s.projetoId)

  const [modoMiniplug, setModoMiniplug] = useState<'novo' | 'existente'>('novo')
  const [proximoMp, setProximoMp] = useState<string>('MP001')

  // Catálogos
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [litologias, setLitologias] = useState<Litologia[]>([])
  const [sistemas, setSistemas] = useState<SistemaAcido[]>([])
  const [amostras, setAmostras] = useState<AmostraResumo[]>([])
  const [ensaiosProjeto, setEnsaiosProjeto] = useState<EnsaioEstaticaLinha[]>([])
  const [carregando, setCarregando] = useState(true)

  // Formulário Miniplug
  const [codigo, setCodigo] = useState('')
  const [projetoId, setProjetoId] = useState(projetoContextoId ?? '')
  const [litologia, setLitologia] = useState('')
  const [tipoOrigem, setTipoOrigem] = useState<'afloramento' | 'testemunho'>('afloramento')
  const [diametroCm, setDiametroCm] = useState('1.27')
  const [comprimentoCm, setComprimentoCm] = useState('2.54')
  const [massaSecaG, setMassaSecaG] = useState('')
  const [amostraOrigem, setAmostraOrigem] = useState('')
  const [obsMiniplug, setObsMiniplug] = useState('')
  const [codigoExistente, setCodigoExistente] = useState('')

  // Formulário Ensaio
  const [dataEnsaio, setDataEnsaio] = useState(() => new Date().toISOString().slice(0, 10))
  const [idSistema, setIdSistema] = useState('')
  const [temperaturaC, setTemperaturaC] = useState('25')
  const [pressaoPsi, setPressaoPsi] = useState('')
  const [volumeAcidoMl, setVolumeAcidoMl] = useState('100')
  const [tempoMin, setTempoMin] = useState('60')
  const [massaInicialG, setMassaInicialG] = useState('')
  const [massaFinalG, setMassaFinalG] = useState('')
  const [areaCm2, setAreaCm2] = useState('')
  const [areaEditadaManual, setAreaEditadaManual] = useState(false)
  const [responsavel, setResponsavel] = useState('')
  const [obsEnsaio, setObsEnsaio] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [prjs, lits, sis, ams, rpcMp] = await Promise.all([
        listarProjetos(empresaId ?? undefined, true).catch(() => []),
        listarLitologias().catch(() => []),
        listarSistemasAcidos().catch(() => []),
        listarAmostras({ empresa_id: empresaId ?? undefined, projeto_id: projetoContextoId ?? undefined }).catch(() => []),
        supabase.rpc('proximo_codigo_miniplug'),
      ])
      setProjetos(prjs)
      setLitologias(lits)
      setSistemas(sis)
      setAmostras(ams)
      if (typeof rpcMp.data === 'string' && rpcMp.data) setProximoMp(rpcMp.data)
      if (!projetoContextoId && prjs.length > 0) {
        setProjetoId((atual) => atual || prjs[0].id)
      } else if (projetoContextoId) {
        setProjetoId(projetoContextoId)
      }
      if (lits.length > 0) {
        setLitologia((atual) => atual || lits[0].nome)
      }

      // só as que têm dissolução estática (evita uma URL com centenas de ids)
      const idsAmostras = ams.filter((a) => Number(a.n_reatividade) > 0 || a.tipo_amostra === 'mini_plug').map((a) => a.id).slice(0, 300)
      if (idsAmostras.length > 0) {
        const { data: ens } = await supabase
          .from('analise_reatividade_estatica')
          .select('*')
          .in('amostra_id', idsAmostras)
          .order('id', { ascending: false })
        setEnsaiosProjeto((ens ?? []) as EnsaioEstaticaLinha[])
      } else {
        setEnsaiosProjeto([])
      }
    } finally {
      setCarregando(false)
    }
  }, [empresaId, projetoContextoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const miniplugsExistentes = useMemo(
    () => amostras.filter((a) => a.tipo_amostra === 'mini_plug' || /^MP\d+/i.test(a.codigo)),
    [amostras],
  )

  const miniplugSelecionado = useMemo(
    () => miniplugsExistentes.find((a) => a.codigo.toUpperCase() === codigoExistente.trim().toUpperCase()) ?? null,
    [miniplugsExistentes, codigoExistente],
  )

  // Área cilíndrica total exposta: 2 * (π·d²/4) + π·d·L ou (π·d²/4 + π·d·L apoiado na base).
  // Conforme especificação: sugerir π·d²/4 + π·d·L do miniplug (editável).
  const areaSugerida = useMemo(() => {
    const d = modoMiniplug === 'existente' ? miniplugSelecionado?.diametro_cm ?? null : nOuNull(diametroCm)
    const L = modoMiniplug === 'existente' ? miniplugSelecionado?.comprimento_cm ?? null : nOuNull(comprimentoCm)
    if (d == null || L == null || d <= 0 || L <= 0) return null
    return (Math.PI * d * d) / 4 + Math.PI * d * L
  }, [modoMiniplug, miniplugSelecionado, diametroCm, comprimentoCm])

  useEffect(() => {
    if (!areaEditadaManual && areaSugerida != null) {
      setAreaCm2(areaSugerida.toFixed(2))
    }
  }, [areaSugerida, areaEditadaManual])

  const calculosAoVivo = useMemo(() => {
    const m0 = nOuNull(massaInicialG)
    const mf = nOuNull(massaFinalG)
    const area = nOuNull(areaCm2)
    const t = nOuNull(tempoMin)
    if (m0 == null || mf == null || m0 <= 0) return null
    const perdaG = m0 - mf
    const perdaPct = (perdaG / m0) * 100
    const taxaArea = area != null && area > 0 && t != null && t > 0 ? perdaG / area / t : null
    return { perdaG, perdaPct, taxaArea }
  }, [massaInicialG, massaFinalG, areaCm2, tempoMin])

  const handleGravar = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const m0 = nOuNull(massaInicialG)
    const mf = nOuNull(massaFinalG)
    if (m0 == null || !(m0 > 0)) {
      setMsg({ tipo: 'erro', texto: 'Informe a massa inicial (g) do miniplug.' })
      return
    }
    if (mf == null) {
      setMsg({ tipo: 'erro', texto: 'Informe a massa final (g) do miniplug.' })
      return
    }
    if (modoMiniplug === 'existente' && !codigoExistente.trim()) {
      setMsg({ tipo: 'erro', texto: 'Escolha ou digite o código do miniplug já cadastrado.' })
      return
    }
    if (modoMiniplug === 'novo' && (!projetoId || !litologia)) {
      setMsg({ tipo: 'erro', texto: 'Informe o projeto e a litologia do novo miniplug.' })
      return
    }

    setSalvando(true)
    try {
      const r = await cadastrarEstatica(supabase, {
        amostra:
          modoMiniplug === 'existente'
            ? { codigo: codigoExistente.trim(), projeto_id: projetoId || undefined }
            : {
                codigo: codigo.trim() || null,
                projeto_id: projetoId,
                litologia,
                tipo_origem: tipoOrigem,
                diametro_cm: nOuNull(diametroCm),
                comprimento_cm: nOuNull(comprimentoCm),
                massa_seca_g: nOuNull(massaSecaG) ?? m0,
                amostra_origem: amostraOrigem.trim() || null,
                observacoes: obsMiniplug.trim() || null,
              },
        ensaio: {
          data_ensaio: dataEnsaio || null,
          id_sistema: idSistema || null,
          temperatura_c: nOuNull(temperaturaC),
          pressao_psi: nOuNull(pressaoPsi),
          volume_acido_ml: nOuNull(volumeAcidoMl),
          tempo_min: nOuNull(tempoMin),
          massa_inicial_g: m0,
          massa_final_g: mf,
          area_cm2: nOuNull(areaCm2),
          responsavel: responsavel.trim() || null,
          observacoes: obsEnsaio.trim() || null,
        },
      })

      setMsg({
        tipo: 'sucesso',
        texto: `Gravado no miniplug ${r.codigo} (${r.amostra_nova ? 'novo' : 'existente'}).`,
      })
      setCodigo('')
      setMassaInicialG('')
      setMassaFinalG('')
      await carregar()
    } catch (err) {
      setMsg({ tipo: 'erro', texto: mensagemErro(err) })
    } finally {
      setSalvando(false)
    }
  }

  const mapaAmostras = useMemo(() => new Map(amostras.map((a) => [a.id, a])), [amostras])
  const mapaSistemas = useMemo(() => new Map(sistemas.map((s) => [s.id_sistema, s])), [sistemas])

  return (
    <div className="space-y-6">
      {msg && <Alert tipo={msg.tipo} mensagem={msg.texto} onClose={() => setMsg(null)} />}

      <form onSubmit={(e) => void handleGravar(e)} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 1. Cartão Miniplug */}
        <div className="lg:col-span-5">
          <Card
            titulo="Miniplug (Corpo de Prova)"
            subtitulo="Cadastre um miniplug novo ou lance outro ensaio num miniplug existente"
            icone={<Disc size={18} />}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-[13px] font-medium">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={modoMiniplug === 'novo'}
                    onChange={() => setModoMiniplug('novo')}
                    className="accent-[var(--color-orange)]"
                  />
                  Novo miniplug
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={modoMiniplug === 'existente'}
                    onChange={() => setModoMiniplug('existente')}
                    className="accent-[var(--color-orange)]"
                  />
                  Miniplug já cadastrado
                </label>
              </div>

              {modoMiniplug === 'existente' ? (
                <div className="space-y-3">
                  <Input
                    label="Código do miniplug"
                    obrigatorio
                    list="lista-miniplugs-existentes"
                    placeholder="Ex.: MP001"
                    value={codigoExistente}
                    onChange={(e) => setCodigoExistente(e.target.value)}
                  />
                  <datalist id="lista-miniplugs-existentes">
                    {miniplugsExistentes.map((m) => (
                      <option key={m.id} value={m.codigo}>
                        {m.codigo} · {m.litologia} ({m.projeto})
                      </option>
                    ))}
                  </datalist>
                  {miniplugSelecionado && (
                    <div className="rounded-lg bg-[var(--color-blue-50)] border border-[var(--color-blue-200)] p-3 text-xs text-[var(--color-blue-900)]">
                      <strong>{miniplugSelecionado.codigo}</strong> · {miniplugSelecionado.litologia} · D=
                      {fmt(miniplugSelecionado.diametro_cm, 2)} cm, L={fmt(miniplugSelecionado.comprimento_cm, 2)} cm
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label={`Código (vazio = ${proximoMp})`}
                    placeholder={proximoMp}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                  />
                  <Select
                    label="Projeto"
                    obrigatorio
                    value={projetoId}
                    onChange={(e) => setProjetoId(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {projetos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} · {p.nome}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Litologia"
                    obrigatorio
                    value={litologia}
                    onChange={(e) => setLitologia(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {litologias.map((l) => (
                      <option key={l.nome} value={l.nome}>
                        {l.nome}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Tipo de origem"
                    value={tipoOrigem}
                    onChange={(e) => setTipoOrigem(e.target.value as 'afloramento' | 'testemunho')}
                  >
                    <option value="afloramento">Afloramento</option>
                    <option value="testemunho">Testemunho</option>
                  </Select>
                  <Input
                    label="Diâmetro d (cm)"
                    type="number"
                    step="0.01"
                    value={diametroCm}
                    onChange={(e) => setDiametroCm(e.target.value)}
                  />
                  <Input
                    label="Comprimento L (cm)"
                    type="number"
                    step="0.01"
                    value={comprimentoCm}
                    onChange={(e) => setComprimentoCm(e.target.value)}
                  />
                  <Input
                    label="Massa seca (g)"
                    type="number"
                    step="0.0001"
                    placeholder="Opcional (= massa inicial)"
                    value={massaSecaG}
                    onChange={(e) => setMassaSecaG(e.target.value)}
                  />
                  <div>
                    <Input
                      label="Cortado de (código da amostra)"
                      list="lista-amostras-origem"
                      placeholder="Ex.: IL076 (opcional)"
                      value={amostraOrigem}
                      onChange={(e) => setAmostraOrigem(e.target.value)}
                    />
                    <datalist id="lista-amostras-origem">
                      {amostras.map((a) => (
                        <option key={a.id} value={a.codigo}>
                          {a.codigo} · {a.litologia}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      label="Observações do miniplug"
                      value={obsMiniplug}
                      onChange={(e) => setObsMiniplug(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 2. Cartão Ensaio */}
        <div className="lg:col-span-7">
          <Card
            titulo="Ensaio de Dissolução Estática"
            subtitulo="Condições de reação, massas antes/depois e área exposta (π·d²/4 + π·d·L)"
            icone={<FlaskConical size={18} />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input label="Data do ensaio" type="date" value={dataEnsaio} onChange={(e) => setDataEnsaio(e.target.value)} />
                <div className="sm:col-span-2">
                  <Select label="Sistema ácido" value={idSistema} onChange={(e) => setIdSistema(e.target.value)}>
                    <option value="">— Selecionar sistema ácido —</option>
                    {sistemas.map((s) => (
                      <option key={s.id_sistema} value={s.id_sistema}>
                        {s.id_sistema} · {s.nome_sistema}
                      </option>
                    ))}
                  </Select>
                </div>
                <Input label="Temperatura (°C)" type="number" step="0.5" value={temperaturaC} onChange={(e) => setTemperaturaC(e.target.value)} />
                <Input label="Pressão (psi)" type="number" step="1" placeholder="Atmosférica" value={pressaoPsi} onChange={(e) => setPressaoPsi(e.target.value)} />
                <Input label="Volume de ácido (mL)" type="number" step="1" value={volumeAcidoMl} onChange={(e) => setVolumeAcidoMl(e.target.value)} />
                <Input label="Tempo (min)" type="number" step="0.5" value={tempoMin} onChange={(e) => setTempoMin(e.target.value)} />
                <Input label="Massa inicial (g)" obrigatorio type="number" step="0.0001" value={massaInicialG} onChange={(e) => setMassaInicialG(e.target.value)} />
                <Input label="Massa final (g)" obrigatorio type="number" step="0.0001" value={massaFinalG} onChange={(e) => setMassaFinalG(e.target.value)} />
                <div className="sm:col-span-2">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        label="Área exposta (cm²)"
                        type="number"
                        step="0.01"
                        value={areaCm2}
                        onChange={(e) => {
                          setAreaEditadaManual(true)
                          setAreaCm2(e.target.value)
                        }}
                      />
                    </div>
                    {areaSugerida != null && (
                      <button
                        type="button"
                        onClick={() => {
                          setAreaEditadaManual(false)
                          setAreaCm2(areaSugerida.toFixed(2))
                        }}
                        className="btn btn-secondary !py-2 !px-2.5 text-xs whitespace-nowrap"
                        title="Calcular π·d²/4 + π·d·L pelas dimensões do miniplug"
                      >
                        <Sparkles size={13} /> Sugerir ({fmt(areaSugerida, 2)})
                      </button>
                    )}
                  </div>
                </div>
                <Input label="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
                <div className="sm:col-span-3">
                  <Input label="Observações do ensaio" value={obsEnsaio} onChange={(e) => setObsEnsaio(e.target.value)} />
                </div>
              </div>

              {/* Prévia ao vivo */}
              <div className="rounded-xl border border-[var(--color-blue-200)] bg-[var(--color-blue-50)]/60 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase text-[var(--color-neutral-600)]">Perda de massa (g)</span>
                  <p className="m-0 mt-1 text-lg font-bold tabular-nums text-[var(--color-blue-900)]">
                    {calculosAoVivo ? `${fmt(calculosAoVivo.perdaG, 4)} g` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-[var(--color-neutral-600)]">Perda de massa (%)</span>
                  <p className="m-0 mt-1 text-lg font-bold tabular-nums text-[var(--color-red)]">
                    {calculosAoVivo ? `${fmt(calculosAoVivo.perdaPct, 2)} %` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-[var(--color-neutral-600)]">Taxa por área · g/(cm²·min)</span>
                  <p className="m-0 mt-1 text-lg font-bold tabular-nums text-[var(--color-blue-800)]">
                    {calculosAoVivo?.taxaArea != null ? calculosAoVivo.taxaArea.toExponential(3).replace('.', ',') : '—'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="primary" icon={<Check size={15} />} loading={salvando}>
                  Gravar miniplug + ensaio
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </form>

      {/* 3. Lista de ensaios de dissolução estática do projeto */}
      <Card
        titulo="Ensaios de Dissolução Estática do Contexto"
        subtitulo="Registros gravados em analise_reatividade_estatica vinculados aos miniplugs/amostras"
        acoes={<Badge variant="blue">{ensaiosProjeto.length} ensaio(s)</Badge>}
      >
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-[var(--color-neutral-500)]">
            <Loader2 size={15} className="animate-spin text-[var(--color-orange)]" /> Carregando…
          </div>
        ) : ensaiosProjeto.length === 0 ? (
          <p className="m-0 py-4 text-center text-xs text-[var(--color-neutral-500)]">
            Nenhum ensaio de dissolução estática registrado neste projeto ainda.
          </p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="table text-[13px]">
              <thead>
                <tr>
                  <th>Miniplug</th>
                  <th>Cortado de</th>
                  <th>Litologia</th>
                  <th>Sistema ácido</th>
                  <th className="text-right">T (°C)</th>
                  <th className="text-right">Tempo (min)</th>
                  <th className="text-right">Perda (%)</th>
                  <th className="text-right">g/(cm²·min)</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {ensaiosProjeto.map((en) => {
                  const am = mapaAmostras.get(en.amostra_id) 
                  const sis = en.id_sistema ? mapaSistemas.get(en.id_sistema) : undefined
                  return (
                    <tr key={en.id} className="lcp-row">
                      <td className="font-bold text-[var(--color-red)]">{am?.codigo ?? '—'}</td>
                      <td>{am?.amostra_mae_codigo ?? '—'}</td>
                      <td>{am?.litologia ?? '—'}</td>
                      <td>{sis?.nome_sistema ?? en.id_sistema ?? '—'}</td>
                      <td className="text-right tabular-nums">{fmt(en.temperatura_c, 1)}</td>
                      <td className="text-right tabular-nums">{fmt(en.tempo_min, 1)}</td>
                      <td className="text-right tabular-nums font-semibold">{fmt(en.perda_massa_pct, 2)}</td>
                      <td className="text-right tabular-nums font-mono text-xs">
                        {en.taxa_dissolucao_g_cm2_min != null
                          ? Number(en.taxa_dissolucao_g_cm2_min).toExponential(3).replace('.', ',')
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{fmtData(en.data_ensaio)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
