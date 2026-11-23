// Thin ECharts wrapper: modular imports (only the chart types we use), colours read from
// the CSS theme tokens so charts follow the light/dark switch, and automatic resizing.
/* eslint-disable react-refresh/only-export-components -- the colour hook and base option belong with the chart */
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, useState } from 'react';

echarts.use([LineChart, ScatterChart, BarChart, GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

export type EOption = echarts.EChartsCoreOption;

export interface ChartColors {
  text: string; strong: string; muted: string; faint: string; grid: string; axis: string; panel: string;
  accent: string; series: string[];
}

function readColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    text: v('--text'), strong: v('--text-strong'), muted: v('--muted'), faint: v('--faint'), grid: v('--grid'),
    axis: v('--border-strong'), panel: v('--panel'), accent: v('--accent'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map(i => v(`--s${i}`)),
  };
}

/** Theme colours for charts; updates when the light/dark theme changes. */
export function useChartColors(): ChartColors {
  const [c, setC] = useState(readColors);
  useEffect(() => {
    const update = () => setC(readColors());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', update);
    return () => { mo.disconnect(); mq.removeEventListener('change', update); };
  }, []);
  return c;
}

/** Shared axis/tooltip styling so every chart reads as one system. */
export function baseOption(c: ChartColors): EOption {
  const axisCommon = {
    axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false },
    axisLabel: { color: c.muted, fontSize: 11 }, splitLine: { lineStyle: { color: c.grid } },
  };
  return {
    animation: false,
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily, color: c.text },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: c.panel, borderColor: c.axis, textStyle: { color: c.text, fontSize: 12 },
      extraCssText: 'box-shadow: var(--shadow);',
    },
    xAxis: { ...axisCommon, splitLine: { show: false } },
    yAxis: { ...axisCommon },
  };
}

interface Props {
  option: EOption;
  height?: number;
  onClick?: (p: { data: unknown; seriesIndex?: number; dataIndex: number }) => void;
  label: string; // accessible name
}

export default function EChart({ option, height = 280, onClick, label }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  useEffect(() => { clickRef.current = onClick; });

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: 'canvas' });
    chart.current = c;
    c.on('click', p => clickRef.current?.(p as never));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current!);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => { chart.current?.setOption(option, { notMerge: true }); }, [option]);

  return <div ref={el} className="echart" style={{ height }} role="img" aria-label={label} />;
}
