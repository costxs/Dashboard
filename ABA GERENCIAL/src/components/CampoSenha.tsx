import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Campo de senha com botão para mostrar/ocultar o que está sendo digitado. */
export function CampoSenha(p: {
  id: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input
        id={p.id} name={p.name ?? p.id} type={visivel ? "text" : "password"} required={p.required}
        autoComplete={p.autoComplete} value={p.value} onChange={(e) => p.onChange(e.target.value)}
        autoCapitalize="off" autoCorrect="off" spellCheck={false}
        className="input h-11 !pr-11"
      />
      <button
        type="button" onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visivel} aria-controls={p.id}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-blue-800)] cursor-pointer"
      >
        {visivel ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
