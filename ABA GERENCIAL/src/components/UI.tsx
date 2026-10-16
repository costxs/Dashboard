import React from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react'
import { Simbolos } from './Simbolos'
import { rotuloContexto, useContexto } from '../store/useContexto'

// Componentes de interface com a identidade do dashboard (classes de src/index.css).

// --- SELO LARANJA DO CONTEXTO: "Empresa · Projeto" ---
export const SeloContexto: React.FC<{ texto?: string }> = ({ texto }) => {
  const empresaNome = useContexto((s) => s.empresaNome)
  const projetoNome = useContexto((s) => s.projetoNome)
  return <span className="selo-projeto">{texto ?? rotuloContexto({ empresaNome, projetoNome })}</span>
}

// --- TOPO DA PÁGINA: selo laranja do contexto, título e ações à direita ---
export const CabecalhoPagina: React.FC<{
  titulo: string
  subtitulo?: React.ReactNode
  acoes?: React.ReactNode
  selo?: string
}> = ({ titulo, subtitulo, acoes, selo }) => (
  <div className="flex flex-wrap items-end justify-between gap-6">
    <div>
      <SeloContexto texto={selo} />
      <h1 className="mt-3 text-[27px] leading-[1.2] text-[var(--color-blue-800)]">{titulo}</h1>
      {subtitulo && <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">{subtitulo}</p>}
    </div>
    {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
  </div>
)

// --- CARTÃO / PAINEL ---
export const Card: React.FC<{
  children: React.ReactNode
  className?: string
  titulo?: React.ReactNode
  subtitulo?: string
  icone?: React.ReactNode
  acoes?: React.ReactNode
}> = ({ children, className = '', titulo, subtitulo, icone, acoes }) => (
  <div className={`cartao ${className}`}>
    {(titulo || subtitulo || acoes) && (
      <div className="cartao-topo">
        <div className="flex items-center gap-3">
          {icone && <span className="text-[var(--color-blue)]">{icone}</span>}
          <div>
            {titulo && <h2>{titulo}</h2>}
            {subtitulo && <p>{subtitulo}</p>}
          </div>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
)

// --- BOTÃO ---
export const Button: React.FC<{
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'blue'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  loading?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  className?: string
}> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  onClick,
  type = 'button',
  disabled,
  className = ''
}) => {
  // vermelho = ação principal (salvar/gravar); azul = estrutura; branco = secundário
  const variants = {
    primary: 'btn-primary',
    success: 'btn-primary',
    blue: 'btn-blue',
    secondary: 'btn-secondary',
    outline: 'btn-secondary',
    danger: 'btn-danger'
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn ${variants[variant]} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

// --- RÓTULO DE CAMPO (11px, maiúsculas; letras gregas e unidade ficam como escritas) ---
const Rotulo: React.FC<{ texto: string; unidade?: string; obrigatorio?: boolean }> = ({ texto, unidade, obrigatorio }) => (
  <span className="rotulo">
    <Simbolos>{texto}</Simbolos>
    {unidade && <span className="normal-case tracking-normal font-normal text-[var(--color-neutral-500)]"> ({unidade})</span>}
    {obrigatorio && <span className="text-[var(--color-red)]"> *</span>}
  </span>
)

const Erro: React.FC<{ texto: string }> = ({ texto }) => (
  <span className="flex items-center gap-1 text-[12px] text-[var(--color-red-700)]"><AlertCircle size={12} /> {texto}</span>
)

// --- INPUT ---
export const Input: React.FC<{
  label?: string
  unidade?: string
  obrigatorio?: boolean
  error?: string
  ajuda?: string
} & React.InputHTMLAttributes<HTMLInputElement>> = ({
  label,
  unidade,
  obrigatorio,
  error,
  ajuda,
  className = '',
  ...props
}) => (
  <label className="field w-full">
    {label && <Rotulo texto={label} unidade={unidade} obrigatorio={obrigatorio} />}
    <input
      {...props}
      className={`input ${error ? '!border-[var(--color-red)]' : ''} ${className}`}
    />
    {ajuda && !error && <span className="ajuda">{ajuda}</span>}
    {error && <Erro texto={error} />}
  </label>
)

// --- SELECT (nativo, fundo branco) ---
export const Select: React.FC<{
  label?: string
  obrigatorio?: boolean
  error?: string
  children: React.ReactNode
} & React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  label,
  obrigatorio,
  error,
  children,
  className = '',
  ...props
}) => (
  <label className="field w-full">
    {label && <Rotulo texto={label} obrigatorio={obrigatorio} />}
    <select
      {...props}
      className={`input ${error ? '!border-[var(--color-red)]' : ''} ${className}`}
    >
      {children}
    </select>
    {error && <Erro texto={error} />}
  </label>
)

// --- TEXTAREA ---
export const Textarea: React.FC<{
  label?: string
  obrigatorio?: boolean
  error?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  label,
  obrigatorio,
  error,
  className = '',
  ...props
}) => (
  <label className="field w-full">
    {label && <Rotulo texto={label} obrigatorio={obrigatorio} />}
    <textarea
      rows={3}
      {...props}
      className={`input ${error ? '!border-[var(--color-red)]' : ''} ${className}`}
    />
    {error && <Erro texto={error} />}
  </label>
)

// --- ETIQUETA ---
export const Badge: React.FC<{
  children: React.ReactNode
  variant?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'slate' | 'solid' | 'outline'
}> = ({ children, variant = 'blue' }) => {
  const styles = {
    blue: 'tag-blue',
    green: 'tag-blue',
    amber: 'tag-orange',
    red: 'tag-accent',
    purple: 'tag-outline',
    slate: 'tag-neutral',
    solid: 'tag-solid',
    outline: 'tag-outline'
  }
  return <span className={`tag ${styles[variant]}`}>{children}</span>
}

// --- MODAL ---
export const Modal: React.FC<{
  isOpen: boolean
  onClose: () => void
  titulo: string
  subtitulo?: string
  children: React.ReactNode
  maxWidth?: string
}> = ({ isOpen, onClose, titulo, subtitulo, children, maxWidth = 'max-w-2xl' }) => {
  if (!isOpen) return null
  return (
    <div className="modal-fundo animate-fade-in">
      <div className={`cartao relative w-full ${maxWidth} overflow-hidden shadow-2xl shadow-black/30`}>
        <div className="faixa-lcp" />
        <div className="cartao-topo">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-icone shrink-0" title="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// --- AVISO ---
export const Alert: React.FC<{
  tipo?: 'erro' | 'sucesso' | 'info'
  mensagem: string
  onClose?: () => void
}> = ({ tipo = 'info', mensagem, onClose }) => {
  const config = {
    erro: { classe: 'aviso-erro', icone: <AlertCircle className="shrink-0 mt-0.5" size={16} /> },
    sucesso: { classe: 'aviso-ok', icone: <CheckCircle2 className="shrink-0 mt-0.5" size={16} /> },
    info: { classe: 'aviso-info', icone: <Info className="shrink-0 mt-0.5" size={16} /> }
  }
  return (
    <div className={`aviso ${config[tipo].classe} flex items-start gap-2.5`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {config[tipo].icone}
      <div className="flex-1">{mensagem}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100 cursor-pointer" title="Fechar aviso">
          <X size={15} />
        </button>
      )}
    </div>
  )
}

// --- ESTADO VAZIO ---
export const Vazio: React.FC<{ icone?: React.ReactNode; titulo: string; texto?: string }> = ({ icone, titulo, texto }) => (
  <div className="py-10 text-center">
    {icone && <div className="mx-auto mb-2 flex justify-center text-[var(--color-neutral-400)]">{icone}</div>}
    <p className="text-[14px] font-semibold text-[var(--color-neutral-700)]">{titulo}</p>
    {texto && <p className="mt-1 text-[12px] text-[var(--color-neutral-500)]">{texto}</p>}
  </div>
)
