"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Biểu đồ của trang Tổng quan — SVG / HTML thuần, không thêm thư viện.
 * Quy ước: nét mảnh (đường 2px, cột ≤ 24px, đầu cột bo 4px, gốc vuông), lưới kẻ mảnh liền, chữ luôn dùng màu chữ
 * (không tô màu dữ liệu), ≥ 2 chuỗi thì có chú thích, mọi biểu đồ có bảng ẩn cho trình đọc màn hình, rê chuột / phím
 * mũi tên hiện giá trị.
 */

/**
 * Màu dữ liệu (đã kiểm tra tương phản và mù màu trên nền trắng): chuỗi chính xanh, chuỗi thứ hai cam, thứ ba xanh ngọc,
 * kỳ trước xám. Xanh ngọc tương phản < 3:1 với nền nên chỉ dùng khi kèm chú thích có số (VD SegmentedBar).
 */
export const CHART = {
  primary: "#2a78d6",
  secondary: "#eb6834",
  tertiary: "#1baf7a",
  previous: "#b5b5b5",
  grid: "#ebebeb",
  axis: "#d4d4d4",
  muted: "#8a8a8a",
};

/** Theo dõi bề rộng thật của khung để vẽ SVG đúng pixel (chữ không bị co giãn). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Vạch chia trục Y tròn số: 0, bước "đẹp" (1 / 2 / 2.5 / 5 × 10ⁿ), tối đa ~4 khoảng. */
function niceTicks(max: number, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Chỉ số các nhãn trục X được in (đều nhau, luôn có điểm đầu và cuối) để nhãn không chồng nhau. */
function xTickIndexes(n: number, width: number, minGap = 64) {
  if (n <= 1) return [0];
  const max = Math.max(2, Math.floor(width / minGap));
  const step = Math.max(1, Math.ceil((n - 1) / (max - 1)));
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) {
    // Nhãn đều cuối cùng cách điểm cuối không quá nửa bước thì bỏ, kẻo hai nhãn dính vào nhau ("12/1113/11").
    if (n - 1 - idx[idx.length - 1] <= step / 2) idx.pop();
    idx.push(n - 1);
  }
  return idx;
}

