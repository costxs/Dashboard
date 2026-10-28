// Lê um .xlsx/.csv no navegador e devolve { nomeDaAba: linhas[] }.
// Cada linha é um objeto { coluna: valor } usando a 1ª linha como cabeçalho.
//
// Biblioteca: SheetJS. Instale a versão oficial (a do npm "xlsx" 0.18 está desatualizada):
//   npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";
import type { Planilha } from "./planilhaBdd";

export async function lerArquivo(arquivo: File | ArrayBuffer): Promise<Planilha> {
  const buffer = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
  // cellDates: datas viram Date; raw: números chegam como número (não como texto formatado)
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const saida: Planilha = {};
  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome];
    saida[nome] = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true, blankrows: false });
  }
  return saida;
}

/** true quando o arquivo não é .xlsx (zip "PK") nem .xls binário (OLE2): é texto com outra extensão */
function ehTexto(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const zip = b[0] === 0x50 && b[1] === 0x4b;
  const ole = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  return b.length > 0 && !zip && !ole;
}

/**
 * Lê cada aba como linhas cruas (matriz), sem supor que o cabeçalho está na linha 1.
 * Usado pelo importador da planilha de controle de amostras, cujas Tabelas do Excel
 * começam na linha 2 (a linha 1 fica vazia). Linha i do resultado = linha i+1 do Excel.
 */
export async function lerArquivoBruto(
  arquivo: File | ArrayBuffer,
  opcoes: {
    /** Arquivo de TEXTO (CSV, HTML ou XML salvo como .xls): não deixa a SheetJS converter os valores.
     *  Ela lê a vírgula decimal como separador de milhar ("1415,25" -> 141525); com isto cada célula chega
     *  como texto e quem converte é o numero() do importador, igual ao serviço de gráficos.
     *  Não muda nada em .xlsx e .xls binário, que já guardam números de verdade. */
    textoSemConverter?: boolean;
  } = {},
): Promise<Record<string, unknown[][]>> {
  const buffer = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: Boolean(opcoes.textoSemConverter) && ehTexto(buffer) });
  const saida: Record<string, unknown[][]> = {};
  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome];
    const ref = ws["!ref"];
    if (!ref) { saida[nome] = []; continue; }
    // começa na linha 1 mesmo que a área usada comece mais abaixo, para os números de linha baterem com o Excel
    const r = XLSX.utils.decode_range(ref);
    r.s.r = 0; r.s.c = 0;
    saida[nome] = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: true, range: r });
  }
  return saida;
}
