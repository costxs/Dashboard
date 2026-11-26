// Página "Diagrama ternário" do dashboard.
// A página do aplicativo fica em public/ternario/index.html e roda num iframe da MESMA origem.
// Antes de o iframe carregar, o dashboard entrega a ponte `window.__lcpTernario` com o supabase do usuário logado:
// o aplicativo lê e grava em ternario_projetos / ternario_diagramas, e o banco decide quem edita.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { criarApiTernario } from "./ternarioApi";

type Acesso = "carregando" | "editor" | "leitor" | "sem";

declare global {
  interface Window {
    __lcpTernario?: ReturnType<typeof criarApiTernario>;
  }
}

export function TernarioPage() {
  const [acesso, setAcesso] = useState<Acesso>("carregando");

  useEffect(() => {
    window.__lcpTernario = criarApiTernario(supabase);
    let vivo = true;
    (async () => {
      const ver = await supabase.rpc("pode_ver_modulo", { p_modulo: "ternario" });
      const editar = await supabase.rpc("pode_editar_modulo", { p_modulo: "ternario" });
      if (vivo) setAcesso(!ver.data ? "sem" : editar.data ? "editor" : "leitor");
    })();
    return () => {
      vivo = false;
      delete window.__lcpTernario;
    };
  }, []);

  if (acesso === "carregando") {
    return (
      <div className="p-6">
        <div className="cartao p-6 text-sm text-[var(--color-neutral-500)]">Carregando…</div>
      </div>
    );
  }

  if (acesso === "sem") {
    return (
      <div className="p-6">
        <div className="aviso aviso-info">
          Você ainda não tem acesso ao diagrama ternário. Peça ao administrador para liberar o seu e-mail
          (Gerencial › Acessos › Aplicativos).
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4" style={{ height: "calc(100vh - 64px)" }}>
      {acesso === "leitor" && (
        <div className="aviso aviso-info">
          Acesso de leitura: você vê os diagramas, mas as alterações não são salvas.
        </div>
      )}
      {/* o iframe só é montado depois que a ponte existe */}
      <iframe
        title="Diagrama ternário"
        src="/ternario/index.html"
        className="cartao w-full flex-1"
        style={{ border: 0, minHeight: 700 }}
      />
    </div>
  );
}

export default TernarioPage;
