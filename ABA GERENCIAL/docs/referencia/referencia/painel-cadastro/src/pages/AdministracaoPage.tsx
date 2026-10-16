import { useState } from "react";
import { Building2, FlaskConical, FolderKanban, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { LogoEmpresa } from "../components/LogoEmpresa";
import { Aviso, CabecalhoPagina, Campo, Carregando, Cartao } from "../components/ui/base";
import { fmt, mensagemErro } from "../utils/formatacao";
import { useConsulta } from "../hooks/useConsulta";
import { listarSistemasAcidos, salvarSistemaAcido } from "../servicos/amostras";
import {
  adicionarMembro, atualizarProjeto, criarEmpresa, criarProjeto, listarEmpresas, listarMembros, listarPerfis,
  listarTodosProjetos, removerMembro,
} from "../servicos/contexto";
import { useContexto } from "../store/useContexto";

// Administração (só administrador): empresas, projetos, quem acessa o quê e
// catálogo de sistemas ácidos. As regras de verdade estão no banco: um usuário
// comum que abrir esta página não consegue gravar nada.
export function AdministracaoPage() {
  const admin = useContexto((s) => s.perfil?.administrador);
  if (!admin) {
    return <div className="p-7"><Aviso tipo="info">Esta área é só para administradores do LC PETRO.</Aviso></div>;
  }
  return (
    <div>
      <CabecalhoPagina titulo="Administração" selo="LC PETRO · administração"
        subtitulo="Cadastre empresas e projetos novos, libere acessos e mantenha o catálogo de sistemas ácidos." />
      <div className="px-7 pb-10 flex flex-col gap-6">
        <EmpresasEProjetos />
        <Acessos />
        <SistemasAcidos />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function EmpresasEProjetos() {
  const empresas = useConsulta(listarEmpresas, []);
  const projetos = useConsulta(listarTodosProjetos, []);
  const [nova, setNova] = useState({ sigla: "", nome: "" });
  const [novoProj, setNovoProj] = useState({ empresa_id: "", codigo: "", nome: "", descricao: "" });
  const [erro, setErro] = useState<string | null>(null);

  async function addEmpresa() {
    setErro(null);
    try { await criarEmpresa(nova.sigla.trim().toUpperCase(), nova.nome.trim()); setNova({ sigla: "", nome: "" }); empresas.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }
  async function addProjeto() {
    setErro(null);
    try {
      await criarProjeto({ ...novoProj, codigo: novoProj.codigo.trim().toUpperCase(), descricao: novoProj.descricao || null });
      setNovoProj({ ...novoProj, codigo: "", nome: "", descricao: "" }); projetos.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Cartao titulo="Empresas" subtitulo="Primeiro nível: operadora, financiador ou o próprio LC PETRO" icone={<Building2 size={18} />}>
        <div className="p-6 flex flex-col gap-4">
          {empresas.carregando && <Carregando />}
          <div className="flex flex-wrap gap-3">
            {empresas.dados?.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-neutral-200)] px-3 py-2">
                <LogoEmpresa sigla={e.sigla} nome={e.nome} tamanho={36} />
                <div><p className="m-0 font-semibold text-[13px]">{e.nome}</p><p className="m-0 text-[11px] text-[var(--color-neutral-500)]">{e.sigla}</p></div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-[var(--color-neutral-200)] pt-4">
            <Campo rotulo="Sigla" className="w-32"><input className="input !py-2" value={nova.sigla} onChange={(e) => setNova({ ...nova, sigla: e.target.value })} placeholder="SHELL" /></Campo>
            <Campo rotulo="Nome" className="flex-1 min-w-[180px]"><input className="input !py-2" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} /></Campo>
            <button className="btn btn-primary" disabled={!nova.sigla || !nova.nome} onClick={addEmpresa}><Plus size={14} /> Nova empresa</button>
          </div>
        </div>
      </Cartao>

      <Cartao titulo="Projetos" subtitulo="Segundo nível: cada contrato ou linha de pesquisa" icone={<FolderKanban size={18} />}>
        <div className="p-6 flex flex-col gap-4">
          <table className="table text-[13px]">
            <thead><tr><th>Código</th><th>Nome</th><th>Empresa</th><th>Ativo</th></tr></thead>
            <tbody>
              {projetos.dados?.map((p) => (
                <tr key={p.id} className="lcp-row">
                  <td className="font-heading font-extrabold text-[var(--color-blue)]">{p.codigo}</td>
                  <td>{p.nome}</td>
                  <td>{empresas.dados?.find((e) => e.id === p.empresa_id)?.sigla}</td>
                  <td>
                    <input type="checkbox" checked={p.ativo} title="Projetos inativos somem da seleção"
                      onChange={async (e) => { await atualizarProjeto(p.id, { ativo: e.target.checked }); projetos.recarregar(); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-neutral-200)] pt-4">
            <Campo rotulo="Empresa">
              <select className="input !py-2" value={novoProj.empresa_id} onChange={(e) => setNovoProj({ ...novoProj, empresa_id: e.target.value })}>
                <option value="">Escolha…</option>
                {empresas.dados?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Código"><input className="input !py-2" value={novoProj.codigo} onChange={(e) => setNovoProj({ ...novoProj, codigo: e.target.value })} placeholder="TOTAL-2026" /></Campo>
            <Campo rotulo="Nome" className="col-span-2"><input className="input !py-2" value={novoProj.nome} onChange={(e) => setNovoProj({ ...novoProj, nome: e.target.value })} /></Campo>
            <Campo rotulo="Descrição" className="col-span-2"><input className="input !py-2" value={novoProj.descricao} onChange={(e) => setNovoProj({ ...novoProj, descricao: e.target.value })} /></Campo>
            <button className="btn btn-primary w-fit" disabled={!novoProj.empresa_id || !novoProj.codigo || !novoProj.nome} onClick={addProjeto}>
              <Plus size={14} /> Novo projeto
            </button>
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
        </div>
      </Cartao>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Acessos() {
  const membros = useConsulta(listarMembros, []);
  const perfis = useConsulta(listarPerfis, []);
  const empresas = useConsulta(listarEmpresas, []);
  const projetos = useConsulta(listarTodosProjetos, []);
  const [n, setN] = useState({ usuario_id: "", nivel: "projeto", alvo: "", papel: "editor" });
  const [erro, setErro] = useState<string | null>(null);

  async function adicionar() {
    setErro(null);
    try {
      await adicionarMembro({
        usuario_id: n.usuario_id, papel: n.papel as "leitor" | "editor",
        ...(n.nivel === "empresa" ? { empresa_id: n.alvo } : { projeto_id: n.alvo }),
      });
      setN({ ...n, alvo: "" }); membros.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <Cartao titulo="Acessos" icone={<ShieldCheck size={18} />}
      subtitulo="Nível empresa = vê todos os projetos dela · nível projeto = só aquele projeto. Editor lança dados; leitor só consulta.">
      <div className="p-6 flex flex-col gap-5">
        <Aviso tipo="info">
          Pessoas novas são cadastradas no Supabase em <strong>Authentication → Users → Add user</strong>. Depois de criadas, aparecem aqui para receber acesso.
        </Aviso>
        {membros.carregando && <Carregando />}
        {!!membros.dados?.length && (
          <table className="table text-[13px]">
            <thead><tr><th>Pessoa</th><th>Nível</th><th>Acesso a</th><th>Papel</th><th /></tr></thead>
            <tbody>
              {membros.dados.map((m) => (
                <tr key={m.id} className="lcp-row">
                  <td><strong>{m.perfis?.nome ?? "—"}</strong> <span className="text-[var(--color-neutral-500)]">{m.perfis?.email}</span></td>
                  <td><span className={m.empresa_id ? "tag tag-orange" : "tag tag-blue"}>{m.empresa_id ? "empresa" : "projeto"}</span></td>
                  <td>{m.empresas ? m.empresas.nome : `${m.projetos?.codigo} — ${m.projetos?.nome}`}</td>
                  <td><span className={m.papel === "editor" ? "tag tag-accent" : "tag tag-neutral"}>{m.papel}</span></td>
                  <td className="text-right">
                    <button title="Remover acesso" className="text-[var(--color-neutral-400)] hover:text-[var(--color-red)]"
                      onClick={async () => { if (confirm("Remover este acesso?")) { await removerMembro(m.id); membros.recarregar(); } }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end border-t border-[var(--color-neutral-200)] pt-4">
          <Campo rotulo="Pessoa">
            <select className="input !py-2" value={n.usuario_id} onChange={(e) => setN({ ...n, usuario_id: e.target.value })}>
              <option value="">Escolha…</option>
              {perfis.dados?.map((p) => <option key={p.id} value={p.id}>{p.nome ?? p.email} ({p.email})</option>)}
            </select>
          </Campo>
          <Campo rotulo="Nível">
            <select className="input !py-2" value={n.nivel} onChange={(e) => setN({ ...n, nivel: e.target.value, alvo: "" })}>
              <option value="projeto">Projeto</option><option value="empresa">Empresa</option>
            </select>
          </Campo>
          <Campo rotulo={n.nivel === "empresa" ? "Empresa" : "Projeto"}>
            <select className="input !py-2" value={n.alvo} onChange={(e) => setN({ ...n, alvo: e.target.value })}>
              <option value="">Escolha…</option>
              {n.nivel === "empresa"
                ? empresas.dados?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)
                : projetos.dados?.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Papel">
            <select className="input !py-2" value={n.papel} onChange={(e) => setN({ ...n, papel: e.target.value })}>
              <option value="editor">Editor</option><option value="leitor">Leitor</option>
            </select>
          </Campo>
          <button className="btn btn-primary" disabled={!n.usuario_id || !n.alvo} onClick={adicionar}><UserPlus size={14} /> Dar acesso</button>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
const vazioSistema = { id_sistema: "", nome_sistema: "", categoria: "", nome_comercial: "", componente_1: "HCl", valor_1: "", unidade_1: "wt%", componente_2: "", valor_2: "", unidade_2: "vol%" };

function SistemasAcidos() {
  const sistemas = useConsulta(listarSistemasAcidos, []);
  const [s, setS] = useState(vazioSistema);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof s) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value });

  async function salvar() {
    setErro(null);
    const num = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
    try {
      await salvarSistemaAcido({
        id_sistema: s.id_sistema.trim(), nome_sistema: s.nome_sistema.trim(), categoria: s.categoria || null,
        nome_comercial: s.nome_comercial || null, componente_1: s.componente_1.trim(), valor_1: num(s.valor_1), unidade_1: s.unidade_1 || null,
        componente_2: s.componente_2 || null, valor_2: num(s.valor_2), unidade_2: s.componente_2 ? s.unidade_2 : null,
      });
      setS(vazioSistema); sistemas.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <Cartao titulo="Sistemas ácidos" icone={<FlaskConical size={18} />}
      subtitulo="Usados no coreflooding, na reatividade estática, no RDA e na literatura (ex.: HCl, HCl + IC, ácido retardado, sistemas comerciais)">
      <div className="p-6 flex flex-col gap-5">
        <div className="max-h-[300px] overflow-auto">
          <table className="table text-[13px]">
            <thead className="sticky top-0 bg-white"><tr><th>ID</th><th>Nome</th><th>Categoria</th><th>Ácido</th><th className="text-right">Conc.</th><th className="text-right">mol/L</th><th>Aditivos</th></tr></thead>
            <tbody>
              {sistemas.dados?.map((x) => (
                <tr key={x.id_sistema} className="lcp-row cursor-pointer" title="Clique para editar"
                  onClick={() => setS({
                    id_sistema: x.id_sistema, nome_sistema: x.nome_sistema, categoria: x.categoria ?? "", nome_comercial: x.nome_comercial ?? "",
                    componente_1: x.componente_1, valor_1: x.valor_1 == null ? "" : String(x.valor_1), unidade_1: x.unidade_1 ?? "",
                    componente_2: x.componente_2 ?? "", valor_2: x.valor_2 == null ? "" : String(x.valor_2), unidade_2: x.unidade_2 ?? "vol%",
                  })}>
                  <td className="font-heading font-extrabold text-[var(--color-blue)]">{x.id_sistema}</td>
                  <td>{x.nome_sistema}</td>
                  <td>{x.categoria ?? "—"}</td>
                  <td>{x.componente_1}</td>
                  <td className="text-right tabular-nums">{fmt(x.valor_1)} {x.unidade_1}</td>
                  <td className="text-right tabular-nums">{fmt(x.conc_m, 3)}</td>
                  <td className="text-[12px] text-[var(--color-neutral-600)]">{x.aditivos ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end border-t border-[var(--color-neutral-200)] pt-4">
          <Campo rotulo="ID"><input className="input !py-2" value={s.id_sistema} onChange={set("id_sistema")} placeholder="SA20" /></Campo>
          <Campo rotulo="Nome" className="lg:col-span-2"><input className="input !py-2" value={s.nome_sistema} onChange={set("nome_sistema")} placeholder="HCl 15% + inibidor" /></Campo>
          <Campo rotulo="Categoria">
            <input className="input !py-2" list="categorias-sistema" value={s.categoria} onChange={set("categoria")} />
            <datalist id="categorias-sistema">
              <option value="HCl" /><option value="HCl + IC" /><option value="retardado" /><option value="comercial" /><option value="orgânico" /><option value="quelante" />
            </datalist>
          </Campo>
          <Campo rotulo="Nome comercial"><input className="input !py-2" value={s.nome_comercial} onChange={set("nome_comercial")} /></Campo>
          <Campo rotulo="Ácido principal"><input className="input !py-2" value={s.componente_1} onChange={set("componente_1")} /></Campo>
          <Campo rotulo="Concentração"><input className="input !py-2" inputMode="decimal" value={s.valor_1} onChange={set("valor_1")} /></Campo>
          <Campo rotulo="Unidade">
            <select className="input !py-2" value={s.unidade_1} onChange={set("unidade_1")}><option>wt%</option><option>M</option><option>N</option><option>vol%</option></select>
          </Campo>
          <Campo rotulo="Aditivo (opcional)"><input className="input !py-2" value={s.componente_2} onChange={set("componente_2")} placeholder="IC" /></Campo>
          <Campo rotulo="Teor do aditivo (vol%)"><input className="input !py-2" inputMode="decimal" value={s.valor_2} onChange={set("valor_2")} /></Campo>
          <div className="col-span-full flex gap-2">
            <button className="btn btn-primary" disabled={!s.id_sistema || !s.nome_sistema || !s.componente_1} onClick={salvar}>Salvar sistema</button>
            <button className="btn btn-secondary" onClick={() => setS(vazioSistema)}>Limpar</button>
          </div>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Cartao>
  );
}
