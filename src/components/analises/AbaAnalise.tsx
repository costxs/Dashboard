import { useEffect, useState, type ReactNode } from "react";
import { Simbolos } from "../ui/Simbolos";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { rotuloColuna, type ConfigAnalise } from "../../config/analises";
import { useConsulta } from "../../hooks/useConsulta";
import type { ControleDaAmostra } from "../../servicos/amostras";
import { apagarRegistro, listarFilhos, listarRegistros } from "../../servicos/analises";
import { condicoesRdaDoControle, descreverCondicoes, marcasDeCoreflooding } from "../../utils/controleRochas";
import type { RegistroAnalise } from "../../tipos/banco";
import { EmptyState } from "../EmptyState";
import { Aviso, Carregando, Valor } from "../ui/base";
import { fmt, fmtData } from "../../utils/formatacao";
import { AcidificacaoFases } from "./AcidificacaoFases";
import { Arquivos } from "./Arquivos";
import { Curvas } from "./Curvas";
import { FormularioAnalise } from "./FormularioAnalise";

// Uma aba da ficha da amostra (serve para as 8 análises).
// Lista os registros; o selecionado mostra valores, calculados, composição, curvas e arquivos.
export function AbaAnalise(p: {
  cfg: ConfigAnalise; amostraId: string; podeEditar: boolean; aoMudar?: () => void;
  /** finalidade e status da amostra + observações do controle de rochas: aparecem quando a aba está vazia */
  amostra?: { finalidade?: string | null; status?: string | null; codigo?: string | null; comprimento_cm?: number | null; diametro_cm?: number | null };
  controle?: ControleDaAmostra | null;
  /** bloco próprio da análise, abaixo dos ensaios (ex.: comparação com a literatura) */
  extra?: ReactNode;
  /** bloco no topo da aba, mostrado mesmo sem registros (ex.: permeabilidade do coreflood) */
  antes?: ReactNode;
}) {
  const { cfg } = p;
  const registros = useConsulta(() => listarRegistros(cfg, p.amostraId), [cfg, p.amostraId]);
  const [selId, setSelId] = useState<number | null>(null);
  const [editando, setEditando] = useState<RegistroAnalise | "novo" | null>(null);

  useEffect(() => { setSelId(null); setEditando(null); }, [cfg.chave]);
  const selecionado = registros.dados?.find((r) => r.id === selId) ?? registros.dados?.[0] ?? null;

  if (editando) {
    return (
      <FormularioAnalise cfg={cfg} amostraId={p.amostraId} registro={editando === "novo" ? undefined : editando}
        aoCancelar={() => setEditando(null)}
        aoSalvar={(r) => { setEditando(null); registros.recarregar(); setSelId(r.id); p.aoMudar?.(); }} />
    );
  }
  if (registros.carregando && !registros.dados) return <Carregando />;
  if (registros.erro) return <Aviso tipo="erro">{registros.erro}</Aviso>;

  const valorCelula = (r: RegistroAnalise, col: string) => {
    if (col === "data_ensaio") return fmtData(r[col]);
    const calc = cfg.calculados?.find((c) => c.nome === col);
    return fmt(r[col], calc?.casas ?? 3, calc?.cientifico || col.startsWith("taxa_"));
  };

  if (!registros.dados?.length) {
    // aba vazia, mas o controle de rochas tem informação sobre este ensaio: mostra em vez do vazio genérico
    const condicoesRda = cfg.chave === "rda" ? condicoesRdaDoControle(p.controle?.observacoes) : null;
    const marcas = cfg.chave === "coreflooding" && p.amostra ? marcasDeCoreflooding(p.amostra, p.controle?.observacoes) : null;
    if (condicoesRda || marcas) {
      return (
        <div className="flex flex-col gap-4">
          {p.antes}
          <div className="aviso aviso-info flex items-start gap-2">
            <ClipboardList size={16} className="mt-0.5 shrink-0" />
            {condicoesRda ? (
              <span>
                Segundo o controle de rochas: <strong>{descreverCondicoes(condicoesRda)}</strong>. Resultado ainda não lançado.
              </span>
            ) : (
              <span>
                Amostra marcada como <strong>{marcas}</strong> no controle de rochas; resultado ainda não lançado.
                {p.controle?.temPetrofisicaDepois && " Há petrofísica depois da acidificação (aba 1. Petrofísica)."}
              </span>
            )}
          </div>
          {p.podeEditar && (
            <div><button className="btn btn-primary" onClick={() => setEditando("novo")}><Plus size={14} /> Lançar {cfg.titulo.toLowerCase()}</button></div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {p.antes}
        <EmptyState message={`Nenhum registro de ${cfg.titulo.toLowerCase()} para esta amostra.`}
        acao={p.podeEditar && <button className="btn btn-primary" onClick={() => setEditando("novo")}><Plus size={14} /> Lançar {cfg.titulo.toLowerCase()}</button>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {p.antes}
      <div className="cartao">
        <div className="cartao-topo">
          <div>
            <h2>{cfg.numero}. {cfg.titulo}</h2>
            <p>{registros.dados.length} registro(s) · clique numa linha para ver os detalhes</p>
          </div>
          {p.podeEditar && <button className="btn btn-primary" onClick={() => setEditando("novo")}><Plus size={14} /> Novo registro</button>}
        </div>
        <div className="px-6 py-2 overflow-x-auto">
          <table className="table text-[13px]">
            <thead>
              <tr>{cfg.colunasResumo.map((c) => <th key={c}><Simbolos>{rotuloColuna(cfg, c)}</Simbolos></th>)}</tr>
            </thead>
            <tbody>
              {registros.dados.map((r) => (
                <tr key={r.id} onClick={() => setSelId(r.id)}
                  className={`lcp-row cursor-pointer ${selecionado?.id === r.id ? "!bg-[var(--color-orange-50)] shadow-[inset_3px_0_0_var(--color-orange)]" : ""}`}>
                  {cfg.colunasResumo.map((c) => <td key={c} className="tabular-nums pl-2">{valorCelula(r, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selecionado && (
        <Detalhe cfg={cfg} r={selecionado} amostraId={p.amostraId} amostra={p.amostra} podeEditar={p.podeEditar}
          aoEditar={() => setEditando(selecionado)}
          aoApagar={async () => {
            if (!confirm("Apagar este registro, suas curvas e anexos?")) return;
            await apagarRegistro(cfg, selecionado.id);
            setSelId(null); registros.recarregar(); p.aoMudar?.();
          }} />
      )}

      {p.extra}
    </div>
  );
}

function Detalhe(p: {
  cfg: ConfigAnalise; r: RegistroAnalise; amostraId: string; podeEditar: boolean;
  amostra?: { codigo?: string | null; comprimento_cm?: number | null; diametro_cm?: number | null };
  aoEditar: () => void; aoApagar: () => void;
}) {
  const { cfg, r } = p;
  const filhos = useConsulta(() => (cfg.filha ? listarFilhos(cfg, r.id) : Promise.resolve([])), [cfg, r.id]);
  const preenchidos = cfg.campos.filter((c) => r[c.nome] != null && r[c.nome] !== "" && c.tipo !== "textoLongo");
  const textos = cfg.campos.filter((c) => c.tipo === "textoLongo" && r[c.nome]);

  return (
    <div className="flex flex-col gap-6">
      <div className="cartao">
        <div className="cartao-topo">
          <div>
            <h2>Registro {r.data_ensaio ? `de ${fmtData(r.data_ensaio)}` : `#${r.id}`}</h2>
            <p>Valores com ƒ são calculados pelo banco</p>
          </div>
          {p.podeEditar && (
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={p.aoEditar}><Pencil size={14} /> Editar</button>
              <button className="btn btn-danger" onClick={p.aoApagar}><Trash2 size={14} /> Apagar</button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-6 p-7">
          {preenchidos.map((c) => (
            <Valor key={c.nome} rotulo={rotuloColuna(cfg, c.nome)}>
              {c.tipo === "data" ? fmtData(r[c.nome])
                : c.tipo === "numero" ? fmt(r[c.nome], 4, c.nome.startsWith("taxa_") || c.nome.startsWith("coef_"))
                : fmt(r[c.nome])}
            </Valor>
          ))}
          {cfg.calculados?.map((k) => (
            <Valor key={k.nome} rotulo={rotuloColuna(cfg, k.nome)} destaque calculado>
              {fmt(r[k.nome], k.casas ?? 3, k.cientifico)}
            </Valor>
          ))}
        </div>
        {textos.map((c) => (
          <div key={c.nome} className="border-t border-[var(--color-neutral-300)] px-7 py-5 bg-[var(--color-blue-50)] last:rounded-b-[14px]">
            <p className="m-0 mb-2 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--color-blue-700)]">{c.rotulo}</p>
            <p className="m-0 text-[14px] text-[var(--color-neutral-800)] whitespace-pre-line">{String(r[c.nome])}</p>
          </div>
        ))}
      </div>

      {cfg.chave === "petrofisica" && r.metodo_k != null && (
        <Aviso tipo="info">Este k veio do tratamento de coreflood: as etapas de vazão, o ajuste ΔP × Q e os gráficos estão na aba 3. Coreflooding.</Aviso>
      )}
      {cfg.chave === "coreflooding" && <AcidificacaoFases r={r} />}

      {cfg.filha && !!filhos.dados?.length && (
        <div className="cartao">
          <div className="cartao-topo"><div><h2>{cfg.filha.titulo}</h2></div></div>
          <div className="p-6">
            <table className="table text-[14px]">
              <thead>
                <tr>
                  {cfg.filha.campos.map((c) => <th key={c.nome} className={c.tipo === "numero" ? "text-right" : ""}>{c.rotulo}{c.unidade ? ` (${c.unidade})` : ""}</th>)}
                  {cfg.filha.campos.some((c) => c.nome === "pct") && <th className="w-[200px]" />}
                </tr>
              </thead>
              <tbody>
                {filhos.dados.map((f, i) => (
                  <tr key={i} className="lcp-row">
                    {cfg.filha!.campos.map((c) => (
                      <td key={c.nome} className={c.tipo === "numero" ? "text-right tabular-nums" : "font-semibold"}>{fmt(f[c.nome])}</td>
                    ))}
                    {"pct" in f && (
                      <td>
                        <div className="h-[8px] w-full rounded-full bg-[var(--color-neutral-200)]">
                          <div className="h-full rounded-full bg-[var(--color-blue)]" style={{ width: `${Math.min(100, Number(f.pct) || 0)}%` }} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="cartao">
        <div className="cartao-topo"><div><h2>Curvas</h2><p>{cfg.curvas?.map((c) => c.nome).join(" · ") || "Qualquer curva x × y do ensaio"}</p></div></div>
        <div className="p-6"><Curvas cfg={cfg} amostraId={p.amostraId} analiseId={r.id} podeEditar={p.podeEditar} /></div>
      </div>

      <div className="cartao">
        <div className="cartao-topo"><div><h2>Arquivos e imagens</h2><p>.opju, PDF, imagens de lâmina, MEV, micro-CT…</p></div></div>
        <div className="p-6">
          <Arquivos amostraId={p.amostraId} pasta={cfg.pastaArquivos} analiseTabela={cfg.tabela} analiseId={r.id} podeEditar={p.podeEditar} />
        </div>
      </div>
    </div>
  );
}
