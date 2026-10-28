// Cópia do Banco da Literatura do dashboard de visualização ("src/..." na raiz), para o gerencial.
// Se mudar uma regra aqui, mude lá também.
import { Fragment, type ReactNode } from "react";

// Rótulos em caixa alta transformariam ω em Ω e φ em Φ (outros símbolos).
// Este componente mantém as letras gregas como foram escritas.
export function Simbolos({ children }: { children: ReactNode }) {
  if (typeof children !== "string" || !/[α-ω]/.test(children)) return <>{children}</>;
  return (
    <>
      {children.split(/([α-ω])/).map((parte, i) =>
        /^[α-ω]$/.test(parte)
          ? <span key={i} style={{ textTransform: "none" }}>{parte}</span>
          : <Fragment key={i}>{parte}</Fragment>)}
    </>
  );
}