/** Hộp chú giải trên biểu đồ: giá trị đậm đứng trước, tên chuỗi nhạt đứng sau; khóa màu là nét ngắn. */
function Tooltip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: { key: string; color: string; label: string; value: string; dashed?: boolean }[] }) {
  const w = 190;
  const left = Math.min(Math.max(x + 12, 0), Math.max(0, width - w)) - (x + 12 + w > width ? w + 24 : 0);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg bg-white px-3 py-2 text-xs shadow-dropdown"
      style={{ left: Math.max(0, left), top: Math.max(0, y), width: w }}
    >
      <p className="mb-1 text-muted2">{title}</p>
      {rows.map((r) => (
        <p key={r.key} className="flex items-center gap-2">
          <svg width="12" height="4" aria-hidden className="shrink-0">
            <line x1="0" y1="2" x2="12" y2="2" stroke={r.color} strokeWidth="2" strokeDasharray={r.dashed ? "3 2" : undefined} strokeLinecap="round" />
          </svg>
          <span className="font-semibold text-ink">{r.value}</span>
          <span className="min-w-0 truncate text-muted2">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

export type LineSeries = { key: string; label: string; color: string; values: (number | null)[]; dashed?: boolean };

/**
 * Biểu đồ đường theo thời gian (một trục Y). Chuỗi đầu tiên là chuỗi chính: có nền mờ 10% và chấm cuối.
 * Rê chuột / phím ← → để xem giá trị mọi chuỗi tại một ngày.
 */
export function LineChart({
  series,
  xLabels,
  xTitles,
  height = 220,
  format,
  formatAxis,
  label,
}: {
  series: LineSeries[];
  /** Nhãn ngắn dưới trục X. */
  xLabels: string[];
  /** Tiêu đề đầy đủ trong hộp giá trị (VD "Thứ Hai, 10/11/2026"). */
  xTitles?: string[];
  height?: number;
  format: (v: number) => string;
  formatAxis: (v: number) => string;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = xLabels.length;
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const m = { l: 8 + Math.max(...ticks.map((t) => formatAxis(t).length)) * 6.5, r: 12, t: 10, b: 26 };
  const pw = Math.max(1, width - m.l - m.r);
  const ph = height - m.t - m.b;
  const x = (i: number) => m.l + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const path = (vals: (number | null)[]) =>
    vals.reduce<string>((d, v, i) => (v == null ? d : `${d}${d && vals[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");
  const main = series[0];
  const area = main && n > 1 ? `${path(main.values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const lastIdx = main ? main.values.reduce<number>((acc, v, i) => (v != null ? i : acc), -1) : -1;

  const pick = (clientX: number, rect: DOMRect) => {
    if (n <= 1) return setHover(0);
    const i = Math.round(((clientX - rect.left - m.l) / pw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted2">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <svg width="14" height="4" aria-hidden>
                <line x1="1" y1="2" x2="13" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "3 2" : undefined} strokeLinecap="round" />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={label}
            tabIndex={0}
            className="rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover((h) => h ?? Math.max(0, lastIdx))}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              setHover((h) => Math.min(n - 1, Math.max(0, (h ?? lastIdx) + (e.key === "ArrowRight" ? 1 : -1))));
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} strokeWidth="1" />
                <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={CHART.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatAxis(t)}
                </text>
              </g>
            ))}
            {xTickIndexes(n, pw).map((i) => (
              <text key={i} x={x(i)} y={height - 8} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"} fontSize="11" fill={CHART.muted}>
                {xLabels[i]}
              </text>
            ))}
            {area && <path d={area} fill={main.color} opacity="0.1" />}
            {/* Chuỗi phụ vẽ trước, chuỗi chính vẽ sau cùng để nằm trên. */}
            {[...series].reverse().map((s) => (
              <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "4 3" : undefined} />
            ))}
            {main && lastIdx >= 0 && hover === null && (
              <circle cx={x(lastIdx)} cy={y(main.values[lastIdx] ?? 0)} r="4" fill={main.color} stroke="#fff" strokeWidth="2" />
            )}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ph} stroke={CHART.axis} strokeWidth="1" />
                {series.map((s) =>
                  s.values[hover] == null ? null : <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
                )}
              </g>
            )}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tooltip
            x={x(hover)}
            y={m.t}
            width={width}
            title={xTitles?.[hover] ?? xLabels[hover]}
            rows={series.map((s) => ({ key: s.key, color: s.color, label: s.label, dashed: s.dashed, value: s.values[hover] == null ? "—" : format(s.values[hover]!) }))}
          />
        )}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Ngày</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xLabels.map((l, i) => (
            <tr key={i}>
              <td>{xTitles?.[i] ?? l}</td>
              {series.map((s) => (
                <td key={s.key}>{s.values[i] == null ? "—" : format(s.values[i]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Biểu đồ cột một chuỗi (VD số đơn mỗi ngày). Cột ≤ 24px, đầu bo 4px, rê chuột / phím ← → xem từng cột. */
export function ColumnChart({
  values,
  xLabels,
  xTitles,
  height = 180,
  format,
  label,
  color = CHART.primary,
}: {
  values: number[];
  xLabels: string[];
  xTitles?: string[];
  height?: number;
  format: (v: number) => string;
  label: string;
  color?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  // Đếm số (đơn hàng) nên vạch chia là số nguyên: lấy bước "đẹp" rồi làm tròn lên ≥ 1.
  const maxV = Math.max(0, ...values);
  const step = Math.max(1, Math.ceil(niceTicks(maxV, 3)[1] ?? 1));
  const ticks: number[] = [0];
  while (ticks[ticks.length - 1] < Math.max(1, maxV)) ticks.push(ticks[ticks.length - 1] + step);
  const top = ticks[ticks.length - 1] || 1;
  const m = { l: 8 + Math.max(...ticks.map((t) => String(t).length)) * 6.5, r: 6, t: 10, b: 26 };
  const pw = Math.max(1, width - m.l - m.r);
  const ph = height - m.t - m.b;
  const band = pw / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const cx = (i: number) => m.l + band * i + band / 2;
  const column = (i: number, v: number) => {
    const x0 = cx(i) - bw / 2;
    const h = Math.max(0, y(0) - y(v));
    if (h <= 0) return "";
    const r = Math.min(4, bw / 2, h);
    return `M${x0},${y(0)}V${y(0) - h + r}Q${x0},${y(0) - h} ${x0 + r},${y(0) - h}H${x0 + bw - r}Q${x0 + bw},${y(0) - h} ${x0 + bw},${y(0) - h + r}V${y(0)}Z`;
  };

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={label}
            tabIndex={0}
            className="rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onPointerMove={(e) => {
              const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - m.l) / band);
              setHover(i >= 0 && i < n ? i : null);
            }}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover((h) => h ?? n - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              setHover((h) => Math.min(n - 1, Math.max(0, (h ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1))));
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} strokeWidth="1" />
                <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={CHART.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t}
                </text>
              </g>
            ))}
            {xTickIndexes(n, pw, 56).map((i) => (
              <text key={i} x={cx(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={CHART.muted}>
                {xLabels[i]}
              </text>
            ))}
            {hover !== null && <rect x={m.l + band * hover} y={m.t} width={band} height={ph} fill="#f3f3f3" />}
            {values.map((v, i) => (
              <path key={i} d={column(i, v)} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
            ))}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tooltip x={cx(hover)} y={m.t} width={width} title={xTitles?.[hover] ?? xLabels[hover]} rows={[{ key: "v", color, label, value: format(values[hover]) }]} />
        )}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <td>{xTitles?.[i] ?? xLabels[i]}</td>
              <td>{format(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Thanh ngang xếp hạng (một chuỗi, một màu): tên bên trái, giá trị ở đầu thanh. */
export function BarList({
  rows,
  format,
  label,
  color = CHART.primary,
}: {
  rows: { key: string; label: ReactNode; sub?: ReactNode; value: number; href?: string }[];
  format: (v: number) => string;
  label: string;
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="min-w-0 truncate text-[13px]">
            {r.label}
            {r.sub && <span className="ml-1.5 text-xs text-muted2">{r.sub}</span>}
          </span>
          <span className="text-right text-[13px] font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
            {format(r.value)}
          </span>
          <span className="col-span-2 h-2 rounded-full bg-surface-active" aria-hidden>
            <span className="block h-2 rounded-r-full" style={{ width: `${(r.value / max) * 100}%`, background: color, minWidth: r.value > 0 ? 3 : 0 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Thanh cơ cấu (một tổng chia phần): thanh mảnh 8px, khoảng hở 2px giữa các phần, chú thích liệt kê số và tỷ lệ. */
export function SegmentedBar({
  parts,
  label,
  format = String,
}: {
  parts: { key: string; label: string; value: number; color: string }[];
  label: string;
  format?: (v: number) => string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : "0%");
  return (
    <div>
      <div role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${format(p.value)} (${pct(p.value)})`).join(", ")}`} className="flex h-2 gap-0.5">
        {total === 0 ? (
          <span className="h-2 flex-1 rounded-full bg-surface-active" />
        ) : (
          shown.map((p, i) => (
            <span
              key={p.key}
              title={`${p.label}: ${format(p.value)} (${pct(p.value)})`}
              className={cn("h-2", i === 0 && "rounded-l-full", i === shown.length - 1 && "rounded-r-full")}
              style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
            />
          ))
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
              {format(p.value)}
            </span>
            <span className="w-10 text-right text-xs text-muted2" style={{ fontVariantNumeric: "tabular-nums" }}>
              {pct(p.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Đường xu hướng nhỏ trong ô chỉ số (không trục, chỉ để thấy hình dạng). */
export function Sparkline({ values, color = CHART.primary, height = 32 }: { values: (number | null)[]; color?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const nums = values.map((v) => v ?? 0);
  const max = Math.max(1, ...nums);
  const n = values.length;
  const x = (i: number) => 2 + (n <= 1 ? 0 : (i / (n - 1)) * (width - 4));
  const y = (v: number) => 2 + (height - 4) * (1 - v / max);
  const d = nums.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <div ref={ref} style={{ height }} aria-hidden>
      {width > 0 && n > 1 && (
        <svg width={width} height={height}>
          <path d={`${d}L${x(n - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity="0.08" />
          <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
