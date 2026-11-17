import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Campo as CampoCfg, ConfigAnalise } from "../../config/analises";
import { useConsulta } from "../../hooks/useConsulta";
import { listarSistemasAcidos } from "../../servicos/amostras";
import { listarFilhos, salvarFilhos, salvarRegistro } from "../../servicos/analises";
import type { RegistroAnalise } from "../../tipos/banco";
import { Aviso, Campo } from "../ui/base";
import { mensagemErro, paraNumero } from "../../utils/formatacao";

type Valores = Record<string, string>;

// Formulário único para as 8 análises: os campos vêm de config/analises.ts.
// Números aceitam vírgula e notação científica (5,2e-7). Os valores calculados
// (ω, perda de massa, razão ΔP…) não aparecem aqui: o banco calcula ao salvar.
export function FormularioAnalise(p: {
  cfg: ConfigAnalise; amostraId: string; registro?: RegistroAnalise;
  aoSalvar: (r: RegistroAnalise) => void; aoCancelar: () => void;
}) {
  const { cfg } = p;
  const [v, setV] = useState<Valores>(() => valoresIniciais(cfg, p.registro));
  const [filhos, setFilhos] = useState<Valores[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const precisaSistemas = cfg.campos.some((c) => c.tipo === "sistema");
  const sistemas = useConsulta(() => (precisaSistemas ? listarSistemasAcidos() : Promise.resolve([])), [precisaSistemas]);

  useEffect(() => {
    setV(valoresIniciais(cfg, p.registro));
    if (cfg.filha && p.registro) {
      listarFilhos(cfg, p.registro.id).then((ls) =>
        setFilhos(ls.map((l) => Object.fromEntries(Object.entries(l).map(([k, x]) => [k, x == null ? "" : String(x)])))));
    } else {
      setFilhos(cfg.filha ? [{}] : []);
    }
  }, [cfg, p.registro]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const dados: Record<string, unknown> = {};
    for (const c of cfg.campos) {
      const bruto = v[c.nome] ?? "";
      const r = converter(c, bruto);
      if (r === "invalido") { setErro(`${c.rotulo}: "${bruto}" não é um número válido.`); return; }
      if (c.obrigatorio && (r == null || r === "")) { setErro(`${c.rotulo} é obrigatório.`); return; }
      dados[c.nome] = r;
    }
    const linhasFilhas: Record<string, unknown>[] = [];
    if (cfg.filha) {
      for (const f of filhos) {
        const linha: Record<string, unknown> = {};
        for (const c of cfg.filha.campos) {
          const r = converter(c, f[c.nome] ?? "");
          if (r === "invalido") { setErro(`${cfg.filha.titulo} — ${c.rotulo}: "${f[c.nome]}" não é número.`); return; }
          linha[c.nome] = r;
        }
        linhasFilhas.push(linha);
      }
    }
    setSalvando(true);
    try {
      const salvo = await salvarRegistro(cfg, p.amostraId, dados, p.registro?.id);
      if (cfg.filha) await salvarFilhos(cfg, salvo.id, linhasFilhas);
      p.aoSalvar(salvo);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  const set = (nome: string, valor: string) => setV((x) => ({ ...x, [nome]: valor }));
  const somaPct = filhos.reduce((s, f) => s + (Number(String(f.pct ?? "").replace(",", ".")) || 0), 0);

  return (
    <form onSubmit={enviar} className="cartao">
      <div className="cartao-topo">
        <div>
          <h2>{p.registro ? "Editar registro" : "Novo registro"} — {cfg.numero}. {cfg.titulo}</h2>
          <p>Números aceitam vírgula e notação científica (ex.: 5,2e-7). Campos com * são obrigatórios.</p>
        </div>
      </div>
      <div className="p-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {cfg.campos.filter((c) => c.tipo !== "textoLongo").map((c) => (
            <Campo key={c.nome} rotulo={c.rotulo} unidade={c.unidade} obrigatorio={c.obrigatorio} ajuda={c.ajuda}>
              <Entrada campo={c} valor={v[c.nome] ?? ""} aoMudar={(x) => set(c.nome, x)}
                sistemas={sistemas.dados?.map((s) => ({ valor: s.id_sistema, texto: `${s.id_sistema} — ${s.nome_sistema}` }))} />
            </Campo>
          ))}
        </div>
        {cfg.campos.filter((c) => c.tipo === "textoLongo").map((c) => (
          <Campo key={c.nome} rotulo={c.rotulo}>
            <textarea className="input" rows={3} value={v[c.nome] ?? ""} onChange={(e) => set(c.nome, e.target.value)} />
          </Campo>
        ))}

        {cfg.filha && (
          <div className="rounded-xl border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--color-blue-800)]">{cfg.filha.titulo}</p>
              {filhos.some((f) => f.pct) && (
                <span className={`text-[12px] font-semibold ${Math.abs(somaPct - 100) > 1 ? "text-[var(--color-orange-700)]" : "text-[var(--color-blue-700)]"}`}>
                  Soma: {somaPct.toLocaleString("pt-BR")}%
                </span>
              )}
            </div>
            {filhos.map((f, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                {cfg.filha!.campos.map((c) => (
                  <Campo key={c.nome} rotulo={c.rotulo} unidade={c.unidade} className="w-40">
                    <input className="input !py-2" value={f[c.nome] ?? ""} inputMode={c.tipo === "numero" ? "decimal" : undefined}
                      onChange={(e) => setFilhos((fs) => fs.map((x, j) => (j === i ? { ...x, [c.nome]: e.target.value } : x)))} />
                  </Campo>
                ))}
                <button type="button" title="Remover linha" className="mb-2 p-1.5 text-[var(--color-neutral-500)] hover:text-[var(--color-red)]"
                  onClick={() => setFilhos((fs) => fs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary w-fit" onClick={() => setFilhos((fs) => [...fs, {}])}>
              <Plus size={14} /> Adicionar linha
            </button>
          </div>
        )}

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="btn btn-secondary" onClick={p.aoCancelar}>Cancelar</button>
        </div>
      </div>
    </form>
  );
}

function Entrada(p: { campo: CampoCfg; valor: string; aoMudar: (v: string) => void; sistemas?: { valor: string; texto: string }[] }) {
  const { campo: c } = p;
  if (c.tipo === "lista" || c.tipo === "sistema" || c.tipo === "booleano") {
    const opcoes = c.tipo === "lista" ? (c.opcoes ?? []).map((o) => ({ valor: o, texto: o }))
      : c.tipo === "sistema" ? p.sistemas ?? []
      : [{ valor: "true", texto: "sim" }, { valor: "false", texto: "não" }];
    return (
      <select className="input" value={p.valor} onChange={(e) => p.aoMudar(e.target.value)}>
        <option value="">—</option>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    );
  }
  if (c.tipo === "data") return <input className="input" type="date" value={p.valor} onChange={(e) => p.aoMudar(e.target.value)} />;
  // número como texto: aceita vírgula e 5,2e-7, que o <input type="number"> recusa em pt-BR
  return <input className="input" value={p.valor} onChange={(e) => p.aoMudar(e.target.value)} inputMode={c.tipo === "numero" ? "decimal" : undefined} />;
}

function valoresIniciais(cfg: ConfigAnalise, reg?: RegistroAnalise): Valores {
  const v: Valores = {};
  for (const c of cfg.campos) {
    const x = reg?.[c.nome];
    v[c.nome] = x == null ? (c.nome === "momento" && cfg.chave !== "mev" ? "antes" : "") : String(x);
  }
  return v;
}

function converter(c: CampoCfg, bruto: string): unknown | "invalido" {
  const s = bruto.trim();
  if (s === "") return null;
  if (c.tipo === "numero") {
    const n = paraNumero(s);
    return Number.isNaN(n) ? "invalido" : n;
  }
  if (c.tipo === "booleano") return s === "true";
  return s;
}
