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
