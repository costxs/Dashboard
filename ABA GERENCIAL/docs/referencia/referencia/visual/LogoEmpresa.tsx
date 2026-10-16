// Logo da empresa pelo código (sigla). Empresas sem arquivo de logo ganham um
// selo com as iniciais nas cores do laboratório.
const LOGOS: Record<string, string> = {
  TOTAL: "/total-energies-256.png",
  TOTALENERGIES: "/total-energies-256.png",
  PETROBRAS: "/logo-petrobras-1536.png",
  LCPETRO: "/lab-logo-1.png",
};

const CORES = ["var(--color-blue)", "var(--color-red)", "var(--color-orange-600)"];

export function LogoEmpresa({ sigla, nome, tamanho = 120 }: { sigla?: string | null; nome?: string | null; tamanho?: number }) {
  const chave = (sigla ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const src = LOGOS[chave];
  if (src) {
    return <img src={src} alt={nome ?? sigla ?? ""} style={{ width: tamanho, height: tamanho }} className="object-contain" />;
  }
  const iniciais = (nome ?? sigla ?? "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 3).toUpperCase();
  const cor = CORES[(chave.charCodeAt(0) || 0) % CORES.length];
  return (
    <div
      style={{ width: tamanho, height: tamanho, background: cor, fontSize: Math.max(12, tamanho / 3.2) }}
      className="flex items-center justify-center rounded-2xl font-heading font-extrabold text-white"
      aria-label={nome ?? sigla ?? ""}
    >
      {iniciais}
    </div>
  );
}
