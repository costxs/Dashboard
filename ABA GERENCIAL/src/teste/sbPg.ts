// Cliente "tipo Supabase" sobre PostgreSQL local, só para os testes: roda cada operação como o usuário
// logado (role authenticated + request.jwt.claims), então as regras de acesso (RLS) valem igual ao Supabase.
import pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'

type Res = { data: unknown; error: { message: string; code?: string } | null }

export function sbPg(pool: pg.Pool, usuario: string | null): SupabaseClient {
  async function rodar(sql: string, params: unknown[]): Promise<Res> {
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${usuario ? 'authenticated' : 'anon'}`)
      if (usuario) await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: usuario })])
      const r = await c.query(sql, params)
      await c.query('commit')
      return { data: r.rows, error: null }
    } catch (e) {
      await c.query('rollback').catch(() => {})
      const err = e as { message: string; code?: string }
      return { data: null, error: { message: err.message, code: err.code } }
    } finally { c.release() }
  }
  const id = (s: string) => '"' + s.replace(/"/g, '""') + '"'
  // objeto -> json; lista de objetos -> json (jsonb); lista de valores simples continua lista do Postgres (text[])
  const val = (v: unknown) => (v !== null && typeof v === 'object' && !(v instanceof Date) && (!Array.isArray(v) || v.some((x) => x !== null && typeof x === 'object')) ? JSON.stringify(v) : v)

  function from(tabela: string) {
    const filtros: { sql: string; v: unknown[] }[] = []
    let cols = '*', limite = '', faixa = '', ordem = '', modo: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
    let linhas: Record<string, unknown>[] = [], conflito = '', retorno = false, unico = false, upd: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    const where = (params: unknown[]) => filtros.length ? ' where ' + filtros.map((f) => {
      let s = f.sql; for (const v of f.v) { params.push(v); s = s.replace('?', '$' + params.length) } return s }).join(' and ') : ''
    async function exec(): Promise<Res> {
      const params: unknown[] = []
      let sql: string
      if (modo === 'select') {
        sql = `select ${cols === '*' ? '*' : cols.split(',').map((c) => id(c.trim())).join(',')} from public.${id(tabela)}${where(params)}${ordem}${limite}${faixa}`
      } else if (modo === 'delete') {
        sql = `delete from public.${id(tabela)}${where(params)}${retorno ? ' returning *' : ''}`
      } else if (modo === 'update') {
        const ks = Object.keys(upd)
        sql = `update public.${id(tabela)} set ${ks.map((k) => { params.push(val(upd[k])); return `${id(k)} = $${params.length}` }).join(', ')}${where(params)}${retorno ? ' returning *' : ''}`
      } else {
        if (!linhas.length) return { data: [], error: null }
        const ks = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
        const vals = linhas.map((l) => '(' + ks.map((k) => { params.push(k in l ? val(l[k]) : null); return '$' + params.length }).join(',') + ')').join(',')
        sql = `insert into public.${id(tabela)} (${ks.map(id).join(',')}) values ${vals}`
        if (modo === 'upsert') {
          const alvo = conflito.split(',').map((c) => c.trim())
          const set = ks.filter((k) => !alvo.includes(k))
          sql += ` on conflict (${alvo.map(id).join(',')}) ` + (set.length ? `do update set ${set.map((k) => `${id(k)} = excluded.${id(k)}`).join(', ')}` : 'do nothing')
        }
        if (retorno) sql += ' returning *'
      }
      const r = await rodar(sql, params)
      if (r.error) return r
      if (modo !== 'select' && !retorno) return { data: null, error: null }
      if (unico) {
        const rows = r.data as unknown[]
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `esperava 1 linha, veio ${rows.length}`, code: 'PGRST116' } }
      }
      return r
    }
    Object.assign(b, {
      select(c = '*') { if (modo === 'select') cols = c; else retorno = true; return b },
      insert(l: Record<string, unknown> | Record<string, unknown>[]) { modo = 'insert'; linhas = Array.isArray(l) ? l : [l]; return b },
      upsert(l: Record<string, unknown> | Record<string, unknown>[], o: { onConflict: string }) { modo = 'upsert'; linhas = Array.isArray(l) ? l : [l]; conflito = o.onConflict; return b },
      update(u: Record<string, unknown>) { modo = 'update'; upd = u; return b },
      delete() { modo = 'delete'; return b },
      eq(c: string, v: unknown) { filtros.push({ sql: `${id(c)} = ?`, v: [v] }); return b },
      in(c: string, v: unknown[]) { filtros.push({ sql: `${id(c)} = any(?)`, v: [v] }); return b },
      is(c: string, v: null) { void v; filtros.push({ sql: `${id(c)} is null`, v: [] }); return b },
      order(c: string, o?: { ascending?: boolean }) { ordem = ` order by ${id(c)} ${o?.ascending === false ? 'desc' : 'asc'}`; return b },
      limit(n: number) { limite = ` limit ${n}`; return b },
      range(a: number, z: number) { faixa = ` offset ${a} limit ${z - a + 1}`; return b },
      single() { unico = true; return b },
      maybeSingle() { unico = true; return b },
      then(ok: (r: Res) => unknown, err?: (e: unknown) => unknown) { return exec().then(ok, err) },
    })
    return b
  }
  return { from, rpc: async (fn: string, args: Record<string, unknown>) => {
    const ks = Object.keys(args)
    const r = await rodar(`select * from public.${id(fn)}(${ks.map((k, i) => `${id(k)} => $${i + 1}`).join(',')})`, ks.map((k) => val(args[k])))
    if (r.error) return r
    // como o Supabase: função que devolve um valor só (jsonb, número…) chega como o próprio valor
    const rows = r.data as Record<string, unknown>[]
    if (rows.length === 1 && Object.keys(rows[0]).length === 1) return { data: Object.values(rows[0])[0], error: null }
    return r
  } } as unknown as SupabaseClient
}

/** Usuários de teste: administrador e alguém sem papel de editor. */
export async function semearUsuarios(pool: pg.Pool) {
  const adm = '00000000-0000-0000-0000-0000000000a1', leitor = '00000000-0000-0000-0000-0000000000b2'
  await pool.query(`insert into auth.users (id, email) values ($1, 'adm@teste'), ($2, 'leitor@teste') on conflict do nothing`, [adm, leitor])
  await pool.query(`insert into public.perfis (id, email, administrador) values ($1, 'adm@teste', true), ($2, 'leitor@teste', false)
                    on conflict (id) do update set administrador = excluded.administrador`, [adm, leitor])
  return { adm, leitor }
}
