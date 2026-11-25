import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, usePlotArea, XAxis, YAxis } from "recharts";

// PVbt comparison chart (log-log), drawn in the browser in Origin style. Chart text is in English
// (publication standard); every visual choice comes from EstiloComparacao and from each series.

export type Marcador = "circle" | "square" | "triangle" | "triangleDown" | "diamond" | "pentagon" | "star" | "cross" | "plus";
export type TipoLinha = "solid" | "dashed" | "dotted" | "dashdot" | "none";
export type PosicaoLegenda = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "none";

export interface SerieGrafico {
  id: string
  nome: string
  cor: string
  marcador: Marcador
  /** contorno só (símbolo vazado), como os "open symbols" do Origin */
  vazado?: boolean
  linha?: TipoLinha
  pontos: { x: number; y: number; detalhe: string }[]
}

export interface EstiloComparacao {
  fonte: string
  tamanhoNumeros: number
  tamanhoTitulosEixos: number
  tamanhoLegenda: number
  tamanhoTitulo: number
  titulo: string
  /** vazio = título padrão do eixo escolhido */
  tituloX: string
  tituloY: string
  espessuraLinha: number
  tamanhoSimbolo: number
  legenda: PosicaoLegenda
}

export const ESTILO_PADRAO: EstiloComparacao = {
  fonte: "Arial",
  tamanhoNumeros: 14,
  tamanhoTitulosEixos: 18,
  tamanhoLegenda: 14,
  tamanhoTitulo: 18,
  titulo: "",
  tituloX: "",
  tituloY: "",
  espessuraLinha: 1.5,
  tamanhoSimbolo: 5.5,
  legenda: "top-left",
};

export const FONTES = ["Arial", "Helvetica", "Times New Roman", "Calibri", "Cambria", "Georgia", "Verdana", "Courier New"];
export const ROTULO_MARCADOR: Record<Marcador, string> = {
  circle: "Circle", square: "Square", triangle: "Triangle up", triangleDown: "Triangle down", diamond: "Diamond",
  pentagon: "Pentagon", star: "Star", cross: "Cross (×)", plus: "Plus (+)",
};
export const ROTULO_LINHA: Record<TipoLinha, string> = {
  solid: "Solid", dashed: "Dashed", dotted: "Dotted", dashdot: "Dash-dot", none: "No line",
};
const TRACO: Record<TipoLinha, string | undefined> = { solid: undefined, dashed: "8 5", dotted: "2 4", dashdot: "9 4 2 4", none: undefined };

export interface ExportarComparacao { baixar: (formato: "png" | "svg", nome: string) => Promise<void> }

/** grandeza do eixo x: vazão (padrão) ou velocidade intersticial */
export interface EixoXComparacao { titulo: string; simbolo: string; unidade: string }
export const EIXO_VAZAO: EixoXComparacao = { titulo: "Flow rate, Q (mL/min)", simbolo: "Q", unidade: "mL/min" };
export const EIXO_VELOCIDADE: EixoXComparacao = { titulo: "Interstitial velocity (cm/min)", simbolo: "v", unidade: "cm/min" };
export const TITULO_Y_PADRAO = "Pore volumes to breakthrough, PVbt";

// sequência do padrão Origin (a mesma dos gráficos do backend): preto, magenta, vermelho, azul, verde...
export const CORES_SERIE = ["#000000", "#FF00FF", "#FF0000", "#0000FF", "#008000", "#808000", "#000080", "#800080", "#008080", "#800000"];
export const MARCADORES_SERIE: Marcador[] = ["circle", "square", "triangle", "diamond", "triangleDown"];

const TEXTO = "#000000";
/** axis number in English: 2 decimals; tiny values keep their digits and large ones drop the decimals */
const dec2 = (v: number) =>
  v < 0.01
    ? v.toLocaleString("en-US", { maximumSignificantDigits: 2 })
    : v.toLocaleString("en-US", { minimumFractionDigits: v >= 100 ? 0 : 2, maximumFractionDigits: v >= 100 ? 0 : 2 });
const exato = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 6 });

// do mais espaçado ao mais fino: usa o primeiro que der ao menos 4 números no eixo
const DIVISOES_LOG = [[1], [1, 2, 5], [1, 1.5, 2, 3, 4, 5, 7], [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8]];

