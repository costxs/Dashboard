import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Simbolos } from "../ui/Simbolos";
import { fmt } from "../../utils/formatacao";
import type { DadoLiteraturaRda } from "../../tipos/banco";

// Medidas da literatura agrupadas, em vez de uma lista corrida como no Excel.
// Cada grupo mostra num cabeçalho o que é comum às suas medidas (rocha, ácido,
// temperatura...) e um resumo (nº de medidas, faixa de rpm e de taxa, mini-gráfico).
// As linhas só aparecem ao abrir o grupo, e só com o que varia dentro dele.

export type Agrupamento = "serie" | "referencia" | "litologia" | "acido" | "temperatura" | "cadastro" | "publicacao";

const AGRUPAMENTOS: [Agrupamento, string][] = [
  ["serie", "Série de ensaio"],
  ["referencia", "Referência"],
  ["litologia", "Litotipo"],
  ["acido", "Ácido"],
  ["temperatura", "Temperatura"],
  ["cadastro", "Data de cadastro"],
  ["publicacao", "Ano da publicação"],
];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface Grupo {
  chave: string;
  titulo: string;
  subtitulo?: string;
  ordem: string | number;
  linhas: DadoLiteraturaRda[];
}

const conc = (d: DadoLiteraturaRda) =>
  d.conc_valor != null ? `${d.acido} ${fmt(d.conc_valor, 3)} ${d.conc_unidade ?? ""}`.trim() : d.acido;
const temp = (t: number | null) => (t == null ? "T não informada" : `${fmt(t, 1)} °C`);

function chaveDe(d: DadoLiteraturaRda, a: Agrupamento): Omit<Grupo, "linhas"> {
  switch (a) {
    case "serie":
      return {
        chave: `${d.id_referencia}|${d.id_rocha}|${d.id_sistema}|${d.temperatura_c}|${d.pressao_psi}`,
        titulo: `${d.litologia} · ${conc(d)} · ${temp(d.temperatura_c)}`,
        subtitulo: `${d.id_referencia} · ${d.referencia_autor}${d.ano ? ` (${d.ano})` : ""} · rocha ${d.id_rocha}${d.pressao_psi != null ? ` · ${fmt(d.pressao_psi, 0)} psi` : ""}`,
        ordem: `${d.id_referencia}|${d.litologia}|${d.acido}|${String(d.temperatura_c ?? 0).padStart(6, "0")}`,
      };
    case "referencia":
      return { chave: d.id_referencia, titulo: `${d.referencia_autor}${d.ano ? ` (${d.ano})` : ""}`, subtitulo: d.id_referencia, ordem: d.id_referencia };
    case "litologia":
      return { chave: d.litologia, titulo: d.litologia, ordem: d.litologia };
    case "acido":
      return { chave: d.acido, titulo: d.acido, ordem: d.acido };
    case "temperatura":
      return { chave: String(d.temperatura_nominal_c), titulo: d.temperatura_nominal_c == null ? "Temperatura não informada" : `${d.temperatura_nominal_c} °C (nominal)`, ordem: d.temperatura_nominal_c ?? 9999 };
    case "cadastro": {
      if (!d.criado_em) return { chave: "?", titulo: "Sem data de cadastro", ordem: "0" };
      const dt = new Date(d.criado_em);
      const ano = dt.getFullYear(), mes = dt.getMonth();
      return { chave: `${ano}-${mes}`, titulo: `Cadastrados em ${MESES[mes]}/${ano}`, ordem: `${ano}-${String(mes).padStart(2, "0")}` };
    }
    case "publicacao":
      return { chave: String(d.ano), titulo: d.ano ? `Publicados em ${d.ano}` : "Ano não informado", ordem: d.ano ?? 0 };
  }
}

// mais recentes primeiro para datas; ordem alfabética/numérica para o resto
const DECRESCENTE: Agrupamento[] = ["cadastro", "publicacao"];

function agrupar(linhas: DadoLiteraturaRda[], a: Agrupamento): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const d of linhas) {
    const k = chaveDe(d, a);
    const g = m.get(k.chave) ?? { ...k, linhas: [] };
    g.linhas.push(d);
    m.set(k.chave, g);
  }
  const grupos = [...m.values()];
  // dentro do grupo: série por série, e em cada série por rotação
  const serie = (d: DadoLiteraturaRda) => String(chaveDe(d, "serie").ordem) + chaveDe(d, "serie").chave;
  for (const g of grupos) g.linhas.sort((x, y) => serie(x).localeCompare(serie(y)) || (x.rotacao_rpm ?? 0) - (y.rotacao_rpm ?? 0) || x.id_ensaio.localeCompare(y.id_ensaio));
  const dir = DECRESCENTE.includes(a) ? -1 : 1;
  return grupos.sort((x, y) => (x.ordem < y.ordem ? -dir : x.ordem > y.ordem ? dir : 0));
}

