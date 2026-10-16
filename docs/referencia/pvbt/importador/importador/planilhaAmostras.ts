// =============================================================================
// Importador da PLANILHA DE CONTROLE DE ROCHAS (amostras do laboratório).
//
// Como a planilha real é (conferido no arquivo do laboratório):
//   - uma aba por tabela: "coreflooding" (plugs) e outra para RDA (discos;
//     a aba pode se chamar "Planilha2" — o nome NÃO é confiável);
//   - cada aba tem uma Tabela do Excel (Tabela2, Tabela3...) que NÃO começa na
//     linha 1: a linha 1 fica vazia e o cabeçalho está na linha 2;
//   - colunas automáticas "Coluna1", "Coluna2", "Coluna3" (vazias);
//   - a coluna de conferência traz a DATA e os NOMES no título
//     ("Conferência 11/08/26 - Heitor e Dulcidio") e "ok" nas células;
//     na tabela de RDA o título é só "Conferência";
//   - datas vêm como número serial do Excel (45075 = 29/05/2023);
//   - status: Disponível · Reservada · Utilizada · Não localizada(o);
//   - formação com nomes curtos/variantes: "Indiana", "Sillurian", "Pink desert".
//   - segmentações (filtros visuais) existem na planilha e são ignoradas.
//
// Fluxo na tela (igual ao importador da literatura):
//   1. lerArquivoBruto(file)                    -> PlanilhaBruta (linhas cruas por aba)
//   2. encontrarBlocos(bruta)                    -> BlocoAmostras[] (cabeçalho achado + mapeamento sugerido)
//      a pessoa confere/corrige o mapeamento de colunas e o tipo de cada bloco
//   3. analisarAmostras(blocos, opcoes)          -> AnaliseAmostras (nada é gravado)
//   4. conferirNoBanco(sb, analise)              -> acrescenta problemas que dependem do banco
//   5. gravarAmostras(sb, analise, {pularErros}) -> grava (amostra por código; petrofísica e
//      conferência sem duplicar: mesma amostra + mesmo momento/data = atualiza)
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanilhaBruta = Record<string, unknown[][]>;
export type Severidade = "ERRO" | "AVISO" | "CORRIGIDO";
export type TipoBloco = "coreflooding" | "rda";
export type StatusAmostra = "disponivel" | "reservada" | "em ensaio" | "utilizada" | "nao localizada" | "arquivada";

export interface Problema {
  severidade: Severidade;
  aba: string;
  linha: number | null;     // linha no Excel (1 = primeira linha da aba)
  id: string | null;        // código da amostra
  campo: string;
  mensagem: string;
}

// ---------------------------------------------------------------------------
// Destinos possíveis de uma coluna (o passo de mapeamento usa esta lista)
// ---------------------------------------------------------------------------
export const DESTINOS = {
  ignorar: "— ignorar —",
  codigo: "Amostra · código",
  litologia: "Amostra · formação/litologia",
  conferencia: "Conferência (data e nomes no título)",
  permeabilidade_fabricante_md: "Amostra · permeabilidade do fabricante (mD)",
  dimensoes_in: "Amostra · dimensões D×L (in) — só conferência",
  diametro_cm: "Amostra · diâmetro (cm)",
  comprimento_cm: "Amostra · comprimento (cm)",
  massa_seca_g: "Amostra · massa (g)",
  status: "Amostra · status",
  observacoes: "Amostra · observações",
  utilizacao: "Utilização (texto do ensaio RDA)",
  petro_data: "Petrofísica · data",
  petro_porosidade: "Petrofísica · porosidade (%)",
  petro_perm_gas: "Petrofísica · permeabilidade ao gás (mD)",
  petro_perm_liquido: "Petrofísica · permeabilidade em fluxo/líquido (mD)",
  petro_dens_grao: "Petrofísica · densidade de grão (g/cm³)",
  petro_dens_grao_calc: "Petrofísica · densidade de grão calculada (g/cm³)",
  petro_dens_bulk: "Petrofísica · densidade bulk (g/cm³)",
  petro_dens_aparente: "Petrofísica · densidade aparente (g/cm³)",
  depois_massa: "Petrofísica depois da acidificação · massa (g)",
  depois_porosidade: "Petrofísica depois da acidificação · porosidade (%)",
} as const;
export type Destino = keyof typeof DESTINOS;

export interface BlocoAmostras {
  aba: string;
  linhaCabecalho: number;              // linha do Excel
  tipo: TipoBloco;                     // sugerido; a pessoa pode trocar
  colunas: string[];                   // títulos como estão na planilha
  mapeamento: Destino[];               // um destino por coluna (mesma ordem)
  linhas: { linha: number; valores: unknown[] }[];
}

export interface OpcoesAmostras {
  projetoId: string;
  tipoOrigem?: "afloramento" | "testemunho";   // padrão afloramento
  litologiasExistentes?: string[];             // nomes do catálogo (para casar "Indiana" -> "Indiana Limestone")
  /** Para colunas "Conferência" sem data no título. */
  conferenciaPadrao?: { data?: string; responsaveis?: string };
}

