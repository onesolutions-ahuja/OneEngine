import { useMemo, useState } from "react";

function scalePoints(points, width = 100, height = 70) {
  if (!points.length) return [];
  const values = points.map((point) => Number(point.value) || 0);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  return points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? width / 2 : (index / (points.length - 1)) * width,
    y: height - ((Number(point.value) - min) / range) * height,
  }));
}

function Tooltip({ point, formatValue, format }) {
  if (!point) return null;
  return (
    <div className="pointer-events-none absolute z-20 rounded-lg px-2 py-1 text-xs shadow-lg"
      style={{ background: "var(--onepos-text-heading)", color: "var(--onepos-surface-raised)", left: `${point.x}%`, top: `${point.y}%`, transform: "translate(-50%,-115%)" }}>
      <div className="font-medium whitespace-nowrap">{point.label}</div>
      <div className="tabular-nums">{formatValue(point.value, format)}</div>
    </div>
  );
}

export function LineChart({ points = [], config = {}, formatValue, onPointClick }) {
  const [hovered, setHovered] = useState(null);
  const shown = points.slice(0, config.limit || 40);
  const scaled = useMemo(() => scalePoints(shown), [shown]);
  if (!scaled.length) return null;
  const path = scaled.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  return (
    <div className="relative h-full min-h-[150px]">
      <svg viewBox="0 0 100 78" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Line chart">
        <path d={path} fill="none" stroke="var(--onepos-accent-600)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {config.showMarkers !== false ? scaled.map((point, index) => (
          <circle key={`${point.label}-${index}`} cx={point.x} cy={point.y} r="2.5"
            fill="var(--onepos-surface-raised)" stroke="var(--onepos-accent-600)" strokeWidth="1.5"
            tabIndex={0}
            onMouseEnter={() => setHovered({ ...point, x: point.x, y: (point.y / 78) * 100 })}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered({ ...point, x: point.x, y: (point.y / 78) * 100 })}
            onBlur={() => setHovered(null)}
            onClick={() => onPointClick?.(point)}
          ><title>{point.label}: {formatValue(point.value, config.format)}</title></circle>
        )) : null}
      </svg>
      <Tooltip point={hovered} formatValue={formatValue} format={config.format} />
    </div>
  );
}

export function GaugeChart({ points = [], config = {}, formatValue, onPointClick }) {
  if (!points.length) return null;
  const value = config.labelField ? Number(points[0]?.value || 0) : points.reduce((sum, point) => sum + Number(point.value || 0), 0);
  const target = config.targetMode === "field"
    ? Number(points.find((point) => point.field === config.targetField)?.value || config.targetValue || 100)
    : Number(config.targetValue || 100);
  const ratio = target > 0 ? Math.min(Math.max(value / target, 0), 1) : 0;
  const angle = -90 + ratio * 180;
  return (
    <button type="button" className="h-full w-full flex flex-col items-center justify-center" onClick={() => onPointClick?.({ label: "Value", value })}>
      <svg viewBox="0 0 120 70" className="w-full max-w-[230px]" role="img" aria-label={`Gauge ${formatValue(value, config.format)} of ${formatValue(target, config.format)}`}>
        <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="var(--onepos-surface-alt)" strokeWidth="12" strokeLinecap="round"/>
        <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="var(--onepos-accent-600)" strokeWidth="12" strokeLinecap="round" pathLength="100" strokeDasharray={`${ratio * 100} 100`}/>
        <line x1="60" y1="60" x2={60 + 38 * Math.cos(angle * Math.PI / 180)} y2={60 + 38 * Math.sin(angle * Math.PI / 180)} stroke="var(--onepos-text-heading)" strokeWidth="2"/>
        <circle cx="60" cy="60" r="3" fill="var(--onepos-text-heading)"/>
      </svg>
      <div className="text-2xl font-bold tabular-nums">{formatValue(value, config.format)}</div>
      <div className="text-xs" style={{ color: "var(--onepos-text-muted)" }}>Target {formatValue(target, config.format)}</div>
    </button>
  );
}

export function FunnelChart({ points = [], config = {}, formatValue, onPointClick }) {
  const shown = points.slice(0, config.limit || 8);
  const max = Math.max(...shown.map((point) => Math.abs(Number(point.value) || 0)), 0);
  if (!shown.length) return null;
  return (
    <div className="h-full flex flex-col justify-center gap-1.5">
      {shown.map((point, index) => {
        const width = max ? Math.max((Math.abs(Number(point.value)) / max) * 100, 18) : 18;
        return (
          <button key={`${point.label}-${index}`} type="button" onClick={() => onPointClick?.(point)} className="mx-auto rounded-md px-3 py-1.5 text-xs flex items-center justify-between gap-3"
            style={{ width: `${width}%`, background: `var(--dash-series-${(index % 6) + 1}, var(--onepos-accent-600))`, color: "#fff" }}
            title={`${point.label}: ${formatValue(point.value, config.format)}`}>
            <span className="truncate">{point.label}</span><strong className="tabular-nums">{formatValue(point.value, config.format)}</strong>
          </button>
        );
      })}
    </div>
  );
}

