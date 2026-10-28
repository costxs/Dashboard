import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, usePlotArea, XAxis, YAxis } from "recharts";
import { fmtExato } from "../../utils/formatacao";

export type Marcador = "circle" | "square" | "triangle" | "diamond" | "triangleDown";

export interface SerieGrafico {
  id: string
  nome: string
  cor: string
  marcador: Marcador
  pontos: { x: number; y: number; detalhe: string }[]
}

export interface ExportarComparacao { baixar: (formato: "png" | "svg", nome: string) => Promise<void> }

// sequência do padrão Origin (a mesma dos gráficos do backend): preto, magenta, vermelho, azul, verde...
export const CORES_SERIE = ["#000000", "#FF00FF", "#FF0000", "#0000FF", "#008000", "#808000", "#000080", "#800080", "#008080", "#800000"];
export const MARCADORES_SERIE: Marcador[] = ["circle", "square", "triangle", "diamond", "triangleDown"];

const TEXTO = "#000000";
const dec2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** desenha o marcador (cada forma centrada no ponto) */
function Forma(p: { forma: Marcador; cx: number; cy: number; cor: string; r?: number }) {
  const { forma, cx, cy, cor } = p, r = p.r ?? 5.5;
  if (forma === "square") return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} fill={cor} />;
  if (forma === "triangle") return <polygon points={`${cx},${cy - r * 1.15} ${cx - r * 1.1},${cy + r * 0.9} ${cx + r * 1.1},${cy + r * 0.9}`} fill={cor} />;
  if (forma === "triangleDown") return <polygon points={`${cx},${cy + r * 1.15} ${cx - r * 1.1},${cy - r * 0.9} ${cx + r * 1.1},${cy - r * 0.9}`} fill={cor} />;
  if (forma === "diamond") return <polygon points={`${cx},${cy - r * 1.25} ${cx + r * 1.25},${cy} ${cx},${cy + r * 1.25} ${cx - r * 1.25},${cy}`} fill={cor} />;
  return <circle cx={cx} cy={cy} r={r} fill={cor} />;
}

/** legenda dentro da área do gráfico, em caixa, como no Origin (dentro do SVG, então sai no PNG/SVG exportado) */
function LegendaOrigin({ series }: { series: SerieGrafico[] }) {
  const area = usePlotArea();
  if (!area || !series.length) return null;
  const linha = 24, largura = Math.min(area.width - 16, Math.max(150, 62 + Math.max(...series.map((s) => s.nome.length)) * 7.6));
  return (
    <g transform={`translate(${area.x + 12},${area.y + 12})`} fontSize={14} fill={TEXTO}>
      <rect width={largura} height={series.length * linha + 8} fill="#fff" stroke="#000" strokeWidth={1} />
      {series.map((s, i) => (
        <g key={s.id} transform={`translate(0,${i * linha + 4 + linha / 2})`}>
          <line x1={6} x2={36} y1={0} y2={0} stroke="#000" strokeWidth={1} />
          <Forma forma={s.marcador} cx={21} cy={0} cor={s.cor} r={5} />
          <text x={44} y={5}>{s.nome}</text>
        </g>
      ))}
    </g>
  );
}