export interface AmostraImportada {
  _aba: string; _linha: number;
  codigo: string; projeto_id: string; litologia: string; tipo_origem: string;
  finalidade: string; status: StatusAmostra | null;
  diametro_cm: number | null; comprimento_cm: number | null; massa_seca_g: number | null;
  permeabilidade_fabricante_md: number | null;
  /** fabricante costuma dar faixa ("30-50", "2 - 4 md"): min = max quando é um valor só */
  permeabilidade_fabricante_min_md: number | null; permeabilidade_fabricante_max_md: number | null;
  observacoes: string | null;
}
export interface PetrofisicaImportada {
  _aba: string; _linha: number; codigo: string;
  momento: "antes" | "depois"; data_ensaio: string | null;
  porosidade_pct: number | null; permeabilidade_gas_md: number | null; permeabilidade_liquido_md: number | null;
  densidade_grao_g_cm3: number | null; densidade_bulk_g_cm3: number | null; densidade_aparente_g_cm3: number | null;
  massa_g: number | null;
}
export interface ConferenciaImportada {
  _aba: string; _linha: number; codigo: string;
  data: string; responsaveis: string; resultado: string;
}
export interface SugestaoRda {
  _aba: string; _linha: number; codigo: string; texto: string;
  ensaio: string | null; acido: string | null; concentracao: number | null; unidade: string | null;
  formacao: string | null; temperatura_c: number | null; rotacao_rpm: number | null;
}