export function ScatterChart({ points = [], config = {}, formatValue, onPointClick }) {
  const [hovered, setHovered] = useState(null);
  const shown = points.slice(0, config.limit || 60);
  if (!shown.length) return null;
  const xs = shown.map((point, index) => Number(point.xValue ?? index));
  const ys = shown.map((point) => Number(point.value) || 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const scaled = shown.map((point, index) => ({
    ...point,
    x: 5 + ((xs[index] - minX) / rangeX) * 90,
    y: 95 - ((ys[index] - minY) / rangeY) * 90,
  }));
  return (
    <div className="relative h-full min-h-[150px]">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Scatter chart">
        <line x1="5" y1="95" x2="95" y2="95" stroke="var(--onepos-border)" />
        <line x1="5" y1="5" x2="5" y2="95" stroke="var(--onepos-border)" />
        {scaled.map((point, index) => <circle key={`${point.label}-${index}`} cx={point.x} cy={point.y} r="3"
          fill={`var(--dash-series-${(index % 6) + 1}, var(--onepos-accent-600))`}
          tabIndex={0}
          onMouseEnter={() => setHovered(point)} onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(point)} onBlur={() => setHovered(null)}
          onClick={() => onPointClick?.(point)}>
          <title>{point.label}: {formatValue(point.value, config.format)}</title>
        </circle>)}
      </svg>
      <Tooltip point={hovered} formatValue={formatValue} format={config.format} />
    </div>
  );
}

export function MultiSeriesBarChart({ series = [], categories = [], config = {}, formatValue, onPointClick }) {
  const allValues = series.flatMap((entry) => entry.points.map((point) => Math.abs(Number(point.value) || 0)));
  const max = Math.max(...allValues, 0);
  if (!series.length || !categories.length) return null;
  return (
    <div className="h-full min-h-[160px] flex items-end gap-2">
      {categories.map((category) => (
        <div key={category} className="flex-1 min-w-0 h-full flex flex-col justify-end">
          <div className={`flex-1 flex items-end justify-center gap-1 ${config.stacked ? "flex-col-reverse" : ""}`}>
            {series.map((entry, seriesIndex) => {
              const point = entry.points.find((item) => item.label === category) || { label: category, value: 0 };
              const height = max ? Math.max((Math.abs(Number(point.value)) / max) * 100, 2) : 2;
              return <button key={entry.key} type="button" className={config.stacked ? "w-full" : "flex-1"} style={{ height: `${height}%`, background: `var(--dash-series-${(seriesIndex % 6) + 1})` }} title={`${entry.label} · ${category}: ${formatValue(point.value, config.format)}`} onClick={() => onPointClick?.({ ...point, series: entry.key })} />;
            })}
          </div>
          <span className="text-[10px] truncate text-center mt-1" style={{ color: "var(--onepos-text-muted)" }}>{category}</span>
        </div>
      ))}
    </div>
  );
}

export function ComboChart({ rows = [], config = {}, formatValue, onPointClick }) {
  const categoryField = config.labelField || config.xField;
  const fields = Array.isArray(config.yFields) && config.yFields.length ? config.yFields : [config.valueField].filter(Boolean);
  const secondary = new Set(config.secondaryAxisFields || []);
  if (!categoryField || !fields.length || !rows.length) return null;
  const primaryFields = fields.filter((field) => !secondary.has(field));
  const secondaryFields = fields.filter((field) => secondary.has(field));
  const maxFor = (list) => Math.max(1, ...rows.flatMap((row) => list.map((field) => Math.abs(Number(row?.[field]) || 0))));
  const primaryMax = maxFor(primaryFields);
  const secondaryMax = maxFor(secondaryFields);
  const x = (index) => rows.length === 1 ? 50 : 8 + (index / (rows.length - 1)) * 84;
  const linePath = (field, max) => rows.map((row, index) => `${index ? "L" : "M"} ${x(index)} ${92 - (Math.abs(Number(row?.[field]) || 0) / max) * 78}`).join(" ");
  return (
    <div className="relative h-full min-h-[170px]">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Combo chart">
        <line x1="6" y1="92" x2="96" y2="92" stroke="var(--onepos-border)" />
        {primaryFields.map((field, fieldIndex) => rows.map((row, index) => {
          const value = Number(row?.[field]) || 0;
          const height = (Math.abs(value) / primaryMax) * 78;
          const width = Math.max(2, Math.min(8, 72 / Math.max(rows.length, 1) / Math.max(primaryFields.length, 1)));
          const offset = (fieldIndex - (primaryFields.length - 1) / 2) * (width + 0.8);
          const label = String(row?.[categoryField] ?? "");
          return <rect key={`${field}-${index}`} x={x(index) - width / 2 + offset} y={92 - height} width={width} height={height} rx="1" fill={`var(--dash-series-${(fieldIndex % 6) + 1}, var(--onepos-accent-600))`} onClick={() => onPointClick?.({ label, value, field })}><title>{label}: {formatValue(value, config.format)}</title></rect>;
        }))}
        {secondaryFields.map((field, index) => <path key={field} d={linePath(field, secondaryMax)} fill="none" stroke={`var(--dash-series-${((primaryFields.length + index) % 6) + 1}, var(--onepos-accent-600))`} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
  );
}