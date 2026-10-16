import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://haybihlhhdgyiemafmhf.supabase.co'
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_q9cJ_EGu1_dBtpmGT9UZ_g_xyaD5X-g'

export const supabase = createClient(url, chave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})

export const BUCKET_ARQUIVOS = 'arquivos'

/** Identificador do projeto Supabase conectado (mostrado, discreto, no cabeçalho). */
export const SUPABASE_REF = new URL(url).hostname.split('.')[0]

interface ErroBanco {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

const REGRAS_CONHECIDAS: Record<string, string> = {
  testemunho_tem_poco: 'Amostra de testemunho exige o poço preenchido.',
  um_nivel: 'O acesso deve ser dado à empresa OU ao projeto, nunca aos dois (nem a nenhum).',
  geral_nao_tem_projeto: 'Publicação da categoria "geral" não pode ser restrita a um projeto.',
}

/**
 * Traduz o erro do Supabase para uma mensagem em português que diz o que aconteceu
 * e o que fazer. Nunca devolve texto vazio para um erro: nada pode falhar em silêncio.
 */
export function tratarErro(erro: unknown): string {
  if (!erro) return ''
  const e = (typeof erro === 'object' ? erro : { message: String(erro) }) as ErroBanco
  const msg = e.message || String(erro)
  const detalhe = e.details || ''
  const texto = `${msg} ${detalhe}`

  switch (e.code) {
    case '42501':
      return 'Sem permissão para gravar: seu usuário precisa ser editor deste projeto (ou administrador). ' +
        'Peça o acesso em Empresas & Projetos. (42501)'

    case '23503': {
      const falta = texto.match(/Key \((.+?)\)=\((.+?)\) is not present in table "(.+?)"/)
      if (falta) {
        return `Referência inexistente: "${falta[2]}" (campo ${falta[1]}) não está cadastrado em ${falta[3]}. ` +
          'Cadastre esse item antes e grave de novo. (23503)'
      }
      const emUso = texto.match(/is still referenced from table "(.+?)"/)
      if (emUso) {
        return `Não é possível apagar: ainda há registros em ${emUso[1]} que usam este item. ` +
          'Apague ou altere esses registros antes. (23503)'
      }
      return `Referência inexistente: o item referenciado não está cadastrado. Cadastre-o antes e grave de novo. (23503: ${msg})`
    }

    case '42703':
    case 'PGRST204': {
      const coluna = texto.match(/'(.+?)' column of '(.+?)'/) || texto.match(/column "?([\w.]+)"?(?: of relation "(.+?)")? does not exist/)
      const qual = coluna ? `"${coluna[1]}"${coluna[2] ? ` na tabela ${coluna[2]}` : ''}` : ''
      return `Coluna inexistente no banco${qual ? `: ${qual}` : ''}. O app está enviando um campo que a tabela não tem; ` +
        `nada foi gravado. Avise quem mantém o sistema. (${e.code})`
    }

    case '428C9': {
      const coluna = texto.match(/column "(.+?)"/)
      return `A coluna ${coluna ? `"${coluna[1]}" ` : ''}é calculada pelo banco e não pode ser enviada; nada foi gravado. ` +
        'Avise quem mantém o sistema. (428C9)'
    }

    case '23505': {
      const chave = texto.match(/Key \((.+?)\)=\((.+?)\) already exists/)
      return chave
        ? `Já existe um registro com ${chave[1]} = "${chave[2]}". Use outro valor ou edite o registro existente. (23505)`
        : 'Já existe um registro com este identificador (código ou sigla duplicada). (23505)'
    }

    case '23502': {
      const coluna = texto.match(/column "(.+?)"/)
      return `Campo obrigatório vazio${coluna ? `: ${coluna[1]}` : ''}. Preencha e grave de novo. (23502)`
    }

    case '23514': {
      const regra = texto.match(/check constraint "(.+?)"/)
      if (regra && REGRAS_CONHECIDAS[regra[1]]) return `${REGRAS_CONHECIDAS[regra[1]]} (23514)`
      return `Valor fora do permitido pelo banco${regra ? ` (regra ${regra[1]})` : ''}: confira faixas como ` +
        'porcentagem entre 0 e 100 e valores que não podem ser negativos ou zero. (23514)'
    }

    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return `Valor em formato inválido (número ou data): ${msg}. Corrija o campo e grave de novo. (${e.code})`

    case 'PGRST116':
      return 'Nada foi gravado: o registro não existe mais ou seu usuário não tem permissão de editor para alterá-lo.'

    case 'PGRST205':
      return `Tabela inexistente no banco: ${msg}. Avise quem mantém o sistema. (PGRST205)`
  }

  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (/row-level security|not authorized|Unauthorized/i.test(msg)) {
    return 'Sem permissão para gravar: seu usuário precisa ser editor deste projeto (ou administrador).'
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'Sem conexão com o Supabase. Confira a internet e tente de novo; nada foi gravado.'
  }
  return e.code ? `Erro do banco (${e.code}): ${msg}` : msg
}