/** PVbt × Q (log-log), uma série por grupo de amostras, desenhado no navegador no estilo do Origin. */
export const GraficoComparacao = forwardRef<ExportarComparacao, { series: SerieGrafico[]; altura?: number }>(function GraficoComparacao(p, ref) {
  const caixa = useRef<HTMLDivElement>(null);
  const todos = useMemo(() => p.series.flatMap((s) => s.pontos).filter((d) => d.x > 0 && d.y > 0), [p.series]);
  // folga em volta dos pontos (nenhum fica em cima da moldura) e, em cima, o espaço da legenda; marcas só nas potências de 10
  const folga = (vals: number[], extraTopo = 0): { dominio: [number, number]; marcas: number[] } => {
    const lo = Math.min(...vals) / 1.6;
    const d0 = Math.log10((Math.max(...vals) * 1.6) / lo);
    const hi = Math.max(...vals) * 1.6 * 10 ** (extraTopo > 0 ? (extraTopo * d0) / (1 - extraTopo) : 0);
    const marcas: number[] = [];
    for (let e = Math.ceil(Math.log10(lo) - 1e-9); 10 ** e <= hi * (1 + 1e-9); e++) marcas.push(10 ** e);
    return { dominio: [lo, hi], marcas };
  };
  const ex = folga(todos.map((d) => d.x));
  const ey = folga(todos.map((d) => d.y), Math.min(0.5, (p.series.length * 24 + 24) / ((p.altura ?? 520) - 80)));
  const marcasX = ex.marcas, marcasYTopo = ey.marcas, topoY = ey.dominio;

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
      copia.style.fontFamily = "Arial, Helvetica, sans-serif";
      let xml = new XMLSerializer().serializeToString(copia).replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="#ffffff"/>`);
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
  }), []);

  if (!todos.length) {
    return <p className="m-0 py-16 text-center text-[13px] text-[var(--color-neutral-600)]">As séries não têm ensaios com vazão e PVbt para plotar.</p>;
  }

  const eixo = { type: "number" as const, scale: "log" as const, allowDataOverflow: true, stroke: "#000", strokeWidth: 1.5 };
  return (
    <div ref={caixa}>
      <ResponsiveContainer width="100%" height={p.altura ?? 520}>
        <ScatterChart margin={{ top: 14, right: 26, bottom: 46, left: 18 }}>
          <CartesianGrid vertical={false} horizontal={false} />
          {/* eixos de baixo e da esquerda com números; cima e direita só a moldura, como no Origin */}
          <XAxis xAxisId="x" dataKey="x" domain={ex.dominio} ticks={marcasX} tickFormatter={dec2} {...eixo}
            tick={{ fontSize: 14, fill: TEXTO }} tickLine={{ stroke: "#000" }} tickSize={6}
            label={{ value: "Q (mL/min)", position: "insideBottom", offset: -30, fontSize: 18, fill: TEXTO }} />
          <XAxis xAxisId="xt" dataKey="x" orientation="top" domain={ex.dominio} ticks={marcasX} {...eixo} tick={false} tickLine={{ stroke: "#000" }} tickSize={6} />
          <YAxis yAxisId="y" dataKey="y" domain={topoY} ticks={marcasYTopo} tickFormatter={dec2} {...eixo} width={64}
            tick={{ fontSize: 14, fill: TEXTO }} tickLine={{ stroke: "#000" }} tickSize={6}
            label={{ value: "PVBT", angle: -90, position: "insideLeft", offset: 6, fontSize: 18, fill: TEXTO, style: { textAnchor: "middle" } }} />
          <YAxis yAxisId="yr" dataKey="y" orientation="right" domain={topoY} ticks={marcasYTopo} {...eixo} tick={false} tickLine={{ stroke: "#000" }} tickSize={6} width={4} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
            const d = active ? (payload?.[0]?.payload as (SerieGrafico["pontos"][number] & { serie?: string; cor?: string }) | undefined) : undefined;
            return d ? (
              <div className="rounded-md border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow-md">
                <p className="m-0 font-bold" style={{ color: d.cor }}>{d.serie}</p>
                <p className="m-0 text-[var(--color-neutral-600)]">{d.detalhe}</p>
                <p className="m-0 tabular-nums">Q = {fmtExato(d.x)} mL/min</p>
                <p className="m-0 tabular-nums">PVbt = <strong>{fmtExato(d.y)}</strong></p>
              </div>
            ) : null;
          }} />
          {p.series.map((s) => (
            <Scatter key={s.id} name={s.nome} xAxisId="x" yAxisId="y" isAnimationActive={false}
              data={[...s.pontos].sort((a, b) => a.x - b.x).map((d) => ({ ...d, serie: s.nome, cor: s.cor }))}
              line={{ stroke: "#000", strokeWidth: 1 }} legendType="none"
              shape={(q: { cx?: number; cy?: number }) => <Forma forma={s.marcador} cx={q.cx ?? 0} cy={q.cy ?? 0} cor={s.cor} />} />
          ))}
          <LegendaOrigin series={p.series} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});
