import { supabase, verificar } from '../lib/supabase'
import type { FontePvbt, PontoPvbt } from '../tipos/banco'

export interface FiltroPvbt {
  amostraUuid?: string          // só os ensaios de uma amostra do laboratório
  fontes?: FontePvbt[]
  litologia?: string
  acidos?: string[]
}

/** Base de PVbt (LC PETRO + literatura + Petrobras). A RLS já esconde o que o usuário não pode ver. */
export async function listarPvbt(f: FiltroPvbt = {}): Promise<PontoPvbt[]> {
  const todos: PontoPvbt[] = []
  for (let de = 0; ; de += 1000) {
    let q = supabase.from('v_pvbt').select('*').order('id_experimento').range(de, de + 999)
    if (f.amostraUuid) q = q.eq('amostra_uuid', f.amostraUuid)
    if (f.fontes?.length) q = q.in('fonte', f.fontes)
    if (f.litologia) q = q.eq('litologia', f.litologia)
    if (f.acidos?.length) q = q.in('acido', f.acidos)
    const lote = verificar<PontoPvbt[]>(await q)
    todos.push(...lote)
    if (lote.length < 1000) break
  }
  return todos
}
