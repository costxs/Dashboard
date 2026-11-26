// REATIVIDADE › Dissolução dinâmica (RDA) › Séries e coeficiente de difusão.
//   Uma série = mesma rocha, fluido e temperatura em várias rotações (analise_rda.serie = nome).
//   calcularSerie: média ± desvio por rotação, reta TR × √ω, Levich estendido → Sc exato → D = ν / Sc.
//   Grava em rda_series (calcularEGravarSerie); ν sugerido do catálogo viscosidade_fluido.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderOpen, Plus, RotateCw, Save } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { calcularSerie } from '../../../reatividade/calculoRda'
import { calcularEGravarSerie } from '../../../reatividade/gravarRda'
import { listarLitologias, listarProjetos, listarSistemasAcidos } from '../../../servicos/api'
import { useContexto } from '../../../store/useContexto'
import type { Litologia, Projeto, SistemaAcido } from '../../../tipos/banco'
import { fmtData, mensagemErro } from '../../../utils/formatacao'
import { Alert, Button, Card, Input, Select, Textarea } from '../../UI'
import { CartaoNumero, GraficoLevichSerie, ListaAvisos, SeloRegime } from './comum'
import { cient, lerNumero, num, paraCampo, temErro } from './numeros'

interface SerieLinha {
  id: number; projeto_id: string; nome: string; litologia: string | null; id_sistema: string | null; temperatura_c: number | null
  c0_mol_cm3: number | null; viscosidade_cm2_s: number | null; fonte_viscosidade: string | null; diametro_cm: number | null
  modo_omega: 'exato' | 'planilha'; slope: number | null; r2: number | null; sc: number | null; d_cm2_s: number | null
  reynolds_max: number | null; regime: string | null; calculado_em: string | null; observacoes: string | null; n_discos: number
  por_rotacao: { rotacao_rpm: number; n: number; taxa_media: number; taxa_desvio: number | null; discos: string[] }[] | null
}
interface DiscoLinha {
  id: number; amostra: string; rotacao_rpm: number | null; taxa_reacao_mol_cm2_s: number | null; r2_h: number | null
  perda_massa_pct: number | null; situacao: string; id_sistema: string | null; litologia: string | null; temperatura_c: number | null
  conc_inicial_mol_l: number | null; dim_h_in: number | null; projeto_id: string
}
interface Viscosidade { id_sistema: string; temperatura_c: number; viscosidade_cinematica_cm2_s: number; fonte: string | null }

const VAZIO = { nome: '', litologia: '', id_sistema: '', temperatura_c: '', c0_mol_l: '', nu: '', fonte: '', diametro_cm: '', observacoes: '' }

