import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mountain, Drill } from "lucide-react";
import { Aviso, CabecalhoPagina, Campo } from "../components/ui/base";
import { mensagemErro, paraNumero } from "../utils/formatacao";
import { useConsulta } from "../hooks/useConsulta";
import { criarLitologia, listarLitologias, obterAmostraEditavel, salvarAmostra } from "../servicos/amostras";
import { listarProjetos } from "../servicos/contexto";
import { useContexto } from "../store/useContexto";
import type { Amostra, StatusAmostra, TipoOrigem } from "../tipos/banco";
import { STATUS_ROTULO } from "../utils/status";

type Rascunho = Partial<Record<keyof Amostra, string>>;

const NUMEROS: [keyof Amostra, string, string][] = [
  ["diametro_cm", "Diâmetro", "cm"],
  ["comprimento_cm", "Comprimento", "cm"],
  ["massa_seca_g", "Massa seca", "g"],
  // faixa do fabricante: "até" vazio = valor único (min = max)
  ["permeabilidade_fabricante_min_md", "k do fabricante — de", "mD"],
  ["permeabilidade_fabricante_max_md", "k do fabricante — até", "mD"],
];
const IGNORAR = new Set(["criado_em", "atualizado_em", "criado_por"]);

// Cadastro / edição de amostra. Os campos de origem mudam conforme o tipo:
// AFLORAMENTO (outcrop): local, fornecedor, bloco — TESTEMUNHO: bacia, campo, poço, reservatório, profundidade.
export function SampleFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const empresaId = useContexto((s) => s.empresaId);
  const projetoId = useContexto((s) => s.projetoId);
  const [r, setR] = useState<Rascunho>({ tipo_origem: "afloramento", status: "disponivel", projeto_id: projetoId ?? "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novaLitologia, setNovaLitologia] = useState("");
  const litologias = useConsulta(listarLitologias, []);
  const projetos = useConsulta(() => listarProjetos(empresaId ?? undefined), [empresaId]);

  useEffect(() => {
    if (!id) return;
    obterAmostraEditavel(id)
      .then((a) => setR(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v == null ? "" : String(v)])) as Rascunho))
      .catch((e) => setErro(mensagemErro(e)));
  }, [id]);

  const campo = (k: keyof Amostra) => ({
    className: "input", value: r[k] ?? "",
    onChange: (e: { target: { value: string } }) => setR((x) => ({ ...x, [k]: e.target.value })),
  });
  const origem = (r.tipo_origem ?? "afloramento") as TipoOrigem;

  async function adicionarLitologia() {
    const nome = novaLitologia.trim();
    if (!nome) return;
    try {
      await criarLitologia(nome);
      litologias.recarregar();
      setR((x) => ({ ...x, litologia: nome }));
      setNovaLitologia("");
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const dados: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (IGNORAR.has(k) || (k === "id" && !v)) continue;
      dados[k] = v === "" ? null : v;
    }
    for (const [k, rotulo] of [...NUMEROS.map(([k, l]) => [k, l] as const), ["profundidade_m", "Profundidade"] as const]) {
      if (r[k]) {
        const n = paraNumero(r[k]!);
        if (Number.isNaN(n)) { setErro(`${rotulo}: "${r[k]}" não é número.`); return; }
        dados[k] = n;
      }
    }
    const kDe = (dados.permeabilidade_fabricante_min_md ?? null) as number | null;
    const kAte = (dados.permeabilidade_fabricante_max_md ?? kDe) as number | null;
    if (kDe == null && kAte != null) { setErro('k do fabricante: preencha "de" (o "até" é opcional).'); return; }
    if (kDe != null && kAte != null && kDe > kAte) { setErro('k do fabricante: "de" precisa ser menor ou igual a "até".'); return; }
    dados.permeabilidade_fabricante_min_md = kDe;
    dados.permeabilidade_fabricante_max_md = kAte;
    // coluna antiga: só guarda valor único (mesma regra do importador)
    dados.permeabilidade_fabricante_md = kDe === kAte ? kDe : null;
    if (origem === "testemunho" && !r.poco) { setErro("Testemunho precisa do poço."); return; }
    setSalvando(true);
    try {
      const salva = await salvarAmostra(dados as Parameters<typeof salvarAmostra>[0]);
      navigate(`/amostras/${salva.id}`);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <CabecalhoPagina titulo={id ? `Editar amostra ${r.codigo ?? ""}` : "Nova amostra"}
        subtitulo="Os ensaios (petrofísica, coreflooding, RDA…) são lançados depois, nas abas da ficha da amostra." />

      <form onSubmit={enviar} className="px-7 pb-10 flex flex-col gap-6 max-w-5xl">
        <div className="cartao p-6 grid grid-cols-1 md:grid-cols-4 gap-5">
          <Campo rotulo="Código" obrigatorio><input {...campo("codigo")} required placeholder="IL076" /></Campo>
          <Campo rotulo="Projeto" obrigatorio>
            <select {...campo("projeto_id")} required>
              <option value="">Escolha…</option>
              {projetos.dados?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Litotipo" obrigatorio ajuda="Mesma lista usada na literatura">
            <select {...campo("litologia")} required>
              <option value="">Escolha…</option>
              {litologias.dados?.map((l) => <option key={l.nome}>{l.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Status">
            <select {...campo("status")}>
              {(Object.keys(STATUS_ROTULO) as StatusAmostra[]).map((s) => <option key={s} value={s}>{STATUS_ROTULO[s]}</option>)}
            </select>
          </Campo>
          <div className="md:col-span-4 flex items-end gap-2 text-[12px]">
            <span className="text-[var(--color-neutral-600)]">Litotipo não está na lista?</span>
            <input className="input !py-1.5 max-w-[240px]" placeholder="Nome do litotipo" value={novaLitologia} onChange={(e) => setNovaLitologia(e.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={adicionarLitologia} disabled={!novaLitologia.trim()}>Adicionar</button>
          </div>
        </div>

        <div className="cartao">
          <div className="cartao-topo"><div><h2>Origem da amostra</h2><p>Afloramento (outcrop) ou testemunho de poço</p></div></div>
          <div className="p-6 flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              {([["afloramento", "Afloramento", "outcrop, pedreira, fornecedor", Mountain], ["testemunho", "Testemunho", "poço, reservatório, bacia, campo", Drill]] as const).map(([valor, titulo, desc, Icone]) => (
                <button type="button" key={valor} onClick={() => setR((x) => ({ ...x, tipo_origem: valor }))}
                  className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${origem === valor
                    ? "border-[var(--color-orange)] bg-[var(--color-orange-50)]" : "border-[var(--color-neutral-200)] hover:border-[var(--color-blue-200)]"}`}>
                  <Icone size={20} className={origem === valor ? "text-[var(--color-orange-700)]" : "text-[var(--color-neutral-400)]"} />
                  <div>
                    <p className="m-0 font-semibold text-[var(--color-blue-800)]">{titulo}</p>
                    <p className="m-0 text-[12px] text-[var(--color-neutral-600)]">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {origem === "afloramento" ? (
                <>
                  <Campo rotulo="Local / pedreira" className="md:col-span-2"><input {...campo("afloramento_local")} placeholder="Bedford, Indiana" /></Campo>
                  <Campo rotulo="Fornecedor"><input {...campo("fornecedor")} /></Campo>
                  <Campo rotulo="Bloco"><input {...campo("bloco")} /></Campo>
                </>
              ) : (
                <>
                  <Campo rotulo="Bacia"><input {...campo("bacia")} /></Campo>
                  <Campo rotulo="Campo"><input {...campo("campo")} /></Campo>
                  <Campo rotulo="Poço" obrigatorio><input {...campo("poco")} /></Campo>
                  <Campo rotulo="Reservatório"><input {...campo("reservatorio")} /></Campo>
                  <Campo rotulo="Profundidade" unidade="m"><input {...campo("profundidade_m")} inputMode="decimal" /></Campo>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="cartao">
          <div className="cartao-topo"><div><h2>Geometria e dados gerais</h2><p>Números aceitam vírgula decimal</p></div></div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-5">
            {NUMEROS.map(([k, rotulo, un]) => (
              <Campo key={k} rotulo={rotulo} unidade={un}><input {...campo(k)} inputMode="decimal" /></Campo>
            ))}
            <Campo rotulo="Finalidade"><input {...campo("finalidade")} placeholder="coreflooding, RDA…" /></Campo>
            <Campo rotulo="Responsável"><input {...campo("responsavel")} /></Campo>
            <Campo rotulo="Data de coleta"><input {...campo("data_coleta")} type="date" /></Campo>
            <Campo rotulo="Observações" className="col-span-2 md:col-span-4"><textarea {...campo("observacoes")} rows={3} /></Campo>
          </div>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar amostra"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
