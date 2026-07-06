"use client";

/**
 * Candlestick panel — TradingView's lightweight-charts (v5 API) themed to the
 * desk. Draws real H1 candles from the state payload and, when a signal is
 * selected, its entry / stop / target price lines with direction-aware colors.
 */
import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type IPriceLine } from "lightweight-charts";

export type Candle = { t: number; o: number; h: number; l: number; c: number };
export type ChartLevels = { entry?: number; stop?: number; targets?: number[]; direction?: "long" | "short" } | null;

const UP = "#34d399";
const DOWN = "#f87171";

export function PairChart({ candles, levels, height = 320 }: { candles: Candle[]; levels: ChartLevels; height?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      height,
      layout: { background: { color: "transparent" }, textColor: "#8b93a7", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "rgba(140,150,175,0.07)" }, horzLines: { color: "rgba(140,150,175,0.07)" } },
      rightPriceScale: { borderColor: "rgba(140,150,175,0.15)" },
      timeScale: { borderColor: "rgba(140,150,175,0.15)", timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { color: "#4fd1c5", labelBackgroundColor: "#134e4a" }, vertLine: { color: "rgba(79,209,197,0.4)", labelBackgroundColor: "#134e4a" } },
      handleScroll: true,
      handleScale: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth }));
    ro.observe(host);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(candles.map((c) => ({ time: c.t as never, open: c.o, high: c.h, low: c.l, close: c.c })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    if (!levels?.entry) return;
    const mk = (price: number, color: string, title: string) =>
      linesRef.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
    mk(levels.entry, "#4fd1c5", "ENTRY");
    if (levels.stop) mk(levels.stop, DOWN, "SL");
    (levels.targets || []).forEach((t, i) => mk(t, UP, `TP${i + 1}`));
  }, [levels]);

  return <div ref={hostRef} className="w-full" style={{ height }} />;
}
