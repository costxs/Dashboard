import { useState } from "react";
import { ANALISES } from "../../config/analises";
import { useConsulta } from "../../hooks/useConsulta";
import { listarRegistros } from "../../servicos/analises";
import { fmt, fmtData } from "../../utils/formatacao";
import { Aviso } from "../ui/base";
import { PermeabilidadeEtapas } from "./PermeabilidadeEtapas";

const PETROFISICA = ANALISES.find((c) => c.chave === "petrofisica")!;

// Aba 3. Coreflooding: a permeabilidade medida no coreflood (tratamento do gerencial).
// O dado continua gravado na petrofísica (k da amostra); aqui aparecem as etapas de vazão,
// o ajuste ΔP × Q e os gráficos. Só entram os registros que vieram do tratamento (metodo_k preenchido).
export function PermeabilidadeCoreflood(p: {
  amostraId: string; amostra?: { codigo?: string | null; comprimento_cm?: number | null; diametro_cm?: number | null };
}) {
  const consulta = useConsulta(() => listarRegistros(PETROFISICA, p.amostraId), [p.amostraId]);
  const [selId, setSelId] = useState<number | null>(null);

  if (consulta.erro) return <Aviso tipo="erro">Permeabilidade: {consulta.erro}</Aviso>;
  const tratados = (consulta.dados ?? []).filter((r) => r.amostra_id === p.amostraId && r.metodo_k != null);
  if (!tratados.length) return null;
  const r = tratados.find((x) => x.id === selId) ?? tratados[0];

  return (
    <div className="flex flex-col gap-3">
      {tratados.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--color-blue-700)]">Ensaio de permeabilidade</span>
          {tratados.map((x) => (
            <button key={x.id} onClick={() => setSelId(x.id)} className={`btn ${x.id === r.id ? "btn-blue" : "btn-secondary"}`}>
              {x.data_ensaio ? fmtData(x.data_ensaio) : `#${x.id}`} · k = {fmt(x.permeabilidade_liquido_md, 2)} mD
            </button>
          ))}
        </div>
      )}
      <PermeabilidadeEtapas r={r} amostra={p.amostra} />
    </div>
  );
}
