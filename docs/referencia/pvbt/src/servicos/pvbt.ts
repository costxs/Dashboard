import { supabase, verificar } from '../lib/supabase'
import type { PontoPvbt } from '../tipos/banco'

/** Base de PVbt (LC PETRO + literatura + Petrobras). A RLS já esconde o que o usuário não pode ver. */
export async function listarPvbt(): Promise<PontoPvbt[]> {
  const todos: PontoPvbt[] = []
  for (let de = 0; ; de += 1000) {
    const lote = verificar<PontoPvbt[]>(await supabase.from('v_pvbt').select('*').order('id_experimento').range(de, de + 999))
    todos.push(...lote)
    if (lote.length < 1000) break
  }
  return todos
}