// ---------------------------------------------------------------------------
export function MedidasAgrupadas({ linhas, agrupamento, onAgrupamento }: {
  linhas: DadoLiteraturaRda[]; agrupamento: Agrupamento; onAgrupamento: (a: Agrupamento) => void;
}) {
  const grupos = useMemo(() => agrupar(linhas, agrupamento), [linhas, agrupamento]);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const todosAbertos = grupos.length > 0 && grupos.every((g) => abertos.has(g.chave));
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="px-6 pb-5">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-neutral-600)] mr-1">Agrupar por</span>
        {AGRUPAMENTOS.map(([k, r]) => (
          <button key={k} onClick={() => { onAgrupamento(k); setAbertos(new Set()); }}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${agrupamento === k
              ? "bg-[var(--color-orange)] border-[var(--color-orange)] text-white"
              : "bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)] hover:border-[var(--color-orange)] hover:text-[#a85200]"}`}>
            {r}
          </button>
        ))}
        <span className="flex-1" />
        {grupos.length > 0 && (
          <button className="btn btn-secondary !py-1.5" onClick={() => setAbertos(todosAbertos ? new Set() : new Set(grupos.map((g) => g.chave)))}>
            {todosAbertos ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />} {todosAbertos ? "Recolher todos" : "Abrir todos"}
          </button>
        )}
      </div>

      <p className="m-0 mb-3 text-[12px] text-[var(--color-neutral-600)]">
        <strong className="text-[var(--color-blue-800)]">{grupos.length}</strong> grupo(s) · <strong className="text-[var(--color-blue-800)]">{linhas.length}</strong> medida(s).
        {agrupamento === "serie" && " Cada série é uma curva de Levich: mesma rocha, mesmo ácido e mesma temperatura, variando a rotação."}
      </p>

      {!grupos.length && <p className="py-8 m-0 text-center text-[13px] text-[var(--color-neutral-600)]">Nenhuma medida com esses filtros.</p>}

      <div className="flex flex-col gap-2.5">
        {grupos.map((g) => <CartaoGrupo key={g.chave} g={g} agrupamento={agrupamento} aberto={abertos.has(g.chave)} onAlternar={() => alternar(g.chave)} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CartaoGrupo({ g, agrupamento, aberto, onAlternar }: { g: Grupo; agrupamento: Agrupamento; aberto: boolean; onAlternar: () => void }) {
  const taxas = g.linhas.map((l) => l.taxa_reacao_mol_m2_s).filter((v): v is number => v != null && v > 0);
  const rpms = g.linhas.map((l) => l.rotacao_rpm).filter((v): v is number => v != null);
  const unicos = (f: (d: DadoLiteraturaRda) => string) => [...new Set(g.linhas.map(f))];
  const obtencoes = unicos((l) => l.obtencao_dado ?? "—");
  // etiquetas do que varia dentro do grupo (o que é igual já está no título)
  const etiquetas: string[] = [];
  if (agrupamento !== "serie") {
    if (agrupamento !== "referencia") { const r = unicos((l) => l.id_referencia); etiquetas.push(r.length === 1 ? r[0] : `${r.length} referências`); }
    if (agrupamento !== "litologia") { const r = unicos((l) => l.litologia); etiquetas.push(r.length === 1 ? r[0] : `${r.length} litotipos`); }
    if (agrupamento !== "acido") { const r = unicos((l) => l.acido); etiquetas.push(r.length === 1 ? r[0] : `${r.length} ácidos`); }
    if (agrupamento !== "temperatura") {
      const r = [...new Set(g.linhas.map((l) => l.temperatura_nominal_c).filter((t): t is number => t != null))].sort((a, b) => a - b);
      if (r.length) etiquetas.push(r.length === 1 ? `${r[0]} °C` : `${r[0]}–${r[r.length - 1]} °C`);
    }
  }

  return (
    <div className={`border rounded-[12px] bg-white transition-shadow ${aberto ? "border-[var(--color-blue-200)] shadow-sm" : "border-[var(--color-neutral-300)]"}`}>
      <button onClick={onAlternar} className="w-full text-left flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 hover:bg-[var(--color-neutral-50,#f8fafc)] rounded-[12px]">
        <span className="text-[var(--color-blue)]">{aberto ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
        <div className="flex-1 min-w-[260px]">
          <div className="text-[14px] font-bold text-[var(--color-blue-800)]">{g.titulo}</div>
          {g.subtitulo && <div className="mt-0.5 text-[12px] text-[var(--color-neutral-600)]">{g.subtitulo}</div>}
          {etiquetas.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">{etiquetas.map((e) => <span key={e} className="tag tag-neutral">{e}</span>)}</div>
          )}
        </div>
        <Resumo rotulo="medidas" valor={String(g.linhas.length)} />
        <Resumo rotulo="rotação (rpm)" valor={rpms.length ? (Math.min(...rpms) === Math.max(...rpms) ? fmt(rpms[0], 0) : `${fmt(Math.min(...rpms), 0)}–${fmt(Math.max(...rpms), 0)}`) : "—"} />
        <Resumo rotulo="taxa (mol/m²·s)" valor={taxas.length ? (taxas.length === 1 ? fmt(taxas[0], 2, true) : `${fmt(Math.min(...taxas), 2, true)} a ${fmt(Math.max(...taxas), 2, true)}`) : "—"} />
        {agrupamento === "serie"
          ? <MiniLevich linhas={g.linhas} />
          : <Resumo rotulo="séries de ensaio" valor={String(new Set(g.linhas.map((l) => chaveDe(l, "serie").chave)).size)} />}
        <div className="flex flex-col gap-1 min-w-[110px]">
          {obtencoes.map((o) => <span key={o} className={`tag ${o === "lido de gráfico" ? "tag-orange" : "tag-blue"} justify-center`}>{o}</span>)}
        </div>
      </button>
      {aberto && <TabelaGrupo linhas={g.linhas} agrupamento={agrupamento} />}
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-[90px]">
      <div className="font-heading font-bold text-[15px] text-[var(--color-blue-800)] tabular-nums whitespace-nowrap">{valor}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--color-neutral-600)]"><Simbolos>{rotulo}</Simbolos></div>
    </div>
  );
}

/** Mini-gráfico taxa (log) × √ω do grupo, só para ver a tendência. */
function MiniLevich({ linhas }: { linhas: DadoLiteraturaRda[] }) {
  const pts = linhas
    .filter((l) => l.raiz_omega != null && l.taxa_reacao_mol_m2_s != null && l.taxa_reacao_mol_m2_s > 0)
    .map((l) => ({ x: l.raiz_omega as number, y: Math.log10(l.taxa_reacao_mol_m2_s as number) }))
    .sort((a, b) => a.x - b.x);
  const L = 120, A = 36, m = 4;
  if (pts.length < 2) return <div className="w-[120px] text-center text-[11px] text-[var(--color-neutral-500)]">{pts.length ? "1 ponto" : "sem √ω"}</div>;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const px = (x: number) => m + ((x - x0) / (x1 - x0 || 1)) * (L - 2 * m);
  const py = (y: number) => A - m - ((y - y0) / (y1 - y0 || 1)) * (A - 2 * m);
  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} aria-label="tendência da taxa com √ω">
      <rect x="0" y="0" width={L} height={A} rx="6" fill="#f1f5fb" />
      <polyline fill="none" stroke="#2a78d6" strokeWidth="1.5" strokeOpacity="0.55" points={pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} />
      {pts.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2.6" fill="#2a78d6" />)}
    </svg>
  );
}

function TabelaGrupo({ linhas, agrupamento }: { linhas: DadoLiteraturaRda[]; agrupamento: Agrupamento }) {
  // na série, rocha/ácido/T já estão no título: mostra só o que varia
  const cols: [string, string, (l: DadoLiteraturaRda) => unknown, boolean?][] = [
    ["ens", "Ensaio", (l) => l.id_ensaio],
    ...(agrupamento === "serie" ? [] : [
      ["ref", "Referência", (l: DadoLiteraturaRda) => l.id_referencia],
      ["lit", "Litotipo", (l: DadoLiteraturaRda) => `${l.litologia} (${l.id_rocha})`],
      ["aci", "Ácido", (l: DadoLiteraturaRda) => conc(l)],
      ["t", "T (°C)", (l: DadoLiteraturaRda) => l.temperatura_c],
    ] as [string, string, (l: DadoLiteraturaRda) => unknown][]),
    ["rpm", "rpm", (l) => l.rotacao_rpm],
    ["rw", "√ω", (l) => l.raiz_omega],
    ["tx1", "Taxa (mol/cm²·s)", (l) => l.taxa_reacao_mol_cm2_s, true],
    ["tx2", "Taxa (mol/m²·s)", (l) => l.taxa_reacao_mol_m2_s, true],
    ["obt", "Obtenção", (l) => l.obtencao_dado],
  ];
  return (
    <div className="border-t border-[var(--color-neutral-300)] px-4 pb-2 overflow-x-auto">
      <table className="table text-[12px]">
        <thead><tr>{cols.map(([k, r]) => <th key={k}><Simbolos>{r}</Simbolos></th>)}</tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id_ensaio} className="lcp-row">
              {cols.map(([k, , f, c]) => <td key={k} className={`!py-1.5 tabular-nums whitespace-nowrap ${k === "ens" ? "font-bold text-[var(--color-blue-800)]" : ""}`}>{fmt(f(l), 3, c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
