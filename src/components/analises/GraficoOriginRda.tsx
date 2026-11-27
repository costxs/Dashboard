// Gráficos científicos em estilo OriginLab para Dissolução Dinâmica (RDA):
//   - Moldura fechada nos 4 lados (preto 1,5 px), ticks maiores e menores voltados para dentro nos 4 eixos;
//   - Caixa de legenda emoldurada estilo Origin arrastável dentro do gráfico (salva posição);
//   - Seletor de grandeza no eixo Y ([H⁺] mol/L, Δ[H⁺] consumido mmol/L, [Ca²⁺] mmol/L, [Mg²⁺] mmol/L);
//   - Painel lateral de parâmetros do ajuste linear (Equação, R², inclinação, intercepto, TR / Sc / D);
//   - Exportação imediata em PNG (300 dpi), SVG vetorial, PDF e CSV (tenta backend Matplotlib Origin e possui
//     renderização local de alta resolução 300 dpi garantida mesmo offline).
import React, { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Grid3x3, Image as ImageIcon, Move } from "lucide-react";

export interface PontoRdaGrafico {
  x: number;
  y: number;
  rotulo?: string | null;
  ca_mol_l?: number | null;
  mg_mol_l?: number | null;
  h_mol_l?: number | null;
  abs_ca?: number | null;
  abs_mg?: number | null;
  usado?: boolean;
}

export interface PontoMediaLevichGrafico {
  x: number;
  y: number;
  erro: number;
  rpm: number;
  n: number;
}

export type GrandezaYRda = "h" | "delta_h_mmol" | "ca_mmol" | "mg_mmol";

function fmtVirgula(v: number | null | undefined, casas = 4): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtCientifico(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / 10 ** exp;
  return `${mant.toFixed(casas).replace(".", ",")}×10^${exp}`;
}

function regressaoLinear(xs: number[], ys: number[]): { inclinacao: number; intercepto: number; r2: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const inclinacao = sxy / sxx;
  const intercepto = my - inclinacao * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { inclinacao, intercepto, r2 };
}

interface EscalaOrigin {
  min: number;
  max: number;
  passo: number;
  maiores: number[];
  menores: number[];
  casas: number;
  cientifico: boolean;
}

function construirEscalaOrigin(
  valores: number[],
  opcoes: { comecarNoZero?: boolean; padInferior?: number; padSuperior?: number; alvoTicks?: number } = {},
): EscalaOrigin {
  const limpos = valores.filter((v) => Number.isFinite(v));
  if (limpos.length === 0) {
    return { min: 0, max: 1, passo: 0.2, maiores: [0, 0.2, 0.4, 0.6, 0.8, 1], menores: [], casas: 1, cientifico: false };
  }
  let vMin = Math.min(...limpos);
  let vMax = Math.max(...limpos);
  if (opcoes.comecarNoZero) vMin = Math.min(0, vMin);

  let span = vMax - vMin;
  if (span <= 0) {
    const delta = Math.abs(vMax) > 0 ? Math.abs(vMax) * 0.005 : 1;
    vMin = opcoes.comecarNoZero && vMax >= 0 ? 0 : vMin - delta;
    vMax = vMax + delta;
    span = vMax - vMin;
  } else {
    const padInf = opcoes.padInferior ?? 0.1;
    const padSup = opcoes.padSuperior ?? 0.16;
    vMin = opcoes.comecarNoZero && vMin >= 0 ? 0 : vMin - span * padInf;
    vMax = vMax + span * padSup;
    span = vMax - vMin;
  }

  const alvo = opcoes.alvoTicks ?? 5;
  const bruto = span / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const frac = bruto / mag;
  const mult = frac <= 1.2 ? 1 : frac <= 2.4 ? 2 : frac <= 3.5 ? 2.5 : frac <= 6 ? 5 : 10;
  const passo = mult * mag;

  const min = opcoes.comecarNoZero && vMin >= 0 ? 0 : Math.floor(vMin / passo) * passo;
  const max = Math.ceil(vMax / passo) * passo;

  const maiores: number[] = [];
  for (let i = 0; i <= 20; i++) {
    const val = min + i * passo;
    if (val > max + passo * 1e-6) break;
    maiores.push(Number(val.toPrecision(12)));
  }

  const subPasso = passo / 5;
  const menores: number[] = [];
  for (let i = 0; i < maiores.length - 1; i++) {
    for (let k = 1; k < 5; k++) {
      const m = maiores[i] + k * subPasso;
      if (m > min && m < max) menores.push(Number(m.toPrecision(12)));
    }
  }

  const maxAbs = Math.max(Math.abs(min), Math.abs(max));
  const cientifico = maxAbs > 0 && (maxAbs < 1e-3 || maxAbs >= 1e5);
  let casas = 0;
  if (!cientifico && passo < 1) {
    casas = Math.min(7, Math.max(1, Math.ceil(-Math.log10(passo)) + (mult === 2.5 ? 1 : 0)));
  }

  return { min, max: max > min ? max : min + passo, passo, maiores, menores, casas, cientifico };
}

function formatarTickOrigin(v: number, esc: EscalaOrigin): string {
  if (Math.abs(v) < esc.passo * 1e-9) return "0";
  if (esc.cientifico) {
    const exp = Math.floor(Math.log10(Math.abs(v)));
    const mant = v / 10 ** exp;
    return `${mant.toFixed(1).replace(".", ",")}E${exp >= 0 ? `+${exp}` : exp}`;
  }
  return v.toLocaleString("pt-BR", { minimumFractionDigits: esc.casas, maximumFractionDigits: esc.casas });
}

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Converte o SVG padrão Origin em string XML autossuficiente para exportação vetorial ou rasterização 300 dpi */
function serializarSvgLimpo(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-nao-exportar='1']").forEach((el) => el.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("style", "background:#ffffff;font-family:Arial,Helvetica,sans-serif;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

async function rasterizarSvg300Dpi(svgEl: SVGSVGElement, formatoImg: "image/png" | "image/jpeg"): Promise<{ blob: Blob; larguraPx: number; alturaPx: number }> {
  const xml = serializarSvgLimpo(svgEl);
  const vb = svgEl.viewBox.baseVal;
  const wBase = vb?.width || 740;
  const hBase = vb?.height || 460;
  const escala = 3.2; // ~300 DPI em largura de publicação (16,5 cm)
  const larguraPx = Math.round(wBase * escala);
  const alturaPx = Math.round(hBase * escala);

  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Falha ao renderizar o gráfico em alta resolução."));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = larguraPx;
    canvas.height = alturaPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, larguraPx, alturaPx);
    ctx.drawImage(img, 0, 0, larguraPx, alturaPx);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao codificar imagem."))), formatoImg, 0.98);
    });
    return { blob, larguraPx, alturaPx };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Gera um arquivo PDF 1.4 válido de 1 página embutindo a imagem em 300 DPI (funciona 100% offline sem bibliotecas externas) */
