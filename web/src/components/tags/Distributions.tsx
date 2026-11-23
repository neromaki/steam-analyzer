// What the search's released games look like: reviews, rating, price, and releases per month.
import { useMemo } from 'react';
import type { Theme } from '../../lib/api';
import { fmtCompact, fmtInt } from '../../lib/format';
import { useScopedRange } from '../../state/range';
import { useThemeDist } from '../../state/theme';
import EChart, { baseOption, useChartColors, type ChartColors, type EOption } from '../EChart';
import { ChartOrTable, QueryState, Section, useInView } from './common';

const PRICE = ['£0–2', '£2–5', '£5–10', '£10–15', '£15–20', '£20–30', '£30–50', '£50+'];
const reviewLabel = (b: number) => (b < 0 ? '0' : `${fmtCompact(Math.ceil(10 ** (b / 2)))}–${fmtCompact(Math.floor(10 ** ((b + 1) / 2)))}`);
const priceLabel = (b: number) => (b === -1 ? 'Free' : b === -2 ? 'No price' : PRICE[b - 1] ?? `${b}`);

function bars(c: ChartColors, labels: string[], values: number[], title: string): EOption {
  const b = baseOption(c);
  const total = values.reduce((s, v) => s + v, 0) || 1;
  return {
    ...b,
    tooltip: { ...(b.tooltip as object), trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: c.grid } },
      formatter: (ps: { dataIndex: number }[]) => {
        const i = ps[0].dataIndex;
        return `<b>${labels[i]}</b><br>${fmtInt(values[i])} games (${((values[i] / total) * 100).toFixed(1)}%)`;
      } },
    xAxis: { ...(b.xAxis as object), type: 'category', data: labels, name: title, nameLocation: 'middle', nameGap: 26,
      nameTextStyle: { color: c.muted, fontSize: 11 }, axisLabel: { color: c.muted, fontSize: 10, hideOverlap: true } },
    yAxis: { ...(b.yAxis as object), type: 'value', axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmtCompact(v) } },
    grid: { ...(b.grid as object), bottom: 22 },
    series: [{ type: 'bar', data: values, barMaxWidth: 24, itemStyle: { color: c.series[0], borderRadius: [4, 4, 0, 0] } }],
  };
}

function Mini({ title, labels, values }: { title: string; labels: string[]; values: number[] }) {
  const c = useChartColors();
  const option = useMemo(() => bars(c, labels, values, title), [c, labels, values, title]);
  return (
    <div className="dist-cell">
      <h3>{title}</h3>
      <ChartOrTable
        chart={<EChart option={option} height={200} label={title} />}
        table={<table className="dtable"><thead><tr><th>{title}</th><th className="num">Games</th></tr></thead>
          <tbody>{labels.map((l, i) => <tr key={l}><td>{l}</td><td className="num">{fmtInt(values[i])}</td></tr>)}</tbody></table>} />
    </div>
  );
}

export default function Distributions({ theme }: { theme: Theme }) {
  const { range } = useScopedRange('dist');
  const [ref, seen] = useInView<HTMLDivElement>();
  const q = useThemeDist(theme, range, seen);
  const c = useChartColors();
  const d = q.data;
  const parts = useMemo(() => {
    if (!d) return null;
    const rv = d.reviews ?? [], rt = d.rating ?? [], pr = (d.price ?? []).slice().sort((a, b) => (a[0] < 0 ? 100 + a[0] : a[0]) - (b[0] < 0 ? 100 + b[0] : b[0]));
    return {
      reviews: { labels: rv.map(r => reviewLabel(r[0])), values: rv.map(r => r[1]) },
      rating: { labels: rt.map(r => `${r[0]}%`), values: rt.map(r => r[1]) },
      price: { labels: pr.map(r => priceLabel(r[0])), values: pr.map(r => r[1]) },
    };
  }, [d]);
  const monthly = useMemo<EOption | null>(() => {
    if (!d?.monthly) return null;
    const b = baseOption(c);
    return {
      ...b,
      tooltip: { ...(b.tooltip as object), trigger: 'axis' },
      xAxis: { ...(b.xAxis as object), type: 'category', data: d.monthly.map(m => m[0]), boundaryGap: false },
      yAxis: { ...(b.yAxis as object), type: 'value', axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmtCompact(v) } },
      series: [{ type: 'line', name: 'Releases', data: d.monthly.map(m => m[1]), showSymbol: false,
        lineStyle: { width: 2, color: c.series[0] }, itemStyle: { color: c.series[0] }, areaStyle: { color: c.series[0], opacity: 0.1 } }],
    };
  }, [d, c]);

  return (
    <Section title="Distributions" rangeId="dist" sub="Released games in the date range. Ratings count games with 10+ reviews.">
      <div ref={ref}>
        <QueryState q={q} height={460}>
          {parts && (
            <>
              <div className="dist-grid">
                <Mini title="Reviews" {...parts.reviews} />
                <Mini title="Positive reviews" {...parts.rating} />
                <Mini title="Price" {...parts.price} />
              </div>
              {monthly && <div className="dist-cell"><h3>Releases per month</h3>
                <EChart option={monthly} height={200} label="Releases per month" /></div>}
            </>
          )}
        </QueryState>
      </div>
    </Section>
  );
}