/** Marcas de um eixo log entre lo e hi, sempre com valores redondos. */
export function marcasLog(lo: number, hi: number): number[] {
  let marcas: number[] = [];
  for (const divisoes of DIVISOES_LOG) {
    marcas = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      for (const d of divisoes) {
        const v = Number((d * 10 ** e).toPrecision(6));
        if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) marcas.push(v);
      }
    }
    if (marcas.length >= 4) break;
  }
  return marcas;
}

const poligono = (cx: number, cy: number, r: number, n: number, interno?: number) =>
  Array.from({ length: interno ? n * 2 : n }, (_, i) => {
    const raio = interno && i % 2 ? interno : r;
    const a = -Math.PI / 2 + (i * Math.PI * 2) / (interno ? n * 2 : n);
    return `${cx + raio * Math.cos(a)},${cy + raio * Math.sin(a)}`;
  }).join(" ");

/** desenha o símbolo (cada forma centrada no ponto); vazado = só o contorno */
export function Forma(p: { forma: Marcador; cx: number; cy: number; cor: string; r?: number; vazado?: boolean }) {
  const { forma, cx, cy, cor } = p, r = p.r ?? 5.5;
  const pint = p.vazado ? { fill: "#fff", stroke: cor, strokeWidth: 1.4 } : { fill: cor };
  if (forma === "cross") return <path d={`M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx - r},${cy + r}L${cx + r},${cy - r}`} stroke={cor} strokeWidth={2} />;
  if (forma === "plus") return <path d={`M${cx - r * 1.2},${cy}L${cx + r * 1.2},${cy}M${cx},${cy - r * 1.2}L${cx},${cy + r * 1.2}`} stroke={cor} strokeWidth={2} />;
  if (forma === "square") return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...pint} />;
  if (forma === "triangle") return <polygon points={`${cx},${cy - r * 1.15} ${cx - r * 1.1},${cy + r * 0.9} ${cx + r * 1.1},${cy + r * 0.9}`} {...pint} />;
  if (forma === "triangleDown") return <polygon points={`${cx},${cy + r * 1.15} ${cx - r * 1.1},${cy - r * 0.9} ${cx + r * 1.1},${cy - r * 0.9}`} {...pint} />;
  if (forma === "diamond") return <polygon points={`${cx},${cy - r * 1.25} ${cx + r * 1.25},${cy} ${cx},${cy + r * 1.25} ${cx - r * 1.25},${cy}`} {...pint} />;
  if (forma === "pentagon") return <polygon points={poligono(cx, cy, r * 1.15, 5)} {...pint} />;
  if (forma === "star") return <polygon points={poligono(cx, cy, r * 1.35, 5, r * 0.6)} {...pint} />;
  return <circle cx={cx} cy={cy} r={r} {...pint} />;
}

/** legenda dentro da área do gráfico, em caixa, como no Origin (dentro do SVG, então sai no PNG/SVG exportado) */
function LegendaOrigin({ series, e }: { series: SerieGrafico[]; e: EstiloComparacao }) {
  const area = usePlotArea();
  if (!area || !series.length || e.legenda === "none") return null;
  const fs = e.tamanhoLegenda, linha = Math.round(fs * 1.7);
  const largura = Math.min(area.width - 16, Math.max(120, 50 + fs * 0.6 * Math.max(...series.map((s) => s.nome.length)) + 14));
  const altura = series.length * linha + 8;
  const x = e.legenda.endsWith("right") ? area.x + area.width - largura - 12 : area.x + 12;
  const y = e.legenda.startsWith("bottom") ? area.y + area.height - altura - 12 : area.y + 12;
  return (
    <g transform={`translate(${x},${y})`} fontSize={fs} fill={TEXTO}>
      <rect width={largura} height={altura} fill="#fff" stroke="#000" strokeWidth={1} />
      {series.map((s, i) => (
        <g key={s.id} transform={`translate(0,${i * linha + 4 + linha / 2})`}>
          {s.linha !== "none" && (
            <line x1={6} x2={36} y1={0} y2={0} stroke={s.cor} strokeWidth={e.espessuraLinha} strokeDasharray={TRACO[s.linha ?? "solid"]} />
          )}
          <Forma forma={s.marcador} cx={21} cy={0} cor={s.cor} r={Math.min(e.tamanhoSimbolo, linha / 2.4)} vazado={s.vazado} />
          <text x={44} y={fs * 0.35}>{s.nome}</text>
        </g>
      ))}
    </g>
  );
}