async function gerarPdfLocal300Dpi(svgEl: SVGSVGElement): Promise<Blob> {
  const { blob: jpegBlob, larguraPx, alturaPx } = await rasterizarSvg300Dpi(svgEl, "image/jpeg");
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const wPt = 540;
  const hPt = Math.round((wPt * alturaPx) / larguraPx);
  const margem = 28;
  const pagW = wPt + margem * 2;
  const pagH = hPt + margem * 2;

  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const pushTxt = (s: string) => {
    const b = enc.encode(s);
    partes.push(b);
    pos += b.byteLength;
  };
  const pushBin = (b: Uint8Array) => {
    partes.push(b);
    pos += b.byteLength;
  };

  pushTxt("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  offsets.push(pos);
  pushTxt("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets.push(pos);
  pushTxt("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets.push(pos);
  pushTxt(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pagW} ${pagH}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
  );
  const conteudo = `q\n${wPt} 0 0 ${hPt} ${margem} ${margem} cm\n/Im0 Do\nQ\n`;
  offsets.push(pos);
  pushTxt(`4 0 obj\n<< /Length ${conteudo.length} >>\nstream\n${conteudo}endstream\nendobj\n`);
  offsets.push(pos);
  pushTxt(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${larguraPx} /Height ${alturaPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`,
  );
  pushBin(jpegBytes);
  pushTxt("\nendstream\nendobj\n");

  const xrefPos = pos;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  pushTxt(xref);

  const total = partes.reduce((acc, p) => acc + p.byteLength, 0);
  const saida = new Uint8Array(total);
  let cursor = 0;
  for (const p of partes) {
    saida.set(p, cursor);
    cursor += p.byteLength;
  }
  return new Blob([saida], { type: "application/pdf" });
}

async function tentarExportarBackend(rota: string, corpo: Record<string, unknown>, token?: string | null, urlBase?: string): Promise<Blob | null> {
  if (!token || !urlBase) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const resp = await fetch(`${urlBase.replace(/\/+$/, "")}/${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (resp.ok) return await resp.blob();
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// 1. GRÁFICO ORIGIN: [H⁺] × TEMPO (E VARIAÇÕES Δ[H⁺], [Ca²⁺], [Mg²⁺])
// ============================================================================
export interface PropsGraficoOriginHTempo {
  usados: PontoRdaGrafico[];
  fora: PontoRdaGrafico[];
  reta: { inclinacao: number; intercepto: number } | null;
  rotuloY?: string;
  c0MolL?: number | null;
  taxaReacao?: number | null;
  r2?: number | null;
  codigoAmostra?: string | null;
  sistemaAcido?: string | null;
  rotacaoRpm?: number | null;
  temperaturaC?: number | null;
  mineral?: "calcita" | "dolomita" | string | null;
  pontosCompletos?: PontoRdaGrafico[];
  obterToken?: () => Promise<string | null>;
  urlGraficos?: string;
}

export const GraficoOriginHTempo: React.FC<PropsGraficoOriginHTempo> = ({
  usados,
  fora,
  reta: retaProp,
  rotuloY = "[H⁺] (mol/L)",
  c0MolL,
  taxaReacao,
  r2: r2Prop,
  codigoAmostra,
  sistemaAcido,
  rotacaoRpm,
  temperaturaC,
  mineral,
  pontosCompletos,
  obterToken,
  urlGraficos,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [grandeza, setGrandeza] = useState<GrandezaYRda>("h");
  const [mostrarGrade, setMostrarGrade] = useState(true);
  const [exportando, setExportando] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [legendaXY, setLegendaXY] = useState<{ x: number; y: number }>({ x: 0.44, y: 0.05 });
  const arrasteRef = useRef<{ iniMouseX: number; iniMouseY: number; iniX: number; iniY: number } | null>(null);

  const temCa = useMemo(
    () => Boolean(pontosCompletos?.some((p) => p.ca_mol_l != null && Number.isFinite(p.ca_mol_l))),
    [pontosCompletos],
  );
  const temMg = useMemo(
    () => Boolean(pontosCompletos?.some((p) => p.mg_mol_l != null && Number.isFinite(p.mg_mol_l) && Number(p.mg_mol_l) > 0)),
    [pontosCompletos],
  );
  const temDeltaH = useMemo(
    () => c0MolL != null || (usados.length + fora.length > 0),
    [c0MolL, usados.length, fora.length],
  );

  // Converte os pontos conforme a grandeza selecionada no eixo Y
  const dadosAtivos = useMemo(() => {
    const baseCompleta: PontoRdaGrafico[] = pontosCompletos?.length
      ? pontosCompletos
      : [
          ...usados.map((p) => ({ ...p, h_mol_l: p.y, usado: true })),
          ...fora.map((p) => ({ ...p, h_mol_l: p.y, usado: false })),
        ].sort((a, b) => a.x - b.x);

    const hZero = c0MolL ?? baseCompleta[0]?.h_mol_l ?? baseCompleta[0]?.y ?? 0;

    const mapearY = (p: PontoRdaGrafico): number | null => {
      if (grandeza === "delta_h_mmol") {
        const h = p.h_mol_l ?? p.y;
        return h != null && Number.isFinite(h) ? (hZero - h) * 1000 : null;
      }
      if (grandeza === "ca_mmol") {
        return p.ca_mol_l != null && Number.isFinite(p.ca_mol_l) ? p.ca_mol_l * 1000 : null;
      }
      if (grandeza === "mg_mmol") {
        return p.mg_mol_l != null && Number.isFinite(p.mg_mol_l) ? p.mg_mol_l * 1000 : null;
      }
      const h = p.h_mol_l ?? p.y;
      return h != null && Number.isFinite(h) ? h : null;
    };

    const todosConvertidos = baseCompleta
      .map((p) => {
        const yVal = mapearY(p);
        return yVal == null ? null : { ...p, y: yVal };
      })
      .filter((p): p is PontoRdaGrafico => p !== null);

    const u = todosConvertidos.filter((p) => p.usado !== false);
    const f = todosConvertidos.filter((p) => p.usado === false);
    const reg =
      grandeza === "h" && retaProp
        ? {
            inclinacao: retaProp.inclinacao,
            intercepto: retaProp.intercepto,
            r2: r2Prop ?? regressaoLinear(u.map((p) => p.x), u.map((p) => p.y))?.r2 ?? 0,
          }
        : regressaoLinear(u.map((p) => p.x), u.map((p) => p.y));

    const labelEixoY =
      grandeza === "delta_h_mmol"
        ? "Δ[H⁺] consumido (mmol/L)"
        : grandeza === "ca_mmol"
          ? "[Ca²⁺] liberado (mmol/L)"
          : grandeza === "mg_mmol"
            ? "[Mg²⁺] liberado (mmol/L)"
            : rotuloY;

    const unidadeCurta = grandeza === "h" ? "mol/L" : "mmol/L";
    return { todos: todosConvertidos, usados: u, fora: f, reg, labelEixoY, unidadeCurta, hZero };
  }, [pontosCompletos, usados, fora, grandeza, c0MolL, retaProp, r2Prop, rotuloY]);

  const deltaHTotalMmol = useMemo(() => {
    const hs = dadosAtivos.todos.map((p) => p.h_mol_l ?? (grandeza === "h" ? p.y : null)).filter((v): v is number => v != null);
    if (hs.length < 2) return null;
    return (Math.max(...hs) - Math.min(...hs)) * 1000;
  }, [dadosAtivos.todos, grandeza]);

  if (dadosAtivos.todos.length === 0) {
    return (
      <p className="m-0 py-10 text-center text-[13px] text-[var(--color-neutral-500)]">
        O gráfico padrão Origin aparece assim que houver leituras válidas.
      </p>
    );
  }

  // Geometria do canvas SVG (proporção clássica OriginLab ~16:10)
  const W = 740;
  const H = 455;
  const m = { esq: 96, dir: 26, topo: 34, base: 60 };
  const plotW = W - m.esq - m.dir;
  const plotH = H - m.topo - m.base;

  const escX = construirEscalaOrigin(dadosAtivos.todos.map((p) => p.x), {
    comecarNoZero: true,
    padSuperior: 0.06,
    alvoTicks: 5,
  });
  const escY = construirEscalaOrigin(dadosAtivos.todos.map((p) => p.y), {
    comecarNoZero: grandeza !== "h",
    padInferior: 0.14,
    padSuperior: 0.24,
    alvoTicks: 5,
  });

  const px = (x: number) => m.esq + ((x - escX.min) / (escX.max - escX.min)) * plotW;
  const py = (y: number) => m.topo + plotH - ((y - escY.min) / (escY.max - escY.min)) * plotH;

  const xsUsados = dadosAtivos.usados.map((p) => p.x);
  const xRetaIni = xsUsados.length >= 2 ? Math.min(...xsUsados) : 0;
  const xRetaFim = xsUsados.length >= 2 ? Math.max(...xsUsados) : 0;

  const tituloTopo = [
    codigoAmostra,
    sistemaAcido,
    rotacaoRpm != null ? `${fmtVirgula(rotacaoRpm, 0)} rpm` : null,
    temperaturaC != null ? `${fmtVirgula(temperaturaC, 0)} °C` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const iniciarArrasteLegenda = (ev: React.MouseEvent<SVGGElement>) => {
    ev.preventDefault();
    arrasteRef.current = {
      iniMouseX: ev.clientX,
      iniMouseY: ev.clientY,
      iniX: legendaXY.x,
      iniY: legendaXY.y,
    };
    const mover = (e2: MouseEvent) => {
      if (!arrasteRef.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const escalaX = W / rect.width;
      const escalaY = H / rect.height;
      const dx = ((e2.clientX - arrasteRef.current.iniMouseX) * escalaX) / plotW;
      const dy = ((e2.clientY - arrasteRef.current.iniMouseY) * escalaY) / plotH;
      setLegendaXY({
        x: Math.min(0.62, Math.max(0.02, arrasteRef.current.iniX + dx)),
        y: Math.min(0.72, Math.max(0.03, arrasteRef.current.iniY + dy)),
      });
    };
    const soltar = () => {
      arrasteRef.current = null;
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
    };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  const nomeBaseArquivo = `rda_${(codigoAmostra || "disco").toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}_${grandeza}`;

  const exportar = async (formato: "png" | "svg" | "pdf" | "csv") => {
    if (formato === "csv") {
      const linhasCsv = [
        ["Ordem", "Rotulo", "Tempo_s", "Na_janela", "Abs_Ca", "Abs_Mg", "Ca_mol_L", "Mg_mol_L", "H_mol_L", "Delta_H_mmol_L"].join(";"),
        ...dadosAtivos.todos.map((p, idx) => {
          const h = p.h_mol_l ?? (grandeza === "h" ? p.y : null);
          const dh = h != null ? (dadosAtivos.hZero - h) * 1000 : null;
          const fNum = (n: number | null | undefined, c = 6) => (n != null && Number.isFinite(n) ? n.toFixed(c).replace(".", ",") : "");
          return [
            idx + 1,
            p.rotulo ?? `P${idx + 1}`,
            fNum(p.x, 1),
            p.usado === false ? "Nao" : "Sim",
            fNum(p.abs_ca, 4),
            fNum(p.abs_mg, 4),
            fNum(p.ca_mol_l, 7),
            fNum(p.mg_mol_l, 7),
            fNum(h, 6),
            fNum(dh, 4),
          ].join(";");
        }),
      ];
      baixarBlob(new Blob(["\uFEFF" + linhasCsv.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${nomeBaseArquivo}_leituras.csv`);
      return;
    }

    if (!svgRef.current) return;
    setExportando(formato);
    try {
      const token = obterToken ? await obterToken().catch(() => null) : null;
      if (token && urlGraficos) {
        const remoto = await tentarExportarBackend(
          "reatividade/grafico-rda-h-tempo",
          {
            usados: dadosAtivos.usados.map((p) => ({ x: p.x, y: p.y, rotulo: p.rotulo ?? null })),
            fora: dadosAtivos.fora.map((p) => ({ x: p.x, y: p.y, rotulo: p.rotulo ?? null })),
            inclinacao: dadosAtivos.reg?.inclinacao ?? null,
            intercepto: dadosAtivos.reg?.intercepto ?? null,
            r2: dadosAtivos.reg?.r2 ?? null,
            taxa_reacao: taxaReacao ?? null,
            codigo_amostra: codigoAmostra ?? null,
            sistema_acido: sistemaAcido ?? null,
            rotacao_rpm: rotacaoRpm ?? null,
            temperatura_c: temperaturaC ?? null,
            mostrar_grade: mostrarGrade,
            estilo: {
              formato,
              dpi: 300,
              eixo_x: "Tempo, t (s)",
              eixo_y: dadosAtivos.labelEixoY,
              legend_xy: [legendaXY.x, 1 - legendaXY.y],
            },
          },
          token,
          urlGraficos,
        );
        if (remoto) {
          baixarBlob(remoto, `${nomeBaseArquivo}.${formato}`);
          return;
        }
      }

      if (formato === "svg") {
        const xml = serializarSvgLimpo(svgRef.current);
        baixarBlob(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), `${nomeBaseArquivo}.svg`);
      } else if (formato === "png") {
        const { blob } = await rasterizarSvg300Dpi(svgRef.current, "image/png");
        baixarBlob(blob, `${nomeBaseArquivo}_300dpi.png`);
      } else {
        const pdfBlob = await gerarPdfLocal300Dpi(svgRef.current);
        baixarBlob(pdfBlob, `${nomeBaseArquivo}.pdf`);
      }
    } finally {
      setExportando(null);
    }
  };

  const pontoHover = hoverIdx != null ? dadosAtivos.todos[hoverIdx] ?? null : null;
  const reg = dadosAtivos.reg;

  const legX = m.esq + legendaXY.x * plotW;
  const legY = m.topo + legendaXY.y * plotH;
  const linhasLegenda = 1 + (dadosAtivos.fora.length > 0 ? 1 : 0) + (reg ? 1 : 0) + (taxaReacao != null ? 1 : 0);
  const legAltura = 14 + linhasLegenda * 17;
  const legLargura = 278;

  return (
    <div className="rounded-[12px] border border-[var(--color-neutral-300)] bg-[#fafbfc] p-4">
      {/* Barra superior: seletor de grandeza Y + grade + exportação */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-neutral-200,#e5e7eb)] pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Eixo Y:</span>
          {(
            [
              ["h", mineral === "dolomita" ? "[H⁺] só Ca (mol/L)" : "[H⁺] (mol/L)", true],
              ["delta_h_mmol", "Δ[H⁺] consumido (mmol/L)", temDeltaH],
              ["ca_mmol", "[Ca²⁺] (mmol/L)", temCa],
              ["mg_mmol", "[Mg²⁺] (mmol/L)", temMg],
            ] as const
          )
            .filter(([, , vis]) => vis)
            .map(([id, rot]) => (
              <button
                key={id}
                type="button"
                onClick={() => setGrandeza(id)}
                className={`cursor-pointer rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-all ${
                  grandeza === id
                    ? "border-[#0f3d6e] bg-[#0f3d6e] text-white shadow-sm"
                    : "border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-700)] hover:border-[#0f3d6e]"
                }`}
              >
                {rot}
              </button>
            ))}
          <button
            type="button"
            onClick={() => setMostrarGrade((g) => !g)}
            title="Mostrar/ocultar linhas de grade"
            className={`ml-1 inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
              mostrarGrade
                ? "border-[var(--color-blue-200,#bfdbfe)] bg-[var(--color-blue-50,#eff6ff)] text-[var(--color-blue-800)]"
                : "border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-600)]"
            }`}
          >
            <Grid3x3 size={13} /> Grade
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
            <Download size={12} /> Exportar:
          </span>
          <button
            type="button"
            disabled={!!exportando}
            onClick={() => void exportar("png")}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-blue-800)] hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50,#eff6ff)] disabled:opacity-50"
          >
            <ImageIcon size={13} /> {exportando === "png" ? "Gerando…" : "PNG (300 dpi)"}
          </button>
          <button
            type="button"
            disabled={!!exportando}
            onClick={() => void exportar("svg")}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-blue-800)] hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50,#eff6ff)] disabled:opacity-50"
          >
            <FileText size={13} /> SVG
          </button>
          <button
            type="button"
            disabled={!!exportando}
            onClick={() => void exportar("pdf")}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-blue-800)] hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50,#eff6ff)] disabled:opacity-50"
          >
            <FileText size={13} /> {exportando === "pdf" ? "Gerando…" : "PDF"}
          </button>
          <button
            type="button"
            onClick={() => void exportar("csv")}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-neutral-700)] hover:border-[var(--color-blue)] hover:text-[var(--color-blue-800)]"
          >
            <FileSpreadsheet size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Corpo: Gráfico Origin à esquerda + Tabela Origin de Ajuste Linear à direita */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,740px)_1fr]">
        <div className="relative rounded-lg border border-[var(--color-neutral-300)] bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full select-none"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <rect x={0} y={0} width={W} height={H} fill="#ffffff" />

            {tituloTopo && (
              <text x={m.esq + plotW / 2} y={20} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#0f172a">
                {tituloTopo}
              </text>
            )}

            <defs>
              <clipPath id="clip-origin-rda-h">
                <rect x={m.esq} y={m.topo} width={plotW} height={plotH} />
              </clipPath>
            </defs>

            {/* Grade pontilhada sutil padrão Origin */}
            {mostrarGrade && (
              <g>
                {escX.maiores.map((vx, i) => {
                  const x = px(vx);
                  return x > m.esq + 1 && x < m.esq + plotW - 1 ? (
                    <line key={`gx-${i}`} x1={x} y1={m.topo} x2={x} y2={m.topo + plotH} stroke="#e2e8f0" strokeWidth={0.9} strokeDasharray="3 3" />
                  ) : null;
                })}
                {escY.maiores.map((vy, i) => {
                  const y = py(vy);
                  return y > m.topo + 1 && y < m.topo + plotH - 1 ? (
                    <line key={`gy-${i}`} x1={m.esq} y1={y} x2={m.esq + plotW} y2={y} stroke="#e2e8f0" strokeWidth={0.9} strokeDasharray="3 3" />
                  ) : null;
                })}
              </g>
            )}

            {/* Reta de regressão linear e pontos experimentais recortados pela moldura */}
            <g clipPath="url(#clip-origin-rda-h)">
              {reg && dadosAtivos.usados.length >= 2 && (
                <line
                  x1={px(xRetaIni)}
                  y1={py(reg.intercepto + reg.inclinacao * xRetaIni)}
                  x2={px(xRetaFim)}
                  y2={py(reg.intercepto + reg.inclinacao * xRetaFim)}
                  stroke="#c0392b"
                  strokeWidth={2.1}
                />
              )}

              {/* Pontos fora da janela: círculos abertos cinza */}
              {dadosAtivos.todos.map((p, idx) => {
                if (p.usado !== false) return null;
                const cx = px(p.x);
                const cy = py(p.y);
                const ativo = hoverIdx === idx;
                return (
                  <g key={`fora-${idx}`} className="cursor-pointer" onMouseEnter={() => setHoverIdx(idx)}>
                    <circle cx={cx} cy={cy} r={ativo ? 6.5 : 5} fill="#ffffff" stroke="#64748b" strokeWidth={1.8} />
                  </g>
                );
              })}

              {/* Pontos na janela linear: quadrados sólidos azul-marinho Origin */}
              {dadosAtivos.todos.map((p, idx) => {
                if (p.usado === false) return null;
                const cx = px(p.x);
                const cy = py(p.y);
                const tam = hoverIdx === idx ? 10.5 : 8.2;
                return (
                  <g key={`usado-${idx}`} className="cursor-pointer" onMouseEnter={() => setHoverIdx(idx)}>
                    <rect
                      x={cx - tam / 2}
                      y={cy - tam / 2}
                      width={tam}
                      height={tam}
                      fill={hoverIdx === idx ? "#eb6834" : "#0f3d6e"}
                      stroke="#08203a"
                      strokeWidth={1}
                    />
                  </g>
                );
              })}

              {/* Guias cruzadas de inspeção ao passar o mouse (não saem na exportação) */}
              {pontoHover && (
                <g data-nao-exportar="1" pointerEvents="none">
                  <line x1={px(pontoHover.x)} y1={m.topo} x2={px(pontoHover.x)} y2={m.topo + plotH} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} />
                  <line x1={m.esq} y1={py(pontoHover.y)} x2={m.esq + plotW} y2={py(pontoHover.y)} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} />
                </g>
              )}
            </g>

            {/* Moldura fechada de 4 lados padrão Origin */}
            <rect x={m.esq} y={m.topo} width={plotW} height={plotH} fill="none" stroke="#111827" strokeWidth={1.55} />

            {/* Ticks maiores e menores voltados para DENTRO nos 4 lados */}
            {escX.maiores.map((vx, i) => {
              const x = px(vx);
              if (x < m.esq - 0.5 || x > m.esq + plotW + 0.5) return null;
              return (
                <g key={`tx-${i}`}>
                  <line x1={x} y1={m.topo + plotH} x2={x} y2={m.topo + plotH - 7.5} stroke="#111827" strokeWidth={1.3} />
                  <line x1={x} y1={m.topo} x2={x} y2={m.topo + 7.5} stroke="#111827" strokeWidth={1.3} />
                  <text x={x} y={m.topo + plotH + 19} textAnchor="middle" fontSize={11.5} fill="#111827">
                    {formatarTickOrigin(vx, escX)}
                  </text>
                </g>
              );
            })}
            {escX.menores.map((vx, i) => {
              const x = px(vx);
              if (x <= m.esq || x >= m.esq + plotW) return null;
              return (
                <g key={`tmx-${i}`}>
                  <line x1={x} y1={m.topo + plotH} x2={x} y2={m.topo + plotH - 4.2} stroke="#111827" strokeWidth={1} />
                  <line x1={x} y1={m.topo} x2={x} y2={m.topo + 4.2} stroke="#111827" strokeWidth={1} />
                </g>
              );
            })}

            {escY.maiores.map((vy, i) => {
              const y = py(vy);
              if (y < m.topo - 0.5 || y > m.topo + plotH + 0.5) return null;
              return (
                <g key={`ty-${i}`}>
                  <line x1={m.esq} y1={y} x2={m.esq + 7.5} y2={y} stroke="#111827" strokeWidth={1.3} />
                  <line x1={m.esq + plotW} y1={y} x2={m.esq + plotW - 7.5} y2={y} stroke="#111827" strokeWidth={1.3} />
                  <text x={m.esq - 8} y={y + 4} textAnchor="end" fontSize={11.5} fill="#111827">
                    {formatarTickOrigin(vy, escY)}
                  </text>
                </g>
              );
            })}
            {escY.menores.map((vy, i) => {
              const y = py(vy);
              if (y <= m.topo || y >= m.topo + plotH) return null;
              return (
                <g key={`tmy-${i}`}>
                  <line x1={m.esq} y1={y} x2={m.esq + 4.2} y2={y} stroke="#111827" strokeWidth={1} />
                  <line x1={m.esq + plotW} y1={y} x2={m.esq + plotW - 4.2} y2={y} stroke="#111827" strokeWidth={1} />
                </g>
              );
            })}

            {/* Títulos dos eixos */}
            <text x={m.esq + plotW / 2} y={H - 12} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#111827">
              Tempo, t (s)
            </text>
            <text
              x={22}
              y={m.topo + plotH / 2}
              textAnchor="middle"
              fontSize={13}
              fontWeight="bold"
              fill="#111827"
              transform={`rotate(-90 22 ${m.topo + plotH / 2})`}
            >
              {dadosAtivos.labelEixoY}
            </text>

            {/* Caixa de legenda emoldurada estilo Origin (arrastável) */}
            <g transform={`translate(${legX}, ${legY})`} onMouseDown={iniciarArrasteLegenda} className="cursor-move">
              <rect x={0} y={0} width={legLargura} height={legAltura} fill="#ffffff" fillOpacity={0.96} stroke="#111827" strokeWidth={1.1} />
              {(() => {
                let yItem = 17;
                const itens: React.ReactNode[] = [];
                itens.push(
                  <g key="l-usados">
                    <rect x={11} y={yItem - 8} width={8} height={8} fill="#0f3d6e" stroke="#08203a" strokeWidth={0.9} />
                    <text x={28} y={yItem - 0.5} fontSize={11} fill="#111827">
                      Janela linear (n = {dadosAtivos.usados.length})
                    </text>
                  </g>,
                );
                if (dadosAtivos.fora.length > 0) {
                  yItem += 17;
                  itens.push(
                    <g key="l-fora">
                      <circle cx={15} cy={yItem - 4} r={4} fill="#ffffff" stroke="#64748b" strokeWidth={1.5} />
                      <text x={28} y={yItem - 0.5} fontSize={11} fill="#475569">
                        Fora da janela (n = {dadosAtivos.fora.length})
                      </text>
                    </g>,
                  );
                }
                if (reg) {
                  yItem += 17;
                  itens.push(
                    <g key="l-reta">
                      <line x1={7} y1={yItem - 4} x2={23} y2={yItem - 4} stroke="#c0392b" strokeWidth={2} />
                      <text x={28} y={yItem - 0.5} fontSize={11} fill="#111827">
                        Ajuste linear (R² = {fmtVirgula(reg.r2, 4)})
                      </text>
                    </g>,
                  );
                }
                if (taxaReacao != null) {
                  yItem += 17;
                  itens.push(
                    <g key="l-tr">
                      <text x={11} y={yItem - 0.5} fontSize={11} fontWeight="bold" fill="#0f3d6e">
                        TR = {fmtCientifico(taxaReacao, 2)} mol/(cm²·s)
                      </text>
                    </g>,
                  );
                }
                return itens;
              })()}
            </g>
          </svg>

          {/* Tooltip flutuante ao passar o mouse num ponto */}
          {pontoHover && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-blue-200,#bfdbfe)] bg-[var(--color-blue-50,#eff6ff)] px-3 py-1.5 text-[12px] text-[var(--color-blue-900,#1e3a8a)]">
              <span>
                <strong>{pontoHover.rotulo || "Coleta"}</strong> · t = <strong>{fmtVirgula(pontoHover.x, 0)} s</strong> ·{" "}
                {dadosAtivos.labelEixoY.split(" (")[0]} ={" "}
                <strong>
                  {fmtVirgula(pontoHover.y, grandeza === "h" ? 5 : 4)} {dadosAtivos.unidadeCurta}
                </strong>
                {pontoHover.ca_mol_l != null && <> · [Ca²⁺] = {fmtVirgula(pontoHover.ca_mol_l * 1000, 4)} mmol/L</>}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${pontoHover.usado === false ? "bg-slate-200 text-slate-700" : "bg-[#0f3d6e] text-white"}`}>
                {pontoHover.usado === false ? "Fora da janela" : "Na reta"}
              </span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[var(--color-neutral-500)]">
            <Move size={11} /> Arraste a caixa de legenda para reposicioná-la antes de exportar
          </div>
        </div>

        {/* Quadro Origin "Linear Fit" lateral */}
        <div className="rounded-lg border border-[var(--color-neutral-300)] bg-white p-4 text-[12.5px]">
          <div className="mb-2.5 flex items-center justify-between border-b border-[var(--color-neutral-200,#e5e7eb)] pb-2">
            <span className="font-heading text-[13px] font-bold text-[var(--color-blue-800)]">Parâmetros do Ajuste (Origin)</span>
            {reg && (
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                  reg.r2 >= 0.98
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : reg.r2 >= 0.9
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-orange-50 text-orange-800 border border-orange-200"
                }`}
              >
                R² = {fmtVirgula(reg.r2, 4)}
              </span>
            )}
          </div>

          <dl className="m-0 space-y-2">
            <div className="flex justify-between gap-2 border-b border-dashed border-slate-100 pb-1.5">
              <dt className="text-[var(--color-neutral-600)]">Modelo</dt>
              <dd className="m-0 font-mono font-semibold text-slate-800">y = a + b·t</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-dashed border-slate-100 pb-1.5">
              <dt className="text-[var(--color-neutral-600)]">Intercepto (a)</dt>
              <dd className="m-0 font-mono font-semibold text-slate-800">
                {reg ? `${fmtVirgula(reg.intercepto, grandeza === "h" ? 5 : 4)} ${dadosAtivos.unidadeCurta}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-dashed border-slate-100 pb-1.5">
              <dt className="text-[var(--color-neutral-600)]">Inclinação (b)</dt>
              <dd className="m-0 font-mono font-semibold text-slate-800">
                {reg ? `${fmtCientifico(reg.inclinacao, 3)} ${dadosAtivos.unidadeCurta}/s` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-dashed border-slate-100 pb-1.5">
              <dt className="text-[var(--color-neutral-600)]">Pontos ajustados</dt>
              <dd className="m-0 font-mono font-semibold text-slate-800">
                {dadosAtivos.usados.length} de {dadosAtivos.todos.length}
                {xsUsados.length >= 2 ? ` (${fmtVirgula(xRetaIni, 0)}–${fmtVirgula(xRetaFim, 0)} s)` : ""}
              </dd>
            </div>
            {deltaHTotalMmol != null && (
              <div className="flex justify-between gap-2 border-b border-dashed border-slate-100 pb-1.5">
                <dt className="text-[var(--color-neutral-600)]">Amplitude Δ[H⁺]</dt>
                <dd className="m-0 font-mono font-semibold text-slate-800">{fmtVirgula(deltaHTotalMmol, 3)} mmol/L</dd>
              </div>
            )}
            {taxaReacao != null && (
              <div className="flex justify-between gap-2 pt-1">
                <dt className="font-bold text-[var(--color-blue-800)]">Taxa TR</dt>
                <dd className="m-0 font-mono font-bold text-[var(--color-blue-800)]">{fmtCientifico(taxaReacao, 3)} mol/(cm²·s)</dd>
              </div>
            )}
          </dl>

          {grandeza === "h" && deltaHTotalMmol != null && deltaHTotalMmol < 5 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-[11.5px] leading-relaxed text-amber-900">
              <strong>Dica de leitura:</strong> a variação total de [H⁺] é pequena ({fmtVirgula(deltaHTotalMmol, 2)} mmol/L frente a C₀). Clique em{" "}
              <button type="button" onClick={() => setGrandeza("delta_h_mmol")} className="cursor-pointer font-bold underline">
                Δ[H⁺] consumido (mmol/L)
              </button>{" "}
              acima para visualizar diretamente o ácido consumido a partir do zero.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. GRÁFICO ORIGIN: LEVICH (TR × √ω) PARA SÉRIES RDA
// ============================================================================
export interface PropsGraficoOriginLevich {
  medias: PontoMediaLevichGrafico[];
  discos: { x: number; y: number; codigo?: string }[];
  reta: { inclinacao: number; intercepto: number } | null;
  r2?: number | null;
  sc?: number | null;
  dCm2S?: number | null;
  regime?: string | null;
  nomeSerie?: string | null;
  obterToken?: () => Promise<string | null>;
  urlGraficos?: string;
}

export const GraficoOriginLevich: React.FC<PropsGraficoOriginLevich> = ({
  medias,
  discos,
  reta: retaProp,
  r2,
  sc,
  dCm2S,
  regime,
  nomeSerie,
  obterToken,
  urlGraficos,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mostrarGrade, setMostrarGrade] = useState(true);
  const [exportando, setExportando] = useState<string | null>(null);
  const [legendaXY, setLegendaXY] = useState<{ x: number; y: number }>({ x: 0.04, y: 0.05 });
  const arrasteRef = useRef<{ iniMouseX: number; iniMouseY: number; iniX: number; iniY: number } | null>(null);

  if (!medias.length) {
    return (
      <p className="m-0 py-10 text-center text-[13px] text-[var(--color-neutral-500)]">
        O gráfico de Levich aparece quando a série tiver discos com taxa.
      </p>
    );
  }

  const W = 740;
  const H = 445;
  const m = { esq: 98, dir: 26, topo: 34, base: 60 };
  const plotW = W - m.esq - m.dir;
  const plotH = H - m.topo - m.base;

  const todosX = [0, ...medias.map((p) => p.x), ...discos.map((d) => d.x)];
  const todosY = [
    0,
    ...medias.flatMap((p) => [p.y + (p.erro || 0), Math.max(0, p.y - (p.erro || 0))]),
    ...discos.map((d) => d.y),
  ];

  const escX = construirEscalaOrigin(todosX, { comecarNoZero: true, padSuperior: 0.08, alvoTicks: 5 });
  const escY = construirEscalaOrigin(todosY, { comecarNoZero: true, padSuperior: 0.22, alvoTicks: 5 });

  const px = (x: number) => m.esq + ((x - escX.min) / (escX.max - escX.min)) * plotW;
  const py = (y: number) => m.topo + plotH - ((y - escY.min) / (escY.max - escY.min)) * plotH;

  const reg = retaProp
    ? {
        inclinacao: retaProp.inclinacao,
        intercepto: retaProp.intercepto,
        r2: r2 ?? regressaoLinear(medias.map((p) => p.x), medias.map((p) => p.y))?.r2 ?? 0,
      }
    : regressaoLinear(medias.map((p) => p.x), medias.map((p) => p.y));

  const xFimReta = Math.max(...medias.map((p) => p.x)) * 1.05;
  const nomeBase = `rda_levich_${(nomeSerie || "serie").toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}`;

  const iniciarArraste = (ev: React.MouseEvent<SVGGElement>) => {
    ev.preventDefault();
    arrasteRef.current = { iniMouseX: ev.clientX, iniMouseY: ev.clientY, iniX: legendaXY.x, iniY: legendaXY.y };
    const mover = (e2: MouseEvent) => {
      if (!arrasteRef.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const dx = (((e2.clientX - arrasteRef.current.iniMouseX) * W) / rect.width) / plotW;
      const dy = (((e2.clientY - arrasteRef.current.iniMouseY) * H) / rect.height) / plotH;
      setLegendaXY({
        x: Math.min(0.6, Math.max(0.02, arrasteRef.current.iniX + dx)),
        y: Math.min(0.7, Math.max(0.03, arrasteRef.current.iniY + dy)),
      });
    };
    const soltar = () => {
      arrasteRef.current = null;
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
    };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  const exportar = async (formato: "png" | "svg" | "pdf" | "csv") => {
    if (formato === "csv") {
      const linhas = [
        ["Rotacao_rpm", "Raiz_omega", "N_discos", "TR_media_mol_cm2_s", "Desvio_padrao"].join(";"),
        ...medias.map((g) => [g.rpm, g.x.toFixed(4).replace(".", ","), g.n, g.y.toExponential(6).replace(".", ","), (g.erro || 0).toExponential(6).replace(".", ",")].join(";")),
      ];
      baixarBlob(new Blob(["\uFEFF" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${nomeBase}.csv`);
      return;
    }
    if (!svgRef.current) return;
    setExportando(formato);
    try {
      const token = obterToken ? await obterToken().catch(() => null) : null;
      if (token && urlGraficos) {
        const remoto = await tentarExportarBackend(
          "reatividade/grafico-rda-levich",
          {
            medias: medias.map((g) => ({ x: g.x, y: g.y, erro: g.erro || 0, rpm: g.rpm, n: g.n })),
            discos: discos.map((d) => ({ x: d.x, y: d.y, rotulo: d.codigo ?? null })),
            inclinacao: reg?.inclinacao ?? null,
            intercepto: reg?.intercepto ?? null,
            r2: reg?.r2 ?? null,
            sc: sc ?? null,
            d_cm2_s: dCm2S ?? null,
            regime: regime ?? null,
            nome_serie: nomeSerie ?? null,
            mostrar_grade: mostrarGrade,
            estilo: { formato, dpi: 300, legend_xy: [legendaXY.x, 1 - legendaXY.y] },
          },
          token,
          urlGraficos,
        );
        if (remoto) {
          baixarBlob(remoto, `${nomeBase}.${formato}`);
          return;
        }
      }
      if (formato === "svg") {
        baixarBlob(new Blob([serializarSvgLimpo(svgRef.current)], { type: "image/svg+xml;charset=utf-8" }), `${nomeBase}.svg`);
      } else if (formato === "png") {
        const { blob } = await rasterizarSvg300Dpi(svgRef.current, "image/png");
        baixarBlob(blob, `${nomeBase}_300dpi.png`);
      } else {
        baixarBlob(await gerarPdfLocal300Dpi(svgRef.current), `${nomeBase}.pdf`);
      }
    } finally {
      setExportando(null);
    }
  };

  const legX = m.esq + legendaXY.x * plotW;
  const legY = m.topo + legendaXY.y * plotH;
  const linhasLeg = 1 + (discos.length > 0 ? 1 : 0) + (reg ? 1 : 0) + (dCm2S != null ? 1 : 0);

  return (
    <div className="rounded-[12px] border border-[var(--color-neutral-300)] bg-[#fafbfc] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-neutral-200,#e5e7eb)] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-[var(--color-blue-800)]">Gráfico de Levich Padrão Origin (TR × √ω)</span>
          <button
            type="button"
            onClick={() => setMostrarGrade((g) => !g)}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-medium ${
              mostrarGrade ? "border-[var(--color-blue-200,#bfdbfe)] bg-[var(--color-blue-50,#eff6ff)] text-[var(--color-blue-800)]" : "border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-600)]"
            }`}
          >
            <Grid3x3 size={13} /> Grade
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
            <Download size={12} /> Exportar:
          </span>
          <button type="button" disabled={!!exportando} onClick={() => void exportar("png")} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-blue-800)] hover:border-[var(--color-blue)]">
            <ImageIcon size={13} /> PNG (300 dpi)
          </button>
          <button type="button" disabled={!!exportando} onClick={() => void exportar("svg")} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-blue-800)] hover:border-[var(--color-blue)]">
            <FileText size={13} /> SVG
          </button>
          <button type="button" disabled={!!exportando} onClick={() => void exportar("pdf")} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-blue-800)] hover:border-[var(--color-blue)]">
            <FileText size={13} /> PDF
          </button>
          <button type="button" onClick={() => void exportar("csv")} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--color-neutral-700)] hover:border-[var(--color-blue)]">
            <FileSpreadsheet size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] rounded-lg border border-[var(--color-neutral-300)] bg-white p-2">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
          <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
          {nomeSerie && (
            <text x={m.esq + plotW / 2} y={20} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#0f172a">
              Ajuste de Levich — {nomeSerie}
            </text>
          )}
          <defs>
            <clipPath id="clip-origin-levich">
              <rect x={m.esq} y={m.topo} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {mostrarGrade && (
            <g>
              {escX.maiores.map((vx, i) => {
                const x = px(vx);
                return x > m.esq + 1 && x < m.esq + plotW - 1 ? <line key={`lx-${i}`} x1={x} y1={m.topo} x2={x} y2={m.topo + plotH} stroke="#e2e8f0" strokeWidth={0.9} strokeDasharray="3 3" /> : null;
              })}
              {escY.maiores.map((vy, i) => {
                const y = py(vy);
                return y > m.topo + 1 && y < m.topo + plotH - 1 ? <line key={`ly-${i}`} x1={m.esq} y1={y} x2={m.esq + plotW} y2={y} stroke="#e2e8f0" strokeWidth={0.9} strokeDasharray="3 3" /> : null;
              })}
            </g>
          )}

          <g clipPath="url(#clip-origin-levich)">
            {reg && (
              <line x1={px(0)} y1={py(reg.intercepto)} x2={px(xFimReta)} y2={py(reg.intercepto + reg.inclinacao * xFimReta)} stroke="#c0392b" strokeWidth={2.1} />
            )}
            {discos.map((d, i) => (
              <circle key={`d-${i}`} cx={px(d.x)} cy={py(d.y)} r={4.5} fill="#ffffff" stroke="#64748b" strokeWidth={1.5} />
            ))}
            {medias.map((g, i) => {
              const cx = px(g.x);
              const cy = py(g.y);
              const temErro = g.erro > 0;
              const ySup = py(g.y + g.erro);
              const yInf = py(Math.max(0, g.y - g.erro));
              return (
                <g key={`m-${i}`}>
                  {temErro && (
                    <>
                      <line x1={cx} y1={ySup} x2={cx} y2={yInf} stroke="#0f3d6e" strokeWidth={1.4} />
                      <line x1={cx - 5} y1={ySup} x2={cx + 5} y2={ySup} stroke="#0f3d6e" strokeWidth={1.4} />
                      <line x1={cx - 5} y1={yInf} x2={cx + 5} y2={yInf} stroke="#0f3d6e" strokeWidth={1.4} />
                    </>
                  )}
                  <rect x={cx - 4.2} y={cy - 4.2} width={8.4} height={8.4} fill="#0f3d6e" stroke="#08203a" strokeWidth={1} />
                </g>
              );
            })}
          </g>

          <rect x={m.esq} y={m.topo} width={plotW} height={plotH} fill="none" stroke="#111827" strokeWidth={1.55} />

          {escX.maiores.map((vx, i) => {
            const x = px(vx);
            if (x < m.esq - 0.5 || x > m.esq + plotW + 0.5) return null;
            return (
              <g key={`tx-${i}`}>
                <line x1={x} y1={m.topo + plotH} x2={x} y2={m.topo + plotH - 7.5} stroke="#111827" strokeWidth={1.3} />
                <line x1={x} y1={m.topo} x2={x} y2={m.topo + 7.5} stroke="#111827" strokeWidth={1.3} />
                <text x={x} y={m.topo + plotH + 19} textAnchor="middle" fontSize={11.5} fill="#111827">
                  {formatarTickOrigin(vx, escX)}
                </text>
              </g>
            );
          })}
          {escX.menores.map((vx, i) => {
            const x = px(vx);
            return x > m.esq && x < m.esq + plotW ? (
              <g key={`tmx-${i}`}>
                <line x1={x} y1={m.topo + plotH} x2={x} y2={m.topo + plotH - 4.2} stroke="#111827" strokeWidth={1} />
                <line x1={x} y1={m.topo} x2={x} y2={m.topo + 4.2} stroke="#111827" strokeWidth={1} />
              </g>
            ) : null;
          })}

          {escY.maiores.map((vy, i) => {
            const y = py(vy);
            if (y < m.topo - 0.5 || y > m.topo + plotH + 0.5) return null;
            return (
              <g key={`ty-${i}`}>
                <line x1={m.esq} y1={y} x2={m.esq + 7.5} y2={y} stroke="#111827" strokeWidth={1.3} />
                <line x1={m.esq + plotW} y1={y} x2={m.esq + plotW - 7.5} y2={y} stroke="#111827" strokeWidth={1.3} />
                <text x={m.esq - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#111827">
                  {formatarTickOrigin(vy, escY)}
                </text>
              </g>
            );
          })}
          {escY.menores.map((vy, i) => {
            const y = py(vy);
            return y > m.topo && y < m.topo + plotH ? (
              <g key={`tmy-${i}`}>
                <line x1={m.esq} y1={y} x2={m.esq + 4.2} y2={y} stroke="#111827" strokeWidth={1} />
                <line x1={m.esq + plotW} y1={y} x2={m.esq + plotW - 4.2} y2={y} stroke="#111827" strokeWidth={1} />
              </g>
            ) : null;
          })}

          <text x={m.esq + plotW / 2} y={H - 12} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#111827">
            √ω (rad/s)^0,5
          </text>
          <text x={22} y={m.topo + plotH / 2} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#111827" transform={`rotate(-90 22 ${m.topo + plotH / 2})`}>
            TR (mol/cm²·s)
          </text>

          <g transform={`translate(${legX}, ${legY})`} onMouseDown={iniciarArraste} className="cursor-move">
            <rect x={0} y={0} width={286} height={14 + linhasLeg * 17} fill="#ffffff" fillOpacity={0.96} stroke="#111827" strokeWidth={1.1} />
            {(() => {
              let yL = 17;
              const els: React.ReactNode[] = [
                <g key="lm">
                  <rect x={11} y={yL - 8} width={8} height={8} fill="#0f3d6e" stroke="#08203a" strokeWidth={0.9} />
                  <text x={28} y={yL - 0.5} fontSize={11} fill="#111827">Média por rotação ± DP</text>
                </g>,
              ];
              if (discos.length > 0) {
                yL += 17;
                els.push(
                  <g key="ld">
                    <circle cx={15} cy={yL - 4} r={4} fill="#ffffff" stroke="#64748b" strokeWidth={1.5} />
                    <text x={28} y={yL - 0.5} fontSize={11} fill="#475569">Discos individuais (n = {discos.length})</text>
                  </g>,
                );
              }
              if (reg) {
                yL += 17;
                els.push(
                  <g key="lr">
                    <line x1={7} y1={yL - 4} x2={23} y2={yL - 4} stroke="#c0392b" strokeWidth={2} />
                    <text x={28} y={yL - 0.5} fontSize={11} fill="#111827">
                      Slope = {fmtCientifico(reg.inclinacao, 2)} (R² = {fmtVirgula(reg.r2, 4)})
                    </text>
                  </g>,
                );
              }
              if (dCm2S != null) {
                yL += 17;
                els.push(
                  <g key="ldif">
                    <text x={11} y={yL - 0.5} fontSize={11} fontWeight="bold" fill="#0f3d6e">
                      {sc != null ? `Sc = ${fmtVirgula(sc, 1)} · ` : ""}D = {fmtCientifico(dCm2S, 2)} cm²/s
                    </text>
                  </g>,
                );
              }
              return els;
            })()}
          </g>
        </svg>
      </div>
    </div>
  );
};
