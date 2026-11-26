// Ponte do diagrama ternário sobre o banco (regras de acesso valendo). Usuários e dados fictícios.
// Roda só com PGPORTA_TERNARIO apontando para um PostgreSQL VAZIO com as migrações 001–022.
// Com TERNARIO_HTML (caminho do public/ternario/index.html gerado) também abre a página num Chromium.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sbPg, semearUsuarios } from '../teste/sbPg'
import { criarApiTernario, ErroApi } from './ternarioApi'

const PORTA = Number(process.env.PGPORTA_TERNARIO)
const EDITORA = '00000000-0000-0000-0000-0000000000c3', OUTRO = '00000000-0000-0000-0000-0000000000d4'

describe.skipIf(!PORTA)('diagrama ternário no banco', () => {
  let pool: pg.Pool, adm: string, leitor: string
  const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows
  beforeAll(async () => {
    pool = new pg.Pool({ host: '/tmp', port: PORTA, user: 'postgres', database: 'lcpetro' })
    ;({ adm, leitor } = await semearUsuarios(pool))
    for (const [id, email] of [[EDITORA, 'editora@teste'], [OUTRO, 'outro@teste']]) {
      await q(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [id, email])
      await q(`insert into perfis (id, email) values ($1, $2) on conflict (id) do nothing`, [id, email])
    }
  })
  afterAll(async () => { await pool.end() })

  it('só o administrador libera; a pessoa precisa existir', async () => {
    await expect(sbPg(pool, leitor).rpc('conceder_modulo', { p_email: 'editora@teste', p_modulo: 'ternario', p_papel: 'editor' }))
      .resolves.toMatchObject({ error: { code: '42501' } })
    const a = sbPg(pool, adm)
    expect((await a.rpc('conceder_modulo', { p_email: 'EDITORA@teste', p_modulo: 'ternario', p_papel: 'editor' })).data).toBe('EDITORA@teste: editor em ternario')
    expect((await a.rpc('conceder_modulo', { p_email: 'leitor@teste', p_modulo: 'ternario', p_papel: 'leitor' })).error).toBeNull()
    expect((await a.rpc('conceder_modulo', { p_email: 'ninguem@teste', p_modulo: 'ternario', p_papel: 'leitor' })).error?.code).toBe('23503')
  })

  it('health diz quem edita; quem não foi liberado é barrado', async () => {
    expect(await criarApiTernario(sbPg(pool, EDITORA))('GET', '/health')).toEqual({ ok: true, db: 'supabase', podeEditar: true })
    expect(await criarApiTernario(sbPg(pool, leitor))('GET', '/health')).toMatchObject({ podeEditar: false })
    await expect(criarApiTernario(sbPg(pool, OUTRO))('GET', '/health')).rejects.toMatchObject({ status: 403 })
  })

  it('cria, lê, altera, move e exclui como a API original', async () => {
    const api = criarApiTernario(sbPg(pool, EDITORA))
    expect(await api('GET', '/workspace')).toEqual({ projects: [], updated_at: null })
    const p1 = await api('POST', '/projects', { name: 'Mestrado A', position: 0 }) as { id: number }
    const p2 = await api('POST', '/projects', { name: 'Mestrado B', position: 1 }) as { id: number }
    const dados = { vertices: { top: 'C/T', left: 'Água', right: 'Óleo' }, series: [{ name: '5:5', sc: 0.8, rows: [{ total: 1.8 }] }], free: [], opts: {} }
    const d = await api('POST', `/projects/${p1.id}/diagrams`, { name: 'DL1', position: 0, data: dados }) as { id: number; data: unknown }
    expect(d.data).toEqual(dados)
    const w1 = await api('GET', '/workspace') as { projects: { name: string; diagrams: { name: string }[] }[]; updated_at: string }
    expect(w1.projects.map((p) => [p.name, p.diagrams.map((x) => x.name)])).toEqual([['Mestrado A', ['DL1']], ['Mestrado B', []]])
    await api('PATCH', `/projects/${p2.id}`, { name: 'Mestrado B2', position: 1 })
    await api('PUT', `/diagrams/${d.id}`, { name: 'DL1', project_id: p2.id, position: 0, data: { ...dados, free: [{ a: 1 }] } })
    const w2 = await api('GET', '/workspace') as { projects: { name: string; diagrams: { data: { free: unknown[] } }[] }[]; updated_at: string }
    expect(w2.updated_at).not.toBe(w1.updated_at)
    expect(w2.projects[1]).toMatchObject({ name: 'Mestrado B2', diagrams: [{ data: { free: [{ a: 1 }] } }] })
    // 404 é o que o aplicativo usa para recriar um item que sumiu
    await expect(api('PUT', '/diagrams/999999', { name: 'x' })).rejects.toMatchObject({ status: 404 })
    await expect(api('PATCH', '/projects/999999', { name: 'x' })).rejects.toBeInstanceOf(ErroApi)
    await expect(api('POST', '/projects/999999/diagrams', { name: 'x' })).rejects.toMatchObject({ status: 404 })
    await api('DELETE', `/projects/${p1.id}`)
    expect((await api('GET', '/workspace') as { projects: unknown[] }).projects).toHaveLength(1)
    expect((await q(`select tabela from historico where operacao = 'DELETE' and tabela like 'ternario%'`)).map((r) => r.tabela)).toEqual(['ternario_projetos'])
    const [autor] = await q(`select criado_por, atualizado_por from ternario_diagramas`)
    expect(autor).toEqual({ criado_por: EDITORA, atualizado_por: EDITORA })
  })

  it('leitor vê e não grava; quem não foi liberado não vê nada', async () => {
    const api = criarApiTernario(sbPg(pool, leitor))
    expect((await api('GET', '/workspace') as { projects: unknown[] }).projects).toHaveLength(1)
    await expect(api('POST', '/projects', { name: 'invasor' })).rejects.toMatchObject({ status: 403 })
    const [{ id }] = await q(`select id from ternario_diagramas`)
    await expect(api('PUT', `/diagrams/${id}`, { name: 'mudado' })).rejects.toMatchObject({ status: 404 })
    expect((await q(`select nome from ternario_diagramas`))[0].nome).toBe('DL1')
    expect(await criarApiTernario(sbPg(pool, OUTRO))('GET', '/workspace')).toEqual({ projects: [], updated_at: null })
  })

  it.skipIf(!process.env.TERNARIO_HTML)('a página do aplicativo salva no banco pela ponte', async () => {
    await q(`delete from ternario_projetos`)
    // Playwright vem instalado globalmente no ambiente de teste (não é dependência do dashboard)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<any> } }
    const html = readFileSync(process.env.TERNARIO_HTML!)
    const host = `<!doctype html><html><body style="margin:0"><script>
      window.__lcpTernario = async (m, p, b) => { const r = await window.__node(m, p, b ?? null); if (r.erro) throw Object.assign(new Error(r.erro), { status: r.status }); return r.dados };
    </script><iframe id="f" src="/ternario/index.html" style="width:1300px;height:900px;border:0"></iframe></body></html>`
    const srv = createServer((req, res) => {
      if (req.url?.startsWith('/ternario/')) { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html) }
      else { res.setHeader('content-type', 'text/html'); res.end(host) }
    }).listen(0)
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/`
    const browser = await chromium.launch()
    try {
      for (const [usuario, esperado] of [[EDITORA, /salvo no banco/], [leitor, /somente leitura/]] as const) {
        const page = await browser.newPage()
        const api = criarApiTernario(sbPg(pool, usuario))
        await page.exposeFunction('__node', async (m: string, p: string, b: Record<string, unknown> | null) => {
          try { const dados = await api(m, p, b ?? undefined); if (process.env.TERNARIO_LOG) console.log('API', m, p, JSON.stringify(dados)?.slice(0, 80)); return { dados } } catch (e) { if (process.env.TERNARIO_LOG) console.log('ERRO', m, p, (e as Error).message); return { erro: (e as Error).message, status: (e as ErroApi).status } }
        })
        await page.goto(url)
        const f = page.frameLocator('#f')
        await expect.poll(async () => f.locator('#syncBadge').textContent(), { timeout: 15000 }).toMatch(esperado)
        if (usuario === EDITORA) {
          // banco vazio: a página envia o que tem (o exemplo embutido), como no aplicativo original
          await expect.poll(async () => (await q(`select count(*)::int n from ternario_projetos`))[0].n, { timeout: 10000 }).toBeGreaterThan(0)
          const n = (await q(`select count(*)::int n from ternario_diagramas`))[0].n
          expect(n).toBeGreaterThan(0)
          // o tema dentro do dashboard é o claro com o vermelho do LC PETRO
          const cor = await f.locator('html').evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
          expect(cor).toBe('#c8102e')
          if (process.env.TERNARIO_PRINT) await page.screenshot({ path: process.env.TERNARIO_PRINT })
        }
        await page.close()
      }
    } finally { await browser.close(); srv.close() }
  }, 60000)
})
