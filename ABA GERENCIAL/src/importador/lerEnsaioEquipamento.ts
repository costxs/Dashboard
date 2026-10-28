// Escolhe o leitor pelo equipamento: JBV (tratamentoPermeabilidade.lerEnsaios) ou DCI (lerDCI.lerEnsaiosDCI).
import type { PlanilhaBruta } from "./planilhaAmostras";
import { detectarEquipamento, lerEnsaiosDCI, type FonteDpDCI } from "./lerDCI";
import { lerEnsaios, type Ensaio } from "./tratamentoPermeabilidade";

export interface LeituraEquipamento { ensaios: Ensaio[]; detectado: "JBV" | "DCI" | null; aviso: string | null }

/** `escolhido` = o que a pessoa marcou na tela. Se o arquivo for do outro equipamento, avisa e lê pelo certo. */
export function lerEnsaiosEquipamento(bruta: PlanilhaBruta, escolhido: "JBV" | "DCI", op: { dpDCI?: FonteDpDCI } = {}): LeituraEquipamento {
  const detectado = detectarEquipamento(bruta);
  const usar = detectado ?? escolhido;
  const aviso = detectado && detectado !== escolhido
    ? `O arquivo é do equipamento ${detectado}, mas a tela está em ${escolhido}: li como ${detectado}.` : null;
  const ensaios = usar === "DCI" ? lerEnsaiosDCI(bruta, { dp: op.dpDCI }) : lerEnsaios(bruta);
  return { ensaios, detectado, aviso };
}