export interface AnaliseAmostras {
  amostras: AmostraImportada[];
  petrofisicas: PetrofisicaImportada[];
  conferencias: ConferenciaImportada[];
  sugestoesRda: SugestaoRda[];
  litologiasNovas: string[];
  problemas: Problema[];
  colunasIgnoradas: { aba: string; coluna: string }[];
  erros: number; avisos: number; corrigidos: number;
  /** códigos com ERRO (ficam de fora se a pessoa marcar "deixar de fora") */
  codigosComErro: string[];
  /** preenchido por conferirNoBanco: códigos que já existem e serão atualizados */
  existentes?: string[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const NULOS = new Set(["", "-", "—", "–", "nan", "none", "n/a", "na", "(vazio)"]);

/** minúsculas, sem acento, sem pontuação, espaços simples */
export function chave(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return NULOS.has(s.toLowerCase()) ? null : s;
}

/** número; aceita "0,5", "5,2e-7", "1.234,5". NaN = inválido. null = vazio. */
export function numero(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s0 = texto(v);
  if (s0 == null) return null;
  let s = s0.replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const SERIAL_MIN = 25569;   // 01/01/1970
const SERIAL_MAX = 54789;   // 31/12/2049
export function serialParaData(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}
const pareceSerialDeData = (n: number) => Number.isInteger(n) && n >= 36526 && n <= SERIAL_MAX; // 2000–2049

/** Data em aaaa-mm-dd a partir de serial do Excel, Date ou texto dd/mm/aa(aa). null = vazio, "" = inválida */
export function data(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number") return v >= SERIAL_MIN && v <= SERIAL_MAX ? serialParaData(Math.floor(v)) : "";
  const s = texto(v);
  if (s == null) return null;
  return dataDeTexto(s) ?? (/^\d+(\.\d+)?$/.test(s) ? data(Number(s)) : "");
}

function dataDeTexto(s: string): string | null {
  let m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    const [d, mes] = [Number(m[1]), Number(m[2])];
    let ano = Number(m[3]);
    if (ano < 100) ano += 2000;
    if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
    return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export const fmtData = (iso: string) => iso.split("-").reverse().join("/");

// ---------------------------------------------------------------------------
// 1. Mapeamento automático de colunas (por título normalizado)
// ---------------------------------------------------------------------------
const REGRAS: [RegExp, Destino][] = [
  [/^coluna \d+$/, "ignorar"],
  [/^codigo/, "codigo"],
  [/^(formacao|litologia|litotipo|rocha)/, "litologia"],
  [/^conferencia/, "conferencia"],
  [/^permeabilidade fabri/, "permeabilidade_fabricante_md"],
  [/^dimens/, "dimensoes_in"],
  [/^diametro/, "diametro_cm"],
  [/^comprimento/, "comprimento_cm"],
  [/^massa apos/, "depois_massa"],
  [/^porosidade apos/, "depois_porosidade"],
  [/^massa/, "massa_seca_g"],
  [/^data da petro/, "petro_data"],
  [/^densidade bulk/, "petro_dens_bulk"],
  [/^densidade de grao calculada/, "petro_dens_grao_calc"],
  [/^densidade (do|de) grao/, "petro_dens_grao"],
  [/^densidade aparente/, "petro_dens_aparente"],
  [/^permeabilidade (a|ao) gas/, "petro_perm_gas"],
  [/^permeabilidade (em fluxo|ao liquido|liquido)/, "petro_perm_liquido"],
  // tabela de RDA: "Permeabilidade (mD)" traz faixas do fornecedor ("16-20", "2 - 4 md"):
  // é a permeabilidade do fabricante, não uma medida do laboratório
  [/^permeabilidade( md)?$/, "permeabilidade_fabricante_md"],
  [/^porosidade/, "petro_porosidade"],
  [/^status/, "status"],
  [/^obs/, "observacoes"],
  [/^utilizacao/, "utilizacao"],
];

export function sugerirDestino(titulo: string): Destino {
  const k = chave(titulo);
  if (!k) return "ignorar";
  for (const [re, d] of REGRAS) if (re.test(k)) return d;
  return "ignorar";
}

/** Acha, em cada aba, a linha de cabeçalho (a que tem "Código") e as linhas de dados abaixo dela. */
export function encontrarBlocos(bruta: PlanilhaBruta): BlocoAmostras[] {
  const blocos: BlocoAmostras[] = [];
  for (const [aba, linhas] of Object.entries(bruta)) {
    let atual: BlocoAmostras | null = null;
    linhas.forEach((valores, i) => {
      const vazia = !valores || valores.every((v) => texto(v) == null);
      const ehCabecalho = !vazia && valores.some((v) => /^codigo( da amostra)?$/.test(chave(v)));
      if (ehCabecalho) {
        const colunas = valores.map((v) => String(v ?? "").trim());
        atual = { aba, linhaCabecalho: i + 1, tipo: "coreflooding", colunas, mapeamento: colunas.map(sugerirDestino), linhas: [] };
        blocos.push(atual);
        return;
      }
      if (atual && !vazia) atual.linhas.push({ linha: i + 1, valores });
    });
  }
  for (const b of blocos) b.tipo = sugerirTipo(b);
  return blocos;
}

/** RDA: tem "Utilização" com texto de ensaio (TR - ácido [conc]...) ou nome da aba/códigos de RDA. */
export function sugerirTipo(b: Pick<BlocoAmostras, "aba" | "colunas" | "mapeamento" | "linhas">): TipoBloco {
  if (/rda|disco/.test(chave(b.aba))) return "rda";
  if (/core|plug/.test(chave(b.aba))) return "coreflooding";
  const iUt = b.mapeamento.indexOf("utilizacao");
  if (iUt >= 0 && b.linhas.some((l) => /\[.*\]|@\s*\d+|°\s*c/i.test(String(l.valores[iUt] ?? "")))) return "rda";
  const iCod = b.mapeamento.indexOf("codigo");
  if (iCod >= 0 && b.linhas.some((l) => /^rda/i.test(String(l.valores[iCod] ?? "")))) return "rda";
  return "coreflooding";
}

// ---------------------------------------------------------------------------
// 2. Regras de padronização
// ---------------------------------------------------------------------------
const STATUS: Record<string, StatusAmostra> = {
  "disponivel": "disponivel", "cadastrada": "disponivel", "livre": "disponivel",
  "reservada": "reservada", "reservado": "reservada",
  "em ensaio": "em ensaio", "em uso": "em ensaio",
  "utilizada": "utilizada", "utilizado": "utilizada", "usada": "utilizada", "acidificada": "utilizada",
  "nao localizada": "nao localizada", "nao localizado": "nao localizada", "perdida": "nao localizada",
  "arquivada": "arquivada", "descartada": "arquivada",
};

const ERROS_DIGITACAO: Record<string, string> = { "sillurian": "silurian", "jandaira": "jandaira" };
const CONECTIVOS = new Set(["de", "do", "da", "dos", "das", "e"]);

function capitalizar(s: string) {
  return s.trim().replace(/\s+/g, " ").split(" ")
    .map((p, i) => (i > 0 && CONECTIVOS.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Casa o nome da planilha com o catálogo: exato, ou "Indiana" -> "Indiana Limestone" (começo único). */
export function casarLitologia(original: string, catalogo: string[]): { nome: string; nova: boolean } {
  let k = chave(original);
  for (const [errado, certo] of Object.entries(ERROS_DIGITACAO)) k = k.replace(new RegExp(`\\b${errado}\\b`), certo);
  const porChave = new Map(catalogo.map((n) => [chave(n), n]));
  const exato = porChave.get(k);
  if (exato) return { nome: exato, nova: false };
  const comeco = catalogo.filter((n) => chave(n).startsWith(k + " "));
  if (comeco.length === 1) return { nome: comeco[0], nova: false };
  const corrigido = original.replace(/sillurian/i, "Silurian");
  return { nome: capitalizar(corrigido), nova: true };
}

/** "TR - HCl [0,5M] - Indiana - 25 °C @100" -> partes. Só sugestão: não cria análise. */
export function lerUtilizacao(s: string): Omit<SugestaoRda, "_aba" | "_linha" | "codigo"> {
  const partes = s.split(/\s+-\s+/).map((p) => p.trim());
  const conc = /\[\s*([\d.,]+)\s*([a-z%/ ]*)\]/i.exec(s);
  const acido = /([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 +]*?)\s*\[/.exec(s);
  const temp = /([\d.,]+)\s*°\s*C/i.exec(s);
  const rpm = /@\s*([\d.,]+)/.exec(s);
  const formacao = partes.find((p, i) => i > 1 && !/°|@|\[/.test(p)) ?? null;
  const num = (x: string | undefined) => (x == null ? null : numero(x));
  return {
    texto: s,
    ensaio: partes.length > 1 && !/\[/.test(partes[0]) ? partes[0] : null,
    acido: acido ? acido[1].trim() : null,
    concentracao: num(conc?.[1]),
    unidade: conc ? (conc[2].trim() || null) : null,
    formacao,
    temperatura_c: num(temp?.[1]),
    rotacao_rpm: num(rpm?.[1]),
  };
}

/** Faixas plausíveis (fora delas = AVISO, exceto porosidade fora de 0–100 = ERRO). */
const FAIXAS: Partial<Record<Destino, [number, number, string]>> = {
  diametro_cm: [1, 15, "cm"], comprimento_cm: [0.3, 50, "cm"], massa_seca_g: [1, 5000, "g"],
  permeabilidade_fabricante_md: [0, 20000, "mD"], petro_perm_gas: [0, 20000, "mD"], petro_perm_liquido: [0, 20000, "mD"],
  petro_dens_grao: [2.0, 3.2, "g/cm³"], petro_dens_grao_calc: [2.0, 3.2, "g/cm³"],
  petro_dens_bulk: [1.2, 3.0, "g/cm³"], petro_dens_aparente: [1.2, 3.0, "g/cm³"], depois_massa: [1, 5000, "g"],
};

// ---------------------------------------------------------------------------
// 3. Análise (não grava nada)
// ---------------------------------------------------------------------------
export function analisarAmostras(blocos: BlocoAmostras[], opcoes: OpcoesAmostras): AnaliseAmostras {
  const problemas: Problema[] = [];
  const add = (severidade: Severidade, aba: string, linha: number | null, id: string | null, campo: string, mensagem: string) =>
    problemas.push({ severidade, aba, linha, id, campo, mensagem });
  const amostras: AmostraImportada[] = [];
  const petrofisicas: PetrofisicaImportada[] = [];
  const conferencias: ConferenciaImportada[] = [];
  const sugestoesRda: SugestaoRda[] = [];
  const colunasIgnoradas: { aba: string; coluna: string }[] = [];
  const catalogo = [...(opcoes.litologiasExistentes ?? [])];
  const novas = new Set<string>();
  const vistos = new Map<string, string>();       // código -> "aba linha N"
  const tipoOrigem = opcoes.tipoOrigem ?? "afloramento";

  if (!opcoes.projetoId) add("ERRO", "—", null, null, "projeto", "escolha o projeto de destino antes de importar");
  if (tipoOrigem === "testemunho")
    add("ERRO", "—", null, null, "tipo_origem", "a planilha não tem coluna de poço; amostras de testemunho exigem poço — importe como afloramento e complete no cadastro");

  for (const b of blocos) {
    const col = (d: Destino) => b.mapeamento.indexOf(d);
    b.mapeamento.forEach((d, i) => { if (d === "ignorar" && b.colunas[i] && !/^coluna ?\d+$/i.test(b.colunas[i])) colunasIgnoradas.push({ aba: b.aba, coluna: b.colunas[i] }); });
    if (col("codigo") < 0) { add("ERRO", b.aba, b.linhaCabecalho, null, "codigo", "nenhuma coluna mapeada como código"); continue; }
    if (col("litologia") < 0) add("ERRO", b.aba, b.linhaCabecalho, null, "litologia", "nenhuma coluna mapeada como formação/litologia");

    // conferência: data e nomes do título da coluna
    const iConf = col("conferencia");
    let conf: { data: string | null; responsaveis: string | null } | null = null;
    if (iConf >= 0) {
      const titulo = b.colunas[iConf];
      const dt = dataDeTexto(titulo);
      const nomes = /\d{2,4}\s*-\s*(.+)$/.exec(titulo)?.[1]?.trim() ?? null;
      conf = { data: dt ?? opcoes.conferenciaPadrao?.data ?? null, responsaveis: nomes ?? opcoes.conferenciaPadrao?.responsaveis ?? null };
      if (!dt && b.linhas.some((l) => texto(l.valores[iConf]) != null && data(l.valores[iConf]) === "") && !opcoes.conferenciaPadrao?.data)
        add("AVISO", b.aba, b.linhaCabecalho, null, "conferencia", `o título "${titulo}" não tem data: informe a data da conferência na tela, senão ela não é gravada`);
    }

    for (const { linha: L, valores } of b.linhas) {
      const v = (d: Destino) => { const i = col(d); return i >= 0 ? valores[i] : null; };
      const codigoOrig = texto(v("codigo"));
      if (!codigoOrig) { add("ERRO", b.aba, L, null, "codigo", "linha com dados mas sem código da amostra"); continue; }
      const codigo = codigoOrig.replace(/\s+/g, "").toUpperCase();
      if (codigo !== codigoOrig) add("CORRIGIDO", b.aba, L, codigo, "codigo", `'${codigoOrig}' -> '${codigo}'`);
      if (vistos.has(codigo)) { add("ERRO", b.aba, L, codigo, "codigo", `código repetido (já usado em ${vistos.get(codigo)}); as duas linhas ficam de fora até resolver`); continue; }
      vistos.set(codigo, `${b.aba} linha ${L}`);

      // números com faixa
      const num = (d: Destino): number | null => {
        const bruto = v(d);
        const n = numero(bruto);
        if (n == null) return null;
        if (Number.isNaN(n)) { add("ERRO", b.aba, L, codigo, b.colunas[col(d)], `não é número: ${String(bruto)}`); return null; }
        const f = FAIXAS[d];
        if (f && (n < f[0] || n > f[1])) {
          if (pareceSerialDeData(n) && f[1] <= 20000) {
            add("AVISO", b.aba, L, codigo, b.colunas[col(d)], `${n} parece uma data do Excel (${fmtData(serialParaData(n))}), não um valor em ${f[2]}: confira a célula. Não será gravado.`);
            return null;
          }
          add("AVISO", b.aba, L, codigo, b.colunas[col(d)], `${n} ${f[2]} fora da faixa esperada (${f[0]}–${f[1]}); confira`);
        }
        return n;
      };
      // permeabilidade do fabricante: valor único ou faixa "30-50", "80 - 230", "2 - 4 md", "2 a 4"
      const permFabricante = (): [number | null, number | null, number | null] => {
        const bruto = v("permeabilidade_fabricante_md");
        const t = texto(bruto);
        if (t == null) return [null, null, null];
        // O Excel transforma a faixa digitada "2-4" na data 2 de abril (serial 46114 = 02/04/2026).
        // Desfaz: dia e mês da data são os dois números da faixa.
        if (typeof bruto === "number" && pareceSerialDeData(bruto)) {
          const [, mes, dia] = serialParaData(bruto).split("-").map(Number);
          const [a, z] = [Math.min(dia, mes), Math.max(dia, mes)];
          add("CORRIGIDO", b.aba, L, codigo, b.colunas[col("permeabilidade_fabricante_md")],
            `${bruto} é a data ${fmtData(serialParaData(bruto))}: o Excel converteu a faixa "${dia}-${mes}" em data. Gravado como ${a}–${z} mD; formate a coluna como Texto na planilha para não acontecer de novo.`);
          return [null, a, z];
        }
        const m = /^\s*([\d.,]+)\s*(?:-|–|—|a|até)\s*([\d.,]+)\s*(?:md)?\s*$/i.exec(t);
        if (m && typeof bruto !== "number") {
          let [a, z] = [numero(m[1]), numero(m[2])];
          if (a == null || z == null || Number.isNaN(a) || Number.isNaN(z)) { add("ERRO", b.aba, L, codigo, b.colunas[col("permeabilidade_fabricante_md")], `faixa inválida: ${t}`); return [null, null, null]; }
          if (a > z) [a, z] = [z, a];
          return [null, a, z];
        }
        const n = typeof bruto === "number" ? num("permeabilidade_fabricante_md") : (() => {
          const semUnidade = t.replace(/\s*md\s*$/i, "");
          const x = numero(semUnidade);
          if (x == null) return null;
          if (Number.isNaN(x)) { add("ERRO", b.aba, L, codigo, b.colunas[col("permeabilidade_fabricante_md")], `não é número nem faixa (ex.: 30-50): ${t}`); return null; }
          return x;
        })();
        return [n, n, n];
      };
      const pct = (d: Destino): number | null => {
        const n = num(d);
        if (n != null && (n < 0 || n > 100)) { add("ERRO", b.aba, L, codigo, b.colunas[col(d)], `${n} % fora de 0–100`); return null; }
        return n;
      };

      // litologia
      const litOrig = texto(v("litologia"));
      let litologia = "";
      if (!litOrig) add("ERRO", b.aba, L, codigo, "litologia", "formação vazia");
      else {
        const r = casarLitologia(litOrig, catalogo);
        litologia = r.nome;
        if (r.nova) {
          if (!novas.has(r.nome)) add("AVISO", b.aba, L, codigo, "litologia", `'${r.nome}' não está no catálogo de litologias; será criada`);
          novas.add(r.nome); catalogo.push(r.nome);
        } else if (r.nome !== litOrig) add("CORRIGIDO", b.aba, L, codigo, "litologia", `'${litOrig}' -> '${r.nome}'`);
      }

      // status
      const stOrig = texto(v("status"));
      let status: StatusAmostra | null = null;
      if (stOrig) {
        status = STATUS[chave(stOrig)] ?? null;
        if (!status) add("ERRO", b.aba, L, codigo, "status", `'${stOrig}' não é um status conhecido (Disponível, Reservada, Em ensaio, Utilizada, Não localizada, Arquivada)`);
      }

      // geometria: cm medidos; dimensões em polegadas só conferem/completam
      let diametro = num("diametro_cm"), comprimento = num("comprimento_cm");
      const dim = texto(v("dimensoes_in"));
      if (dim) {
        const m = /([\d.,]+)\s*[x×]\s*([\d.,]+)/i.exec(dim);
        if (!m) add("AVISO", b.aba, L, codigo, "dimensoes_in", `'${dim}' não está no formato DxL (ex.: 1.5x3)`);
        else {
          const [dCm, lCm] = [Number(m[1].replace(",", ".")) * 2.54, Number(m[2].replace(",", ".")) * 2.54];
          if (diametro == null) { diametro = Math.round(dCm * 100) / 100; add("CORRIGIDO", b.aba, L, codigo, "diametro_cm", `vazio: calculado de ${dim} in = ${diametro} cm`); }
          else if (Math.abs(diametro - dCm) > 0.3) add("AVISO", b.aba, L, codigo, "diametro_cm", `${diametro} cm não bate com ${dim} in (${dCm.toFixed(2)} cm)`);
          if (comprimento == null) { comprimento = Math.round(lCm * 100) / 100; add("CORRIGIDO", b.aba, L, codigo, "comprimento_cm", `vazio: calculado de ${dim} in = ${comprimento} cm`); }
          else if (Math.abs(comprimento - lCm) > 1.0) add("AVISO", b.aba, L, codigo, "comprimento_cm", `${comprimento} cm não bate com ${dim} in (${lCm.toFixed(2)} cm)`);
        }
      }

      // observações + utilização
      const obs = texto(v("observacoes"));
      const ut = texto(v("utilizacao"));
      const observacoes = [obs, ut ? `Utilização: ${ut}` : null].filter(Boolean).join(" · ") || null;
      if (ut && b.tipo === "rda") sugestoesRda.push({ _aba: b.aba, _linha: L, codigo, ...lerUtilizacao(ut) });

      amostras.push({
        _aba: b.aba, _linha: L, codigo, projeto_id: opcoes.projetoId, litologia, tipo_origem: tipoOrigem,
        finalidade: b.tipo === "rda" ? "RDA" : "coreflooding", status,
        diametro_cm: diametro, comprimento_cm: comprimento, massa_seca_g: num("massa_seca_g"),
        ...(() => { const [v0, mi, ma] = permFabricante(); return { permeabilidade_fabricante_md: v0, permeabilidade_fabricante_min_md: mi, permeabilidade_fabricante_max_md: ma }; })(),
        observacoes,
      });

      // petrofísica ANTES
      const dtBruta = v("petro_data");
      let dataPetro = data(dtBruta);
      if (dataPetro === "") { add("ERRO", b.aba, L, codigo, b.colunas[col("petro_data")], `data inválida: ${String(dtBruta)}`); dataPetro = null; }
      let grao = num("petro_dens_grao");
      const graoCalc = num("petro_dens_grao_calc");
      if (grao == null && graoCalc != null) { grao = graoCalc; add("AVISO", b.aba, L, codigo, "densidade de grão", "sem densidade de grão medida: usada a calculada"); }
      const antes: PetrofisicaImportada = {
        _aba: b.aba, _linha: L, codigo, momento: "antes", data_ensaio: dataPetro,
        porosidade_pct: pct("petro_porosidade"), permeabilidade_gas_md: num("petro_perm_gas"),
        permeabilidade_liquido_md: num("petro_perm_liquido"), densidade_grao_g_cm3: grao,
        densidade_bulk_g_cm3: num("petro_dens_bulk"), densidade_aparente_g_cm3: num("petro_dens_aparente"), massa_g: null,
      };
      const temValor = (p: PetrofisicaImportada) =>
        [p.porosidade_pct, p.permeabilidade_gas_md, p.permeabilidade_liquido_md, p.densidade_grao_g_cm3, p.densidade_bulk_g_cm3, p.densidade_aparente_g_cm3, p.massa_g].some((x) => x != null);
      if (temValor(antes)) petrofisicas.push(antes);
      else if (dataPetro) add("AVISO", b.aba, L, codigo, "petrofísica", "tem data da petrofísica mas nenhum resultado; não gravada");

      // petrofísica DEPOIS da acidificação
      const depois: PetrofisicaImportada = {
        _aba: b.aba, _linha: L, codigo, momento: "depois", data_ensaio: null,
        porosidade_pct: pct("depois_porosidade"), permeabilidade_gas_md: null, permeabilidade_liquido_md: null,
        densidade_grao_g_cm3: null, densidade_bulk_g_cm3: null, densidade_aparente_g_cm3: null, massa_g: num("depois_massa"),
      };
      if (temValor(depois)) petrofisicas.push(depois);

      // conferência
      if (iConf >= 0 && conf) {
        const bruto = valores[iConf];
        const t = texto(bruto);
        if (t != null) {
          const dataNaCelula = data(bruto);
          const dt = dataNaCelula && dataNaCelula !== "" ? dataNaCelula : conf.data;
          const resultado = dataNaCelula && dataNaCelula !== "" ? "ok" : chave(t) === "ok" || chave(t) === "sim" ? "ok" : t.toLowerCase();
          if (dt) conferencias.push({ _aba: b.aba, _linha: L, codigo, data: dt, responsaveis: conf.responsaveis ?? "não informado", resultado });
        }
      }
    }
  }

  const comErro = new Set(problemas.filter((p) => p.severidade === "ERRO" && p.id).map((p) => p.id as string));
  return {
    amostras, petrofisicas, conferencias, sugestoesRda,
    litologiasNovas: [...novas], problemas, colunasIgnoradas,
    erros: problemas.filter((p) => p.severidade === "ERRO").length,
    avisos: problemas.filter((p) => p.severidade === "AVISO").length,
    corrigidos: problemas.filter((p) => p.severidade === "CORRIGIDO").length,
    codigosComErro: [...comErro],
  };
}

// ---------------------------------------------------------------------------
// 4. Conferência no banco (antes de gravar): códigos que já existem
// ---------------------------------------------------------------------------
export async function conferirNoBanco(sb: SupabaseClient, a: AnaliseAmostras): Promise<AnaliseAmostras> {
  const codigos = a.amostras.map((x) => x.codigo);
  const existentes: { codigo: string; projeto_id: string }[] = [];
  for (let i = 0; i < codigos.length; i += 200) {
    const { data: d, error } = await sb.from("amostras").select("codigo, projeto_id").in("codigo", codigos.slice(i, i + 200));
    if (error) throw new Error(traduzir(error, "amostras"));
    existentes.push(...(d ?? []));
  }
  const problemas = [...a.problemas];
  for (const e of existentes) {
    const am = a.amostras.find((x) => x.codigo === e.codigo);
    if (am && e.projeto_id !== am.projeto_id)
      problemas.push({ severidade: "ERRO", aba: am._aba, linha: am._linha, id: am.codigo, campo: "codigo",
        mensagem: "esta amostra já existe em OUTRO projeto; a importação não muda o projeto de uma amostra (troque no cadastro, se for o caso)" });
  }
  const comErro = new Set(problemas.filter((p) => p.severidade === "ERRO" && p.id).map((p) => p.id as string));
  return {
    ...a, problemas, existentes: existentes.map((e) => e.codigo),
    erros: problemas.filter((p) => p.severidade === "ERRO").length, codigosComErro: [...comErro],
  };
}

// ---------------------------------------------------------------------------
// 5. Gravação
// ---------------------------------------------------------------------------
export interface ResultadoAmostras {
  amostras: { inseridas: number; atualizadas: number };
  petrofisicas: { inseridas: number; atualizadas: number };
  conferencias: { inseridas: number; atualizadas: number };
  litologias: number;
  deixadasDeFora: string[];
  /** amostras que o banco recusou (ex.: código que já existe num projeto que você não vê) */
  recusadas: { codigo: string; motivo: string }[];
}

function traduzir(e: { code?: string; message: string; details?: string | null }, tabela: string): string {
  if (e.code === "42501") return `Sem permissão para gravar em ${tabela}: seu usuário precisa ser editor do projeto ou administrador.`;
  if (e.code === "23505") return `${tabela}: código já existe (possivelmente numa amostra de outro projeto que você não vê). ${e.details ?? ""}`;
  if (e.code === "23503") return `${tabela}: referência inexistente. ${e.details ?? e.message}`;
  if (e.code === "23514") return `${tabela}: valor recusado pelas regras do banco (${e.message}).`;
  return `${tabela}: ${e.message}`;
}

const semNulos = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => v != null && !k.startsWith("_") && k !== "codigo")) as Partial<T>;

export async function gravarAmostras(
  sb: SupabaseClient, a: AnaliseAmostras,
  op: { pularErros?: boolean; aoProgresso?: (etapa: string, feito: number, total: number) => void } = {},
): Promise<ResultadoAmostras> {
  if (a.erros > 0 && !op.pularErros) throw new Error(`Há ${a.erros} erro(s). Corrija a planilha ou marque "deixar de fora as linhas com erro".`);
  if (a.problemas.some((p) => p.severidade === "ERRO" && !p.id)) throw new Error("Há erros gerais (projeto, mapeamento ou tipo de origem) que impedem a importação.");
  const fora = new Set(a.codigosComErro);
  const amostras = a.amostras.filter((x) => !fora.has(x.codigo) && x.litologia);
  const progresso = op.aoProgresso ?? (() => {});
  const r: ResultadoAmostras = {
    amostras: { inseridas: 0, atualizadas: 0 }, petrofisicas: { inseridas: 0, atualizadas: 0 },
    conferencias: { inseridas: 0, atualizadas: 0 }, litologias: 0, deixadasDeFora: [...fora], recusadas: [],
  };

  // litologias novas (só as usadas por amostras que vão entrar)
  const usadas = new Set(amostras.map((x) => x.litologia));
  const novas = a.litologiasNovas.filter((n) => usadas.has(n));
  if (novas.length) {
    progresso("litologias", 0, novas.length);
    const { error } = await sb.from("litologias").upsert(novas.map((nome) => ({ nome })), { onConflict: "nome", ignoreDuplicates: true });
    if (error) throw new Error(traduzir(error, "litologias"));
    r.litologias = novas.length;
  }

  // amostras: novas em lote; existentes atualizadas só nos campos preenchidos na planilha
  const ids = new Map<string, string>();
  const codigos = amostras.map((x) => x.codigo);
  for (let i = 0; i < codigos.length; i += 200) {
    const { data: d, error } = await sb.from("amostras").select("id, codigo").in("codigo", codigos.slice(i, i + 200));
    if (error) throw new Error(traduzir(error, "amostras"));
    for (const e of d ?? []) ids.set(e.codigo, e.id);
  }
  const novasAm = amostras.filter((x) => !ids.has(x.codigo));
  const velhas = amostras.filter((x) => ids.has(x.codigo));
  let feito = 0;
  for (let i = 0; i < novasAm.length; i += 100) {
    const lote = novasAm.slice(i, i + 100).map((x) => ({ ...semNulos(x), codigo: x.codigo, status: x.status ?? "disponivel" }));
    const { data: d, error } = await sb.from("amostras").insert(lote).select("id, codigo");
    if (error && error.code !== "23505") throw new Error(traduzir(error, "amostras"));
    if (!error) {
      for (const e of d ?? []) ids.set(e.codigo, e.id);
      r.amostras.inseridas += lote.length;
    } else {
      // algum código do lote já existe fora do seu alcance: grava uma a uma e separa as recusadas
      for (const linha of lote) {
        const um = await sb.from("amostras").insert(linha).select("id, codigo").single();
        if (um.error) r.recusadas.push({ codigo: linha.codigo, motivo: traduzir(um.error, "amostras") });
        else { ids.set(um.data.codigo, um.data.id); r.amostras.inseridas++; }
      }
    }
    feito += lote.length;
    progresso("amostras", feito, amostras.length);
  }
  for (const x of velhas) {
    const campos = semNulos(x);
    delete (campos as Record<string, unknown>).projeto_id;   // importação não muda projeto
    delete (campos as Record<string, unknown>).tipo_origem;  // nem a origem (pode ter sido completada no cadastro)
    const { error } = await sb.from("amostras").update(campos).eq("id", ids.get(x.codigo)!);
    if (error) throw new Error(traduzir(error, `amostras (${x.codigo})`));
    r.amostras.atualizadas++; feito++;
    progresso("amostras", feito, amostras.length);
  }

  // petrofísica e conferência: busca o que já existe e casa por (amostra, momento, data) / (amostra, data)
  const idsAm = [...new Set(amostras.map((x) => ids.get(x.codigo)).filter((x): x is string => !!x))];
  const existentesPetro: { id: number; amostra_id: string; momento: string; data_ensaio: string | null }[] = [];
  const existentesConf: { id: number; amostra_id: string; data: string }[] = [];
  for (let i = 0; i < idsAm.length; i += 200) {
    const parte = idsAm.slice(i, i + 200);
    const p = await sb.from("analise_petrofisica").select("id, amostra_id, momento, data_ensaio").in("amostra_id", parte);
    if (p.error) throw new Error(traduzir(p.error, "analise_petrofisica"));
    existentesPetro.push(...(p.data ?? []));
    const c = await sb.from("conferencias").select("id, amostra_id, data").in("amostra_id", parte);
    if (c.error) throw new Error(traduzir(c.error, "conferencias"));
    existentesConf.push(...(c.data ?? []));
  }

  const petros = a.petrofisicas.filter((p) => ids.has(p.codigo) && !fora.has(p.codigo));
  const novasPetro: Record<string, unknown>[] = [];
  feito = 0;
  for (const p of petros) {
    const amostra_id = ids.get(p.codigo)!;
    const igual = existentesPetro.find((e) => e.amostra_id === amostra_id && e.momento === p.momento && (e.data_ensaio ?? null) === p.data_ensaio);
    if (igual) {
      const { error } = await sb.from("analise_petrofisica").update(semNulos(p)).eq("id", igual.id);
      if (error) throw new Error(traduzir(error, `analise_petrofisica (${p.codigo})`));
      r.petrofisicas.atualizadas++;
    } else novasPetro.push({ ...semNulos(p), amostra_id, momento: p.momento });
    progresso("petrofísica", ++feito, petros.length);
  }
  for (let i = 0; i < novasPetro.length; i += 200) {
    const { error } = await sb.from("analise_petrofisica").insert(novasPetro.slice(i, i + 200));
    if (error) throw new Error(traduzir(error, "analise_petrofisica"));
  }
  r.petrofisicas.inseridas = novasPetro.length;

  const confs = a.conferencias.filter((c) => ids.has(c.codigo) && !fora.has(c.codigo));
  const novasConf: Record<string, unknown>[] = [];
  feito = 0;
  for (const c of confs) {
    const amostra_id = ids.get(c.codigo)!;
    const igual = existentesConf.find((e) => e.amostra_id === amostra_id && e.data === c.data);
    const linha = { data: c.data, responsaveis: c.responsaveis, resultado: c.resultado };
    if (igual) {
      const { error } = await sb.from("conferencias").update(linha).eq("id", igual.id);
      if (error) throw new Error(traduzir(error, `conferencias (${c.codigo})`));
      r.conferencias.atualizadas++;
    } else novasConf.push({ ...linha, amostra_id });
    progresso("conferências", ++feito, confs.length);
  }
  if (novasConf.length) {
    const { error } = await sb.from("conferencias").insert(novasConf);
    if (error) throw new Error(traduzir(error, "conferencias"));
  }
  r.conferencias.inseridas = novasConf.length;
  return r;
}