export const SeriesRdaPanel: React.FC = () => {
  const empresaId = useContexto((s) => s.empresaId)
  const projetoContexto = useContexto((s) => s.projetoId)

  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [litologias, setLitologias] = useState<Litologia[]>([])
  const [sistemas, setSistemas] = useState<SistemaAcido[]>([])
  const [viscosidades, setViscosidades] = useState<Viscosidade[]>([])
  const [series, setSeries] = useState<SerieLinha[]>([])
  const [nomesDiscos, setNomesDiscos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)

  const [projetoId, setProjetoId] = useState(projetoContexto ?? '')
  const [f, setF] = useState(VAZIO)
  const set = (k: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const [modoPlanilha, setModoPlanilha] = useState(false)
  const [salvarNoCatalogo, setSalvarNoCatalogo] = useState(true)
  const [discos, setDiscos] = useState<DiscoLinha[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'sucesso' | 'info'; texto: string } | null>(null)


  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [prjs, lits, sis] = await Promise.all([
        listarProjetos(empresaId ?? undefined, true).catch(() => []), listarLitologias().catch(() => []), listarSistemasAcidos().catch(() => []),
      ])
      setProjetos(prjs); setLitologias(lits); setSistemas(sis)
      if (!projetoContexto && prjs.length) setProjetoId((a) => a || prjs[0].id)
      const ids = projetoContexto ? [projetoContexto] : prjs.map((p) => p.id)
      const { data: vis } = await supabase.from('viscosidade_fluido').select('*').order('id_sistema')
      setViscosidades((vis ?? []) as Viscosidade[])
      if (ids.length) {
        const [{ data: s, error }, { data: d }] = await Promise.all([
          supabase.from('v_rda_series').select('*').in('projeto_id', ids).order('nome'),
          supabase.from('v_analise_rda').select('serie, projeto_id').in('projeto_id', ids).not('serie', 'is', null),
        ])
        if (error) throw new Error(error.message)
        setSeries((s ?? []) as SerieLinha[])
        setNomesDiscos([...new Set((d ?? []).map((x) => x.serie as string))].sort())
      } else { setSeries([]); setNomesDiscos([]) }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: `Não foi possível carregar as séries: ${mensagemErro(e)}. A migração 029 já foi aplicada?` })
    } finally { setCarregando(false) }
  }, [empresaId, projetoContexto])
  useEffect(() => { void carregar() }, [carregar])

  // discos da série (pelo nome, no projeto)
  const carregarDiscos = useCallback(async (nome: string, prj: string) => {
    if (!nome.trim() || !prj) { setDiscos([]); return [] as DiscoLinha[] }
    const { data, error } = await supabase.from('v_analise_rda')
      .select('id, amostra, rotacao_rpm, taxa_reacao_mol_cm2_s, r2_h, perda_massa_pct, situacao, id_sistema, litologia, temperatura_c, conc_inicial_mol_l, dim_h_in, projeto_id')
      .eq('serie', nome.trim()).eq('projeto_id', prj).order('rotacao_rpm')
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return [] }
    const lista = (data ?? []) as DiscoLinha[]
    setDiscos(lista)
    return lista
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      void carregarDiscos(f.nome, projetoId).then((lista) => {
        // série nova: preenche o que os discos já dizem
        if (!lista.length || series.some((s) => s.nome === f.nome.trim() && s.projeto_id === projetoId)) return
        const d = lista[0]
        setF((x) => ({
          ...x,
          litologia: x.litologia || d.litologia || '', id_sistema: x.id_sistema || d.id_sistema || '',
          temperatura_c: x.temperatura_c || paraCampo(d.temperatura_c), c0_mol_l: x.c0_mol_l || paraCampo(d.conc_inicial_mol_l),
          diametro_cm: x.diametro_cm || (d.dim_h_in ? paraCampo(Number((Number(d.dim_h_in) * 2.54).toFixed(4))) : ''),
        }))
      })
    }, 350)
    return () => clearTimeout(t)
  }, [f.nome, projetoId, carregarDiscos, series])

  // ν do catálogo para o sistema e a temperatura
  const nuCatalogo = useMemo(() => {
    const T = lerNumero(f.temperatura_c)
    return viscosidades.find((v) => v.id_sistema === f.id_sistema && T != null && Number(v.temperatura_c) === T) ?? null
  }, [viscosidades, f.id_sistema, f.temperatura_c])
  useEffect(() => {
    if (nuCatalogo && !f.nu) setF((x) => ({ ...x, nu: paraCampo(Number(nuCatalogo.viscosidade_cinematica_cm2_s)), fonte: x.fonte || nuCatalogo.fonte || '' }))
  }, [nuCatalogo, f.nu])

  const c0Molcm3 = lerNumero(f.c0_mol_l) != null ? lerNumero(f.c0_mol_l)! / 1000 : null
  const nu = lerNumero(f.nu)
  const diametro = lerNumero(f.diametro_cm)

  const resultado = useMemo(() => {
    const ds = discos.filter((d) => d.taxa_reacao_mol_cm2_s != null && d.rotacao_rpm != null)
      .map((d) => ({ codigo: d.amostra, rotacao_rpm: Number(d.rotacao_rpm), taxa_reacao: Number(d.taxa_reacao_mol_cm2_s) }))
    if (!ds.length || !c0Molcm3 || !nu) return null
    return calcularSerie({ discos: ds, c0_mol_cm3: c0Molcm3, viscosidade_cm2_s: nu, diametro_cm: diametro ?? undefined, modoOmega: modoPlanilha ? 'planilha' : 'exato' })
  }, [discos, c0Molcm3, nu, diametro, modoPlanilha])

  const grafico = useMemo(() => {
    if (!resultado) return null
    const raiz = new Map(resultado.porRotacao.map((g) => [g.rotacao_rpm, g.raiz_omega]))
    return {
      medias: resultado.porRotacao.map((g) => ({ x: g.raiz_omega, y: g.taxa_media, erro: g.taxa_desvio, rpm: g.rotacao_rpm, n: g.n })),
      discos: discos.filter((d) => d.taxa_reacao_mol_cm2_s != null && d.rotacao_rpm != null)
        .map((d) => ({ x: raiz.get(Number(d.rotacao_rpm)) ?? 0, y: Number(d.taxa_reacao_mol_cm2_s), codigo: d.amostra })),
      reta: resultado.slope != null && resultado.intercepto != null ? { inclinacao: resultado.slope, intercepto: resultado.intercepto } : null,
    }
  }, [resultado, discos])

  function abrir(s: SerieLinha) {
    setProjetoId(s.projeto_id)
    setModoPlanilha(s.modo_omega === 'planilha')
    setF({
      nome: s.nome, litologia: s.litologia ?? '', id_sistema: s.id_sistema ?? '', temperatura_c: paraCampo(s.temperatura_c),
      c0_mol_l: s.c0_mol_cm3 != null ? paraCampo(Number((s.c0_mol_cm3 * 1000).toPrecision(12))) : '', nu: paraCampo(s.viscosidade_cm2_s),
      fonte: s.fonte_viscosidade ?? '', diametro_cm: paraCampo(s.diametro_cm), observacoes: s.observacoes ?? '',
    })
    setMsg(null)
  }

  function nova() { setF(VAZIO); setModoPlanilha(false); setDiscos([]); setMsg(null) }

  async function gravar() {
    if (!resultado || !c0Molcm3 || !nu || !projetoId || !f.nome.trim()) return
    setOcupado(true); setMsg(null)
    try {
      const T = lerNumero(f.temperatura_c)
      const r = await calcularEGravarSerie(supabase, {
        projeto_id: projetoId, nome: f.nome.trim(), litologia: f.litologia || null, id_sistema: f.id_sistema || null, temperatura_c: T,
        c0_mol_cm3: c0Molcm3, viscosidade_cm2_s: nu, fonte_viscosidade: f.fonte || null, diametro_cm: diametro,
        modo_omega: modoPlanilha ? 'planilha' : 'exato', observacoes: f.observacoes || null,
      })
      let extra = ''
      if (salvarNoCatalogo && f.id_sistema && T != null && !nuCatalogo) {
        const { error } = await supabase.from('viscosidade_fluido').insert({ id_sistema: f.id_sistema, temperatura_c: T, viscosidade_cinematica_cm2_s: nu, fonte: f.fonte || null })
        extra = error ? ` (ν não foi para o catálogo: ${error.message})` : ' ν salvo no catálogo de viscosidade.'
      }
      setMsg({ tipo: 'sucesso', texto: `Série "${f.nome.trim()}" gravada: Sc = ${num(r.resultado.sc, 1)}, D = ${cient(r.resultado.d_cm2_s)} cm²/s.${extra}` })
      await carregar()
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }) } finally { setOcupado(false) }
  }

  const nomeSistema = (id: string | null) => sistemas.find((s) => s.id_sistema === id)?.nome_sistema ?? id ?? '—'
  const sugestoes = [...new Set([...nomesDiscos, ...series.map((s) => s.nome)])].sort()
  const existente = series.find((s) => s.nome === f.nome.trim() && s.projeto_id === projetoId)
  const podeGravar = !!resultado && !temErro(resultado.avisos) && !!projetoId && !!f.nome.trim()

  return (
    <div className="space-y-6">
      {msg && <Alert tipo={msg.tipo} mensagem={msg.texto} onClose={() => setMsg(null)} />}

      <Card titulo="Séries do projeto" subtitulo="Cada série junta os discos com o mesmo nome de série (mesma rocha, fluido e temperatura)"
        acoes={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={nova}>Nova série</Button>}>
        {carregando ? <p className="m-0 text-[13px] text-[var(--color-neutral-500)]">Carregando…</p> : !series.length ? (
          <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhuma série calculada ainda. Grave boletins com o nome da série e calcule abaixo.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="table text-[13px]">
              <thead>
                <tr>
                  <th>Série</th><th>Litologia</th><th>Sistema</th><th className="text-right">T (°C)</th><th>Discos por rotação</th>
                  <th className="text-right">Sc</th><th className="text-right">D (cm²/s)</th><th className="text-right">R²</th><th>Regime</th><th>Calculado em</th><th></th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.id} className="lcp-row">
                    <td className="font-bold text-[var(--color-blue-800)]">{s.nome}</td>
                    <td>{s.litologia ?? '—'}</td>
                    <td>{nomeSistema(s.id_sistema)}</td>
                    <td className="text-right tabular-nums">{num(s.temperatura_c, 1)}</td>
                    <td className="text-[12px]">{(s.por_rotacao ?? []).map((g) => `${g.rotacao_rpm} rpm (${g.n})`).join(' · ') || '—'}</td>
                    <td className="text-right tabular-nums">{num(s.sc, 1)}</td>
                    <td className="text-right font-mono text-[12px]">{cient(s.d_cm2_s)}</td>
                    <td className="text-right tabular-nums">{num(s.r2, 3)}</td>
                    <td><SeloRegime regime={s.regime} /></td>
                    <td className="whitespace-nowrap">{fmtData(s.calculado_em)}</td>
                    <td><Button size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={() => abrir(s)}>Abrir</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo={existente ? `Série ${existente.nome}` : 'Série'} subtitulo="Constantes da série: ficam presas a ela (não se misturam com as de outra série)">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {!projetoContexto && (
            <Select label="Projeto" value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
              {projetos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
            </Select>
          )}
          <Input label="Nome da série" value={f.nome} onChange={set('nome')} list="rda-series-nomes" placeholder="IL HAc 10% 45 °C" obrigatorio />
          <datalist id="rda-series-nomes">{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
          <Select label="Litologia" value={f.litologia} onChange={set('litologia')}>
            <option value="">—</option>
            {litologias.map((l) => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
          </Select>
          <Select label="Sistema ácido" value={f.id_sistema} onChange={set('id_sistema')}>
            <option value="">—</option>
            {sistemas.map((s) => <option key={s.id_sistema} value={s.id_sistema}>{s.id_sistema} · {s.nome_sistema}</option>)}
          </Select>
          <Input label="Temperatura" unidade="°C" value={f.temperatura_c} onChange={set('temperatura_c')} />
          <Input label="C₀" unidade="mol/L" value={f.c0_mol_l} onChange={set('c0_mol_l')} obrigatorio
            ajuda={c0Molcm3 ? `= ${cient(c0Molcm3, 4)} mol/cm³ (÷ 1000)` : undefined} />
          <Input label="Viscosidade cinemática ν" unidade="cm²/s" value={f.nu} onChange={set('nu')} obrigatorio
            ajuda={nuCatalogo ? `catálogo: ${num(Number(nuCatalogo.viscosidade_cinematica_cm2_s), 6)}${nuCatalogo.fonte ? ` (${nuCatalogo.fonte})` : ''}` : 'sem valor no catálogo para este sistema e temperatura'} />
          <Input label="Fonte do ν" value={f.fonte} onChange={set('fonte')} placeholder="referência da literatura" />
          <Input label="Diâmetro do disco" unidade="cm" value={f.diametro_cm} onChange={set('diametro_cm')} ajuda="para o número de Reynolds" />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--color-neutral-700)]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={modoPlanilha} onChange={(e) => setModoPlanilha(e.target.checked)} />
            ω igual à planilha (rpm × 0,1047); desmarcado = exato (rpm × 2π/60)
          </label>
          {!nuCatalogo && f.id_sistema && lerNumero(f.temperatura_c) != null && nu && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={salvarNoCatalogo} onChange={(e) => setSalvarNoCatalogo(e.target.checked)} />
              salvar este ν no catálogo de viscosidade
            </label>
          )}
        </div>
        <div className="mt-4"><Textarea label="Observações" value={f.observacoes} onChange={set('observacoes')} rows={2} /></div>
      </Card>

      <Card titulo="Discos da série" subtitulo={f.nome.trim() ? `analise_rda com série "${f.nome.trim()}"` : 'Escreva o nome da série'}
        acoes={<Button size="sm" variant="secondary" icon={<RotateCw size={14} />} onClick={() => void carregarDiscos(f.nome, projetoId)}>Recarregar</Button>}>
        {!discos.length ? <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhum disco com esse nome de série neste projeto.</p> : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="table text-[13px]">
              <thead><tr><th>Disco</th><th className="text-right">Rotação (rpm)</th><th className="text-right">TR (mol/cm²·s)</th><th className="text-right">R² [H⁺] × t</th><th className="text-right">Perda de massa (%)</th><th>Situação</th></tr></thead>
              <tbody>
                {discos.map((d) => (
                  <tr key={d.id} className="lcp-row">
                    <td className="font-bold text-[var(--color-red)]">{d.amostra}</td>
                    <td className="text-right tabular-nums">{num(d.rotacao_rpm, 0)}</td>
                    <td className="text-right font-mono text-[12px]">{cient(d.taxa_reacao_mol_cm2_s)}</td>
                    <td className="text-right tabular-nums">{num(d.r2_h, 4)}</td>
                    <td className="text-right tabular-nums">{num(d.perda_massa_pct, 2)}</td>
                    <td>{d.situacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo="Coeficiente de difusão (Levich estendido)" subtitulo="Sc resolvido exato (equação do 2º grau em Sc^(−1/3)); D = ν / Sc">
        {!resultado ? (
          <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Precisa de discos com taxa, C₀ e ν.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <CartaoNumero rotulo="Slope TR × √ω" valor={cient(resultado.slope)} />
              <CartaoNumero rotulo="Sc" valor={num(resultado.sc, 1)} detalhe={resultado.residuo_levich != null ? `conferência: ${num(resultado.residuo_levich, 6)} (deve dar 1)` : undefined} />
              <CartaoNumero rotulo="D" valor={cient(resultado.d_cm2_s)} detalhe="cm²/s" destaque />
              <CartaoNumero rotulo="R² da reta" valor={num(resultado.r2, 4)} />
              <CartaoNumero rotulo="Re máx." valor={resultado.reynolds_max != null ? num(resultado.reynolds_max, 0) : '—'} detalhe="ω·r²/ν (laminar < 3×10⁵)" />
              <CartaoNumero rotulo="Regime" valor={<SeloRegime regime={resultado.regime} />} />
            </div>
            <ListaAvisos avisos={resultado.avisos} />
            {grafico && <GraficoLevichSerie medias={grafico.medias} discos={grafico.discos} reta={grafico.reta} />}
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="table text-[13px]">
                <thead><tr><th className="text-right">Rotação (rpm)</th><th className="text-right">√ω</th><th className="text-right">n</th><th className="text-right">TR média</th><th className="text-right">Desvio</th><th>Discos</th></tr></thead>
                <tbody>
                  {resultado.porRotacao.map((g) => (
                    <tr key={g.rotacao_rpm}>
                      <td className="text-right tabular-nums">{g.rotacao_rpm}</td>
                      <td className="text-right tabular-nums">{num(g.raiz_omega, 3)}</td>
                      <td className="text-right tabular-nums">{g.n}</td>
                      <td className="text-right font-mono text-[12px]">{cient(g.taxa_media)}</td>
                      <td className="text-right font-mono text-[12px]">{g.n > 1 ? cient(g.taxa_desvio) : '—'}</td>
                      <td className="text-[12px]">{g.codigos.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button icon={existente ? <RotateCw size={15} /> : <Save size={15} />} loading={ocupado} disabled={!podeGravar} onClick={() => void gravar()}>
          {existente ? 'Recalcular e gravar a série' : 'Gravar a série'}
        </Button>
      </div>
    </div>
  )
}
