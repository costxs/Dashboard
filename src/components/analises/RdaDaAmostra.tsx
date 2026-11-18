import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Disc, FlaskConical, Gauge, Layers, RotateCw, Thermometer } from "lucide-react";
import { GraficoRda } from "../charts/GraficoRda";
import { Aviso, Carregando, Cartao, Valor } from "../ui/base";
import { useConsulta } from "../../hooks/useConsulta";
import { supabase } from "../../lib/supabase";
import { pontosComparacao } from "../../servicos/literatura";
import { fmt } from "../../utils/formatacao";

interface LinhaAnaliseRda {
  id: number;
  amostra_id: string;
  amostra: string;
  litologia: string;
  projeto_id: string;
  id_sistema: string;
  nome_sistema: string;
  acido: string;
  conc_valor: number | null;
  conc_unidade: string | null;
  conc_m: number | null;
  conc_pct: number | null;
  aditivos: string | null;
  temperatura_c: number | null;
  temperatura_nominal_c: number | null;
  pressao_psi: number | null;
  rotacao_rpm: number | null;
  omega_rad_s: number | null;
  raiz_omega: number | null;
  dim_h_in: number | null;
  dim_d_in: number | null;
  volume_acido_ml: number | null;
  taxa_reacao_mol_cm2_s: number | null;
  taxa_reacao_mol_m2_s: number | null;
  metodo_quantificacao: string | null;
  serie: string | null;
  tipo_variavel: string | null;
  texto_utilizacao: string | null;
  observacoes: string | null;
  situacao: string | null;
}

async function listarRdaLaboratorio(litologia?: string): Promise<LinhaAnaliseRda[]> {
  let q = supabase.from("v_analise_rda").select("*").order("rotacao_rpm", { ascending: true }).order("amostra", { ascending: true });
  if (litologia) q = q.eq("litologia", litologia);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaAnaliseRda[];
}

