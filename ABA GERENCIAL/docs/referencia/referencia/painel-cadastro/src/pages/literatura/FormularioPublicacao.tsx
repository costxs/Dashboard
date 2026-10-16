import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Campo, Cartao } from "../../components/ui/base";
import { mensagemErro } from "../../utils/formatacao";
import { ANALISES } from "../../config/analises";
import { useConsulta } from "../../hooks/useConsulta";
import { listarAmostras } from "../../servicos/amostras";
import { listarProjetos } from "../../servicos/contexto";
import {
  amostrasDaPublicacao, enviarPdfPublicacao, ligarAmostras, proximoCodigoProprio, salvarPublicacao,
} from "../../servicos/literatura";
import { useContexto } from "../../store/useContexto";
import type { Publicacao } from "../../tipos/banco";

const TIPOS = ["artigo", "congresso", "dissertação", "tese", "TCC", "relatório"];

// Publicação PRÓPRIA do LC PETRO. Com projeto preenchido, só quem vê o projeto
// enxerga (ex.: relatório de WP para a operadora).
export function FormularioPublicacao(p: { publicacao?: Publicacao; aoSalvar: () => void; aoCancelar: () => void }) {
  const empresaId = useContexto((s) => s.empresaId);
  const [v, setV] = useState<Record<string, string>>({});
  const [amostras, setAmostras] = useState<string[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const projetos = useConsulta(() => listarProjetos(empresaId ?? undefined), [empresaId]);
  const listaAmostras = useConsulta(
    () => listarAmostras(v.projeto_id ? { projetoId: v.projeto_id } : { empresaId: empresaId ?? undefined }),
    [v.projeto_id, empresaId]);

  useEffect(() => {
    if (p.publicacao) {
      const x = p.publicacao;
      setV({
        id_referencia: x.id_referencia, tipo: x.tipo ?? "artigo", autor: x.autor, ano: x.ano ?? "", titulo: x.titulo ?? "",
        periodico: x.periodico ?? "", doi: x.doi ?? "", resumo: x.resumo ?? "",
        palavras_chave: (x.palavras_chave ?? []).join("; "), eixos: (x.eixos ?? []).join(";"), projeto_id: x.projeto_id ?? "",
      });
      amostrasDaPublicacao(x.id_referencia).then(setAmostras).catch(() => undefined);
    } else {
      proximoCodigoProprio().then((id) => setV((a) => ({ ...a, id_referencia: id, tipo: "artigo" })));
    }
  }, [p.publicacao]);

  const campo = (k: string) => ({
    className: "input", value: v[k] ?? "",
    onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })),
  });
  const eixos = (v.eixos ?? "").split(";").filter(Boolean);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const lista = (s?: string) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);
      await salvarPublicacao({
        id_referencia: v.id_referencia, categoria: "propria", autor: v.autor,
        tipo: v.tipo || null, ano: v.ano || null, titulo: v.titulo || null, periodico: v.periodico || null,
        doi: v.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//, "") || null, resumo: v.resumo || null,
        palavras_chave: lista(v.palavras_chave), eixos, projeto_id: v.projeto_id || null,
      });
      await ligarAmostras(v.id_referencia, amostras);
      if (pdf) await enviarPdfPublicacao(v.id_referencia, pdf);
      p.aoSalvar();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <Cartao titulo={p.publicacao ? "Editar publicação" : "Nova publicação do LC PETRO"} subtitulo={v.id_referencia}>
        <div className="p-6 flex flex-col gap-5 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Campo rotulo="Tipo"><select {...campo("tipo")}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
            <Campo rotulo="Ano"><input {...campo("ano")} inputMode="numeric" /></Campo>
            <Campo rotulo="DOI"><input {...campo("doi")} placeholder="10.1016/..." /></Campo>
          </div>
          <Campo rotulo="Autores" obrigatorio><input {...campo("autor")} required /></Campo>
          <Campo rotulo="Título"><input {...campo("titulo")} /></Campo>
          <Campo rotulo="Periódico / evento"><input {...campo("periodico")} /></Campo>
          <Campo rotulo="Resumo"><textarea {...campo("resumo")} rows={4} /></Campo>
          <Campo rotulo="Palavras-chave" ajuda="Separe com ponto e vírgula"><input {...campo("palavras_chave")} /></Campo>

          <div className="field">
            <span className="rotulo">Eixos</span>
            <div className="flex flex-wrap gap-2">
              {ANALISES.map((a) => {
                const marcado = eixos.includes(a.chave);
                return (
                  <button type="button" key={a.chave}
                    onClick={() => setV((x) => ({ ...x, eixos: (marcado ? eixos.filter((y) => y !== a.chave) : [...eixos, a.chave]).join(";") }))}
                    className={`tag cursor-pointer !text-[11px] !py-1.5 ${marcado ? "tag-orange" : "tag-muted"}`}>
                    {a.numero}. {a.titulo}
                  </button>
                );
              })}
            </div>
          </div>

          <Campo rotulo="Restringir a um projeto" ajuda="Vazio = visível para todos os usuários do sistema">
            <select {...campo("projeto_id")}>
              <option value="">Aberta a todos</option>
              {projetos.dados?.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </Campo>

          <Campo rotulo="Amostras usadas" ajuda="Ctrl + clique para escolher várias">
            <select multiple className="input h-36" value={amostras}
              onChange={(e) => setAmostras(Array.from(e.target.selectedOptions).map((o) => o.value))}>
              {listaAmostras.dados?.map((a) => <option key={a.id} value={a.id}>{a.codigo} — {a.litologia}</option>)}
            </select>
          </Campo>

          <Campo rotulo="PDF">
            <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className="text-[13px]" />
          </Campo>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            <button type="button" className="btn btn-secondary" onClick={p.aoCancelar}>Cancelar</button>
          </div>
        </div>
      </Cartao>
    </form>
  );
}