/** título do gráfico, centrado sobre a área dos pontos */
function TituloGrafico({ texto, tamanho }: { texto: string; tamanho: number }) {
  const area = usePlotArea();
  if (!area || !texto.trim()) return null;
  return (
    <text x={area.x + area.width / 2} y={area.y - tamanho * 0.9} textAnchor="middle" fontSize={tamanho} fontWeight={700} fill={TEXTO}>
      {texto}
    </text>
  );
}

export const GraficoComparacao = forwardRef<
  ExportarComparacao,
  { series: SerieGrafico[]; altura?: number; eixoX?: EixoXComparacao; estilo?: EstiloComparacao }
>(function GraficoComparacao(p, ref) {
  const eixoX = p.eixoX ?? EIXO_VAZAO;
  const e = p.estilo ?? ESTILO_PADRAO;
  const caixa = useRef<HTMLDivElement>(null);
  const todos = useMemo(() => p.series.flatMap((s) => s.pontos).filter((d) => d.x > 0 && d.y > 0), [p.series]);
  // espaço da legenda no topo só quando ela fica em cima
  const linhaLeg = Math.round(e.tamanhoLegenda * 1.7);
  const extraLegenda = e.legenda.startsWith("top")
    ? Math.min(0.5, (p.series.length * linhaLeg + 24) / ((p.altura ?? 640) - 112))
    : 0;
  // folga em volta dos pontos (nenhum fica em cima da moldura) e, em cima, o espaço da legenda
  const folga = (vals: number[], extraTopo = 0): { dominio: [number, number]; marcas: number[] } => {
    const lo = Math.min(...vals) / 1.6;
    const d0 = Math.log10((Math.max(...vals) * 1.6) / lo);
    const hi = Math.max(...vals) * 1.6 * 10 ** (extraTopo > 0 ? (extraTopo * d0) / (1 - extraTopo) : 0);
    return { dominio: [lo, hi], marcas: marcasLog(lo, hi) };
  };
  const ex = folga(todos.map((d) => d.x));
  const ey = folga(todos.map((d) => d.y), extraLegenda);

  useImperativeHandle(ref, () => ({
    async baixar(formato, nome) {
      const svg = caixa.current?.querySelector<SVGSVGElement>("svg.recharts-surface");
      if (!svg) return;
      const { width, height } = svg.getBoundingClientRect();
      const copia = svg.cloneNode(true) as SVGSVGElement;
      copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      copia.setAttribute("width", String(width));
      copia.setAttribute("height", String(height));
      copia.setAttribute("viewBox", `0 0 ${width} ${height}`);
      copia.setAttribute("font-family", `${e.fonte}, Arial, Helvetica, sans-serif`);
      copia.style.fontFamily = `${e.fonte}, Arial, Helvetica, sans-serif`;
      const xml = new XMLSerializer().serializeToString(copia).replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="#ffffff"/>`);
      const salvar = (blob: Blob, ext: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${nome}.${ext}`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      if (formato === "svg") { salvar(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), "svg"); return; }
      const escala = 3;
      const img = new Image();
      await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error("Não consegui gerar a imagem.")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`; });
      const tela = document.createElement("canvas");
      tela.width = width * escala; tela.height = height * escala;
      const c = tela.getContext("2d")!;
      c.scale(escala, escala); c.drawImage(img, 0, 0, width, height);
      const png = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/png"));
      if (png) salvar(png, "png");
    },
  }), [e.fonte]);

  if (!todos.length) {
    return <p className="m-0 py-16 text-center text-[13px] text-[var(--color-neutral-600)]">The series have no tests with {eixoX.titulo.toLowerCase()} and PVbt to plot.</p>;
  }

  const fn = e.tamanhoNumeros, ft = e.tamanhoTitulosEixos;
  const tituloX = e.tituloX.trim() || eixoX.titulo;
  const tituloY = e.tituloY.trim() || TITULO_Y_PADRAO;
  // margens acompanham os tamanhos de fonte, mantendo a área dos pontos perto de quadrada
  const larguraY = Math.round(fn * 3.4 + 16);
  const alturaX = Math.round(fn + 16);
  const baixo = Math.round(ft * 1.6 + 16);
  const esquerda = Math.round(ft * 1.5);
  const topo = e.titulo.trim() ? Math.round(e.tamanhoTitulo * 2 + 12) : 28;
  const eixo = { type: "number" as const, scale: "log" as const, allowDataOverflow: true, stroke: "#000", strokeWidth: 1.5 };
  const numeros = { fontSize: fn, fill: TEXTO, fontFamily: e.fonte };

  return (
    <div ref={caixa} className="mx-auto w-full aspect-square" style={{ maxWidth: p.altura ?? 640, fontFamily: `${e.fonte}, Arial, sans-serif` }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: topo, right: 26, bottom: baixo, left: esquerda }}>
          <CartesianGrid vertical={false} horizontal={false} />
          {/* eixos de baixo e da esquerda com números; cima e direita só a moldura, como no Origin */}
          <XAxis xAxisId="x" dataKey="x" domain={ex.dominio} ticks={ex.marcas} tickFormatter={dec2} {...eixo} height={alturaX}
            tick={numeros} tickLine={{ stroke: "#000" }} tickSize={6}
            label={{ value: tituloX, position: "insideBottom", offset: -Math.round(ft * 1.55), fontSize: ft, fill: TEXTO, fontFamily: e.fonte }} />
          <XAxis xAxisId="xt" dataKey="x" orientation="top" domain={ex.dominio} ticks={ex.marcas} {...eixo} tick={false} tickLine={{ stroke: "#000" }} tickSize={6} height={8} />
          <YAxis yAxisId="y" dataKey="y" domain={ey.dominio} ticks={ey.marcas} tickFormatter={dec2} {...eixo} width={larguraY}
            tick={numeros} tickLine={{ stroke: "#000" }} tickSize={6}
            label={{ value: tituloY, angle: -90, position: "insideLeft", offset: -Math.round(ft * 0.7), fontSize: ft, fill: TEXTO, fontFamily: e.fonte, style: { textAnchor: "middle" } }} />
          <YAxis yAxisId="yr" dataKey="y" orientation="right" domain={ey.dominio} ticks={ey.marcas} {...eixo} tick={false} tickLine={{ stroke: "#000" }} tickSize={6} width={4} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
            const d = active ? (payload?.[0]?.payload as (SerieGrafico["pontos"][number] & { serie?: string; cor?: string }) | undefined) : undefined;
            return d ? (
              <div className="rounded-md border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow-md">
                <p className="m-0 font-bold" style={{ color: d.cor }}>{d.serie}</p>
                <p className="m-0 text-[var(--color-neutral-600)]">{d.detalhe}</p>
                <p className="m-0 tabular-nums">{eixoX.simbolo} = {exato(d.x)} {eixoX.unidade}</p>
                <p className="m-0 tabular-nums">PVbt = <strong>{exato(d.y)}</strong></p>
              </div>
            ) : null;
          }} />
          {p.series.map((s) => (
            <Scatter key={s.id} name={s.nome} xAxisId="x" yAxisId="y" isAnimationActive={false}
              data={[...s.pontos].sort((a, b) => a.x - b.x).map((d) => ({ ...d, serie: s.nome, cor: s.cor }))}
              line={s.linha === "none" ? false : { stroke: s.cor, strokeWidth: e.espessuraLinha, strokeDasharray: TRACO[s.linha ?? "solid"] }}
              legendType="none"
              shape={(q: { cx?: number; cy?: number }) => (
                <Forma forma={s.marcador} cx={q.cx ?? 0} cy={q.cy ?? 0} cor={s.cor} r={e.tamanhoSimbolo} vazado={s.vazado} />
              )} />
          ))}
          <LegendaOrigin series={p.series} e={e} />
          <TituloGrafico texto={e.titulo} tamanho={e.tamanhoTitulo} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});
