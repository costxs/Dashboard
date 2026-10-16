// .zip sem compressão (PNG e PDF já vêm comprimidos), para o botão "Baixar todos" dos gráficos.
// Formato: cabeçalho local + dados de cada arquivo, diretório central e o registro de fim (PKWARE APPNOTE).

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const x of b) c = TABELA_CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** data e hora no formato do MS-DOS, como o zip guarda */
function dataDos(d: Date): [number, number] {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return [hora, dia]
}

export async function montarZip(arquivos: { nome: string; dados: Blob }[]): Promise<Blob> {
  const utf8 = new TextEncoder()
  const [hora, dia] = dataDos(new Date())
  const partes: Uint8Array<ArrayBuffer>[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let posicao = 0
  for (const a of arquivos) {
    const dados = new Uint8Array(await a.dados.arrayBuffer())
    const nome = utf8.encode(a.nome)
    const crc = crc32(dados)

    const local = new Uint8Array(30 + nome.length)
    const l = new DataView(local.buffer)
    l.setUint32(0, 0x04034b50, true)
    l.setUint16(4, 20, true)          // versão necessária
    l.setUint16(6, 0x0800, true)      // nome em UTF-8
    l.setUint16(10, hora, true)
    l.setUint16(12, dia, true)
    l.setUint32(14, crc, true)
    l.setUint32(18, dados.length, true)
    l.setUint32(22, dados.length, true)
    l.setUint16(26, nome.length, true)
    local.set(nome, 30)

    const cd = new Uint8Array(46 + nome.length)
    const c = new DataView(cd.buffer)
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(12, hora, true)
    c.setUint16(14, dia, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, dados.length, true)
    c.setUint32(24, dados.length, true)
    c.setUint16(28, nome.length, true)
    c.setUint32(42, posicao, true)    // onde começa o cabeçalho local
    cd.set(nome, 46)

    partes.push(local, dados)
    central.push(cd)
    posicao += local.length + dados.length
  }
  const tamanhoCentral = central.reduce((s, x) => s + x.length, 0)
  const fim = new Uint8Array(22)
  const f = new DataView(fim.buffer)
  f.setUint32(0, 0x06054b50, true)
  f.setUint16(8, arquivos.length, true)
  f.setUint16(10, arquivos.length, true)
  f.setUint32(12, tamanhoCentral, true)
  f.setUint32(16, posicao, true)
  return new Blob([...partes, ...central, fim], { type: 'application/zip' })
}