// Ficha da amostra › 5. RDA:
// Mostra de forma prática e direta os dados vinculados do Excel desta amostra, os discos irmãos
// da mesma condição experimental (série de rotações) e o gráfico de comparação com a mesma rocha.
export function RdaDaAmostra({
  codigo,
  projetoId,
  litologia,
}: {
  codigo?: string;
  projetoId?: string;
  litologia?: string;
}) {
  const navigate = useNavigate();
  const rdaLab = useConsulta(() => listarRdaLaboratorio(litologia), [litologia]);
  const pontos = useConsulta(() => pontosComparacao(litologia ? { litologias: [litologia] } : {}), [litologia]);

  const meuEnsaio = useMemo(
    () => (rdaLab.dados ?? []).find((r) => r.amostra === codigo) ?? null,
    [rdaLab.dados, codigo],
  );

  // Discos irmãos da mesma série / mesma condição (mesmo sistema ácido e mesma temperatura)
  const discosDaMesmaCondicao = useMemo(() => {
    if (!meuEnsaio) return [];
    return (rdaLab.dados ?? []).filter((r) => {
      if (meuEnsaio.serie && r.serie === meuEnsaio.serie) return true;
      return (
        r.id_sistema === meuEnsaio.id_sistema &&
        (r.temperatura_c ?? null) === (meuEnsaio.temperatura_c ?? null)
      );
    });
  }, [rdaLab.dados, meuEnsaio]);

  const { meusPontos, literaturaPontos } = useMemo(() => {
    const todos = pontos.dados ?? [];
    const meus = todos.filter(
      (p) => p.fonte === "lcpetro" && (!codigo || p.rotulo === codigo || (!projetoId || p.projeto_id === projetoId)),
    );
    const acidoAlvo = meuEnsaio?.acido?.toLowerCase();
    const lit = todos.filter(
      (p) => p.fonte === "literatura" && (!acidoAlvo || p.acido?.toLowerCase() === acidoAlvo),
    );
    return { meusPontos: meus, literaturaPontos: lit.length > 0 ? lit : todos.filter((p) => p.fonte === "literatura") };
  }, [pontos.dados, codigo, projetoId, meuEnsaio]);

  if (rdaLab.carregando && !rdaLab.dados) return <Carregando />;

  const modalidade =
    meuEnsaio?.volume_acido_ml != null && meuEnsaio?.rotacao_rpm == null
      ? "Dissolução Estática (D.E)"
      : /fluxo\s+reativo/i.test(meuEnsaio?.texto_utilizacao ?? "")
        ? "Fluxo Reativo"
        : "Disco Rotativo (RDA)";

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Resumo prático dos dados da planilha vinculados a esta amostra */}
      {meuEnsaio && (
        <Cartao
          titulo={`Dados Vinculados da Planilha — Disco ${meuEnsaio.amostra}`}
          subtitulo={
            meuEnsaio.texto_utilizacao
              ? `Registro da planilha: "${meuEnsaio.texto_utilizacao}"`
              : "Parâmetros operacionais vinculados diretamente à amostra"
          }
          icone={<FlaskConical size={18} />}
          acoes={
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag tag-blue">{modalidade}</span>
              {meuEnsaio.observacoes && (
                <span className="tag tag-orange">{meuEnsaio.observacoes}</span>
              )}
              <span
                className={`tag ${
                  meuEnsaio.taxa_reacao_mol_cm2_s != null ? "tag-solid" : "tag-orange"
                }`}
              >
                {meuEnsaio.taxa_reacao_mol_cm2_s != null ? "Com taxa medida" : "Aguardando taxa"}
              </span>
            </div>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 p-6">
            <Valor rotulo="Sistema Ácido" destaque>
              {meuEnsaio.id_sistema} — {meuEnsaio.nome_sistema}
            </Valor>
            <Valor rotulo="Ácido & Concentração">
              {meuEnsaio.acido}
              {meuEnsaio.conc_pct != null ? ` · ${fmt(meuEnsaio.conc_pct, 2)} wt%` : ""}
              {meuEnsaio.conc_m != null ? ` (${fmt(meuEnsaio.conc_m, 2)} M)` : ""}
            </Valor>
            <Valor rotulo="Temperatura" destaque>
              {meuEnsaio.temperatura_c != null ? `${fmt(meuEnsaio.temperatura_c, 1)} °C` : "—"}
            </Valor>
            {meuEnsaio.rotacao_rpm != null ? (
              <>
                <Valor rotulo="Rotação (ω)" destaque>
                  {fmt(meuEnsaio.rotacao_rpm, 0)} rpm
                </Valor>
                <Valor rotulo="Velocidade Angular" calculado>
                  {meuEnsaio.omega_rad_s != null ? `${fmt(meuEnsaio.omega_rad_s, 2)} rad/s` : "—"}
                </Valor>
                <Valor rotulo="√ω (Levich)" destaque calculado>
                  {meuEnsaio.raiz_omega != null ? `${fmt(meuEnsaio.raiz_omega, 3)} (rad/s)^0,5` : "—"}
                </Valor>
              </>
            ) : (
              <>
                <Valor rotulo="Volume de Ácido" destaque>
                  {meuEnsaio.volume_acido_ml != null ? `${fmt(meuEnsaio.volume_acido_ml, 0)} mL` : "—"}
                </Valor>
                <Valor rotulo="Dimensões do Disco">
                  {meuEnsaio.dim_d_in != null && meuEnsaio.dim_h_in != null
                    ? `Ø ${fmt(meuEnsaio.dim_d_in, 2)} × ${fmt(meuEnsaio.dim_h_in, 2)} in`
                    : "—"}
                </Valor>
                <Valor rotulo="Série Experimental">
                  {meuEnsaio.serie ?? "—"}
                </Valor>
              </>
            )}
          </div>
        </Cartao>
      )}

      {/* 2. Série de rotações / discos irmãos da mesma condição no laboratório */}
      {discosDaMesmaCondicao.length > 1 && (
        <Cartao
          titulo={`Discos da Mesma Condição Experimental (${discosDaMesmaCondicao.length} discos)`}
          subtitulo={`${meuEnsaio?.serie ?? `${meuEnsaio?.nome_sistema} · ${fmt(meuEnsaio?.temperatura_c, 0)} °C`} — clique em qualquer disco para abrir a ficha dele`}
          icone={<Layers size={18} />}
        >
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {discosDaMesmaCondicao.map((d) => {
              const ehEste = d.amostra === codigo;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => !ehEste && navigate(`/amostras/${d.amostra_id}`)}
                  className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                    ehEste
                      ? "border-[var(--color-orange)] bg-[var(--color-orange-50)]/60 ring-1 ring-[var(--color-orange)]"
                      : "border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading font-extrabold text-[15px] text-[var(--color-red)] flex items-center gap-1.5">
                      <Disc size={14} /> {d.amostra}
                    </span>
                    {ehEste ? (
                      <span className="tag tag-orange !text-[10px]">Atual</span>
                    ) : d.observacoes ? (
                      <span className="tag tag-neutral !text-[10px]">{d.observacoes}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[12px] font-semibold text-[var(--color-blue-800)]">
                    {d.rotacao_rpm != null ? (
                      <span className="flex items-center gap-1">
                        <RotateCw size={12} /> {fmt(d.rotacao_rpm, 0)} rpm
                      </span>
                    ) : d.volume_acido_ml != null ? (
                      <span>{fmt(d.volume_acido_ml, 0)} mL</span>
                    ) : null}
                    {d.temperatura_c != null && (
                      <span className="flex items-center gap-1 text-[var(--color-neutral-600)]">
                        <Thermometer size={12} /> {fmt(d.temperatura_c, 0)} °C
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11px] text-[var(--color-neutral-500)] tabular-nums">
                    {d.taxa_reacao_mol_cm2_s != null ? (
                      <span className="font-semibold text-[var(--color-blue)]">
                        Taxa: {fmt(d.taxa_reacao_mol_cm2_s, 3, true)} mol/cm²·s
                      </span>
                    ) : d.raiz_omega != null ? (
                      <span>√ω = {fmt(d.raiz_omega, 3)} (rad/s)^0,5</span>
                    ) : (
                      <span>{d.nome_sistema}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Cartao>
      )}

      {/* 3. Comparação gráfica (Levich: Taxa × √ω) com a literatura da mesma rocha */}
      <Cartao
        titulo="Comparação de Taxa de Reação (Gráfico de Levich: Taxa × √ω)"
        subtitulo={
          litologia
            ? `Ensaios com ${litologia}${meuEnsaio?.acido ? ` e ${meuEnsaio.acido}` : ""}`
            : "Comparação dos ensaios do laboratório com a literatura da mesma rocha"
        }
        icone={<Gauge size={18} />}
      >
        <div className="p-6 flex flex-col gap-4">
          {pontos.carregando && !pontos.dados ? (
            <Carregando />
          ) : pontos.erro ? (
            <Aviso tipo="erro">{pontos.erro}</Aviso>
          ) : literaturaPontos.length === 0 && meusPontos.length === 0 ? (
            <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">
              Nenhuma medida com taxa de reação lançada para plotar no gráfico de Levich desta rocha.
            </p>
          ) : (
            <>
              {meusPontos.length === 0 && (
                <Aviso tipo="info">
                  As condições deste disco ({meuEnsaio ? `${meuEnsaio.nome_sistema}${meuEnsaio.temperatura_c != null ? ` · ${fmt(meuEnsaio.temperatura_c, 0)} °C` : ""}${meuEnsaio.rotacao_rpm != null ? ` · ${fmt(meuEnsaio.rotacao_rpm, 0)} rpm` : ""}` : "da planilha"}) já estão vinculadas acima. Assim que a taxa de reação for medida e lançada, o ponto desta amostra aparecerá destacado sobre a curva abaixo.
                </Aviso>
              )}
              <GraficoRda pontos={[...literaturaPontos, ...meusPontos]} destacarRotulo={codigo} altura={380} />
            </>
          )}
        </div>
      </Cartao>
    </div>
  );
}
