import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Executa uma função assíncrona e guarda dados / carregando / erro.
 * `deps` funciona como no useEffect: quando mudam, busca de novo.
 * `recarregar()` força nova busca (ex.: depois de salvar um registro).
 */
export function useConsulta<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const chamada = useRef(0)

  const recarregar = useCallback(() => {
    const minha = ++chamada.current
    setCarregando(true)
    setErro(null)
    fn()
      .then((d) => { if (minha === chamada.current) setDados(d) })
      .catch((e: unknown) => { if (minha === chamada.current) setErro(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (minha === chamada.current) setCarregando(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { recarregar() }, [recarregar])

  return { dados, carregando, erro, recarregar }
}
