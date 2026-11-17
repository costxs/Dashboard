import { useMemo } from "react";
import { GraficoRda } from "../charts/GraficoRda";
import { Aviso, Carregando, Cartao } from "../ui/base";
import { useConsulta } from "../../hooks/useConsulta";
import { pontosComparacao } from "../../servicos/literatura";

// Ficha da amostra › 5. RDA: as taxas de reação desta amostra em destaque
// sobre a literatura da mesma litologia e ácido.
export function RdaDaAmostra({ codigo, projetoId, litologia }: { codigo: string; projetoId: string; litologia: string }) {
  const pontos = useConsulta(() => pontosComparacao({ litologias: [litologia] }), [litologia]);

  const { meus, literatura } = useMemo(() => {
    const todos = pontos.dados ?? [];
    const meus = todos.filter((p) => p.fonte === "lcpetro" && p.rotulo === codigo && p.projeto_id === projetoId);
    const acidos = new Set(meus.map((p) => p.acido));
    return { meus, literatura: todos.filter((p) => p.fonte === "literatura" && acidos.has(p.acido)) };
  }, [pontos.dados, codigo, projetoId]);

  return (
    <Cartao titulo="Esta amostra na literatura de taxa de reação"
      subtitulo="Os ensaios desta amostra em destaque sobre a literatura da mesma litologia e ácido">
      <div className="p-6 flex flex-col gap-4">
        {pontos.carregando && !pontos.dados ? <Carregando />
          : pontos.erro ? <Aviso tipo="erro">{pontos.erro}</Aviso>
          : !meus.length ? <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Os ensaios de RDA desta amostra ainda não têm taxa de reação para comparar.</p>
          : (
            <>
              {!literatura.length && <Aviso tipo="info">Nenhum ensaio comparável na literatura (mesma rocha e ácido).</Aviso>}
              <GraficoRda pontos={[...literatura, ...meus]} destacarRotulo={codigo} altura={380} />
            </>
          )}
      </div>
    </Cartao>
  );
}
