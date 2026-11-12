"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Download, FileText, Info, Star } from "lucide-react";
import { BarList, CHART, ColumnChart, LineChart, SegmentedBar } from "@/components/hsv/charts";
import {
  buildPeriod,
  type Cell,
  downloadCsv,
  fold,
  type Group,
  loadReportPrefs,
  PERIODS,
  type PeriodKey,
  REPORT_CATEGORIES,
  type ReportCategory,
  type ReportDef,
  type ReportPrefs,
  type ReportView,
  REPORTS,
  saveReportPrefs,
  viewedLabel,
} from "@/components/hsv/reports";
import { Card, Chip, DetailPage, EmptyState, ErrorBox, LoadingRows, PageHeader, Pager, SearchInput, Skeleton } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks/use-api";
import { toDateParam } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

/*
 * Báo cáo kiểu Shopify (Phân tích › Báo cáo): danh sách báo cáo dựng sẵn theo danh mục, tìm kiếm, ghim, "xem lần cuối";
 * mở một báo cáo (?r=<id>) → chọn kỳ / cách nhóm, ô tóm tắt, biểu đồ, bảng số liệu có dòng tổng, sắp xếp cột và xuất CSV.
 * Nhân viên chỉ thấy các báo cáo không cần API dành riêng cho Quản trị viên.
 */

const PAGE_SIZE = 50;
const LIST_COLS = "grid-cols-[28px_minmax(0,1fr)_130px_150px]";
type Tab = "all" | "pinned" | ReportCategory;

export default function ReportsPage() {
  const { session, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = session?.userId;

  // Ghim / xem lần cuối lưu ở trình duyệt theo tài khoản. Giữ kèm chủ của dữ liệu: chưa đọc xong (hoặc vừa đổi tài khoản)
  // thì coi như chưa có, để không ghi đè dữ liệu của tài khoản này bằng dữ liệu rỗng hay của tài khoản khác.
  const [store, setStore] = useState<{ userId: number; prefs: ReportPrefs } | null>(null);
  useEffect(() => {
    if (userId) setStore({ userId, prefs: loadReportPrefs(userId) });
  }, [userId]);
  useEffect(() => {
    if (store) saveReportPrefs(store.userId, store.prefs);
  }, [store]);
  const prefs = store && store.userId === userId ? store.prefs : null;
  const updatePrefs = (change: (p: ReportPrefs) => ReportPrefs) => setStore((s) => s && { ...s, prefs: change(s.prefs) });

  const visible = useMemo(() => REPORTS.filter((r) => !r.adminOnly || isAdmin), [isAdmin]);
  const rid = params.get("r");
  const def = rid ? visible.find((r) => r.id === rid) : undefined;
  const loaded = prefs !== null;

  // Mở một báo cáo → ghi "xem lần cuối".
  useEffect(() => {
    if (!def || !loaded) return;
    const at = new Date().toISOString();
    setStore((s) => s && { ...s, prefs: { ...s.prefs, viewed: { ...s.prefs.viewed, [def.id]: at } } });
  }, [def, loaded]);

  const togglePin = (id: string) =>
    updatePrefs((p) => ({ ...p, pinned: p.pinned.includes(id) ? p.pinned.filter((x) => x !== id) : [...p.pinned, id] }));

  const setParams = (patch: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    const url = s ? `${pathname}?${s}` : pathname;
    if (push) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };

  // Phiên chưa sẵn sàng: chưa biết vai trò → chưa vẽ (tránh báo nhầm "không có quyền").
  if (!session) return null;

  if (rid) {
    const back = () => setParams({ r: null, p: null, g: null }, true);
    if (!def)
      return (
        <DetailPage title="Không tìm thấy báo cáo" parent="Báo cáo" onBack={back}>
          <Card>
            <EmptyState
              icon={FileText}
              title={REPORTS.some((r) => r.id === rid) ? "Báo cáo này chỉ dành cho Quản trị viên" : "Báo cáo không tồn tại"}
              body="Quay lại danh sách để chọn báo cáo khác."
              action={
                <button onClick={back} className="hsv-btn-secondary">
                  Về danh sách báo cáo
                </button>
              }
            />
          </Card>
        </DetailPage>
      );
    const periodKey = (PERIODS.find((p) => p.key === params.get("p"))?.key ?? "30") as PeriodKey;
    const g = params.get("g");
    const group: Group | undefined = g === "day" || g === "month" ? g : undefined;
    return (
      <ReportDetail
        key={def.id}
        def={def}
        isAdmin={isAdmin}
        periodKey={periodKey}
        group={group}
        onPeriod={(p, grp) => setParams({ p, g: grp ?? null })}
        pinned={!!prefs?.pinned.includes(def.id)}
        onTogglePin={() => togglePin(def.id)}
        onBack={back}
      />
    );
  }

  return <ReportList reports={visible} prefs={prefs} onTogglePin={togglePin} onOpen={(id) => setParams({ r: id }, true)} />;
}

// ---------------------------------------------------------------- Danh sách báo cáo

function ReportList({
  reports,
  prefs,
  onTogglePin,
  onOpen,
}: {
  reports: ReportDef[];
  prefs: ReportPrefs | null;
  onTogglePin: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pinned = useMemo(() => prefs?.pinned ?? [], [prefs]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "Tất cả", count: reports.length },
    { key: "pinned", label: "Đã ghim", count: reports.filter((r) => pinned.includes(r.id)).length },
    ...REPORT_CATEGORIES.map((c) => ({ key: c as Tab, label: c, count: reports.filter((r) => r.category === c).length })).filter((t) => t.count > 0),
  ];

  const rows = useMemo(() => {
    const needle = fold(q.trim());
    const list = reports.filter(
      (r) =>
        (tab === "all" || (tab === "pinned" ? pinned.includes(r.id) : r.category === tab)) &&
        (!needle || fold(`${r.name} ${r.description} ${r.category}`).includes(needle))
    );
    // Báo cáo đã ghim lên đầu, còn lại giữ thứ tự theo danh mục.
    return [...list.filter((r) => pinned.includes(r.id)), ...list.filter((r) => !pinned.includes(r.id))];
  }, [reports, tab, q, pinned]);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Báo cáo" subtitle="Báo cáo dựng sẵn: hệ thống tự tính từ đơn hàng, kho và giá vốn mỗi lần bạn mở, không cần ai soạn hay nhập liệu." />
      <div className="hsv-index">
        <div className="hsv-toolbar">
          <div className="flex w-full flex-wrap gap-1 border-b border-line-2 pb-1.5">
            {tabs.map((t) => (
              <Chip
                key={t.key}
                active={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
              >
                {t.label}
                <span className={cn("text-xs", tab === t.key ? "text-muted2" : "text-faint")}>{t.count}</span>
              </Chip>
            ))}
          </div>
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Tìm báo cáo"
            className="sm:max-w-[340px]"
          />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className={cn("hsv-thead grid items-center gap-3", LIST_COLS)}>
              {/* Ô giữ chỗ cho cột ngôi sao (chữ ẩn định vị tuyệt đối nên phải bọc trong một ô thật của lưới). */}
              <span>
                <span className="sr-only">Ghim</span>
              </span>
              <span>Tên</span>
              <span>Danh mục</span>
              <span>Xem lần cuối</span>
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={tab === "pinned" && !q ? Star : FileText}
                title={tab === "pinned" && !q ? "Chưa ghim báo cáo nào" : "Không có báo cáo phù hợp"}
                body={tab === "pinned" && !q ? "Bấm ngôi sao cạnh tên báo cáo để ghim lên đầu danh sách." : "Thử từ khóa khác hoặc chọn Tất cả."}
              />
            ) : (
              shown.map((r) => {
                const isPinned = pinned.includes(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => onOpen(r.id)}
                    className={cn("hsv-trow grid cursor-pointer items-center gap-3", LIST_COLS)}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(r.id);
                      }}
                      aria-pressed={isPinned}
                      aria-label={isPinned ? `Bỏ ghim ${r.name}` : `Ghim ${r.name}`}
                      title={isPinned ? "Bỏ ghim" : "Ghim lên đầu"}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-faint hover:bg-surface-active hover:text-ink"
                    >
                      <Star className={cn("h-4 w-4", isPinned && "fill-ink text-ink")} />
                    </button>
                    <span className="min-w-0">
                      {/* Liên kết thật: mở bằng bàn phím, Ctrl + bấm để mở tab mới. Bấm chỗ khác trên dòng cũng mở báo cáo. */}
                      <Link href={`/reports?r=${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-ink hover:underline">
                        {r.name}
                      </Link>
                      <span className="block truncate text-xs text-muted2">{r.description}</span>
                    </span>
                    <span className="text-muted2">{r.category}</span>
                    <span className="text-muted2">{viewedLabel(prefs?.viewed[r.id]) || "—"}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <Pager page={page} total={rows.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Một báo cáo

function ReportDetail({
  def,
  isAdmin,
  periodKey,
  group,
  onPeriod,
  pinned,
  onTogglePin,
  onBack,
}: {
  def: ReportDef;
  isAdmin: boolean;
  periodKey: PeriodKey;
  group?: Group;
  onPeriod: (p: PeriodKey, g?: Group) => void;
  pinned: boolean;
  onTogglePin: () => void;
  onBack: () => void;
}) {
  const period = useMemo(() => buildPeriod(periodKey, def.time === "series" ? group : undefined), [periodKey, group, def.time]);
  const data = useApi(() => def.run(period, { isAdmin }), [def, period, isAdmin]);
  const view = data.data;

  const exportCsv = () => {
    if (!view) return;
    const stamp = def.time === "none" ? toDateParam(new Date()) : `${period.fromDate}_${period.toDate}`;
    const rows: Cell[][] = view.totals ? [...view.rows, view.totals] : view.rows;
    downloadCsv(`${def.id}_${stamp}.csv`, view.columns.map((c) => c.label), rows);
  };

  return (
    <DetailPage
      title={def.name}
      parent="Báo cáo"
      backLabel="Quay lại danh sách báo cáo"
      onBack={onBack}
      meta={def.description}
      wide
      actions={
        <>
          <button type="button" onClick={onTogglePin} aria-pressed={pinned} className="hsv-btn-secondary">
            <Star className={cn("h-3.5 w-3.5", pinned && "fill-ink")} />
            {pinned ? "Đã ghim" : "Ghim"}
          </button>
          <button type="button" onClick={exportCsv} disabled={!view || data.loading || !!data.error} className="hsv-btn-secondary">
            <Download className="h-3.5 w-3.5" />
            Xuất CSV
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {def.time !== "none" && (
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <select
              value={periodKey}
              onChange={(e) => onPeriod(e.target.value as PeriodKey, group)}
              aria-label="Kỳ báo cáo"
              className="hsv-input w-auto pl-8 font-medium"
            >
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {def.time === "series" && (
          <select value={period.group} onChange={(e) => onPeriod(periodKey, e.target.value as Group)} aria-label="Nhóm theo" className="hsv-input w-auto">
            <option value="day">Theo ngày</option>
            <option value="month">Theo tháng</option>
          </select>
        )}
        <span className="text-xs text-muted2">{def.time === "none" ? "Số liệu hiện tại" : period.label}</span>
      </div>

      {data.error ? (
        // Tải kỳ mới bị lỗi thì không giữ số liệu của kỳ trước trên màn hình (dễ đọc nhầm kỳ).
        <ErrorBox error={data.error} onRetry={data.reload} />
      ) : !view ? (
        <>
          <Skeleton className="h-[74px]" />
          <Skeleton className="h-[300px]" />
          <Card flush>
            <LoadingRows rows={6} />
          </Card>
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity", data.loading && "opacity-60")} aria-busy={data.loading}>
          {view.summary && view.summary.length > 0 && <Summary items={view.summary} />}
          {view.chart && <ReportChart view={view} />}
          <ReportTable key={`${period.fromDate}|${period.toDate}|${period.group}`} view={view} chronological={def.time === "series"} />
          {view.note && (
            <p className="flex items-start gap-1.5 text-xs text-muted2">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              {view.note}
            </p>
          )}
        </div>
      )}
    </DetailPage>
  );
}

function Summary({ items }: { items: { label: string; value: string }[] }) {
  return (
    // Đường kẻ ngăn ô nằm ở mép trái / trên của từng ô, lề âm 1px giấu các đường sát mép thẻ → xuống dòng vẫn gọn.
    <section className="hsv-card overflow-hidden">
      <div className="-ml-px -mt-px flex flex-wrap">
        {items.map((s) => (
          <div key={s.label} className="min-w-[150px] flex-1 border-l border-t border-line-2 px-4 py-3">
            <p className="text-xs font-medium text-muted2">{s.label}</p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.01em] text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const SEGMENT_COLORS = [CHART.primary, CHART.secondary, CHART.tertiary];

function ReportChart({ view }: { view: ReportView }) {
  const c = view.chart!;
  if (c.type === "line")
    return (
      <Card title={c.label}>
        <LineChart
          series={[{ key: "v", label: c.label, color: CHART.primary, values: c.values }]}
          xLabels={view.xLabels ?? []}
          xTitles={view.xTitles}
          height={260}
          format={c.format}
          formatAxis={c.axis}
          label={c.label}
        />
      </Card>
    );
  if (c.type === "column")
    return (
      <Card title={c.label}>
        <ColumnChart values={c.values} xLabels={view.xLabels ?? []} xTitles={view.xTitles} height={240} format={c.format} label={c.label} />
      </Card>
    );
  if (c.type === "bars")
    return (
      <Card title={c.label}>
        {c.rows.length === 0 ? <p className="py-6 text-center text-[13px] text-muted2">Chưa có dữ liệu trong kỳ này.</p> : <BarList rows={c.rows} format={c.format} label={c.label} />}
      </Card>
    );
  return (
    <Card>
      <div className={cn("grid gap-6", c.groups.length > 1 && "sm:grid-cols-2")}>
        {c.groups.map((g) => (
          <div key={g.title}>
            <p className="hsv-card-title mb-3">{g.title}</p>
            <SegmentedBar label={g.title} format={c.format} parts={g.parts.map((p, i) => ({ ...p, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }))} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Bảng số liệu: dòng tổng ở đầu (như Shopify), bấm tiêu đề cột để sắp xếp, 50 dòng một trang. */
function ReportTable({ view, chronological }: { view: ReportView; chronological: boolean }) {
  const [sort, setSort] = useState<{ col: number; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const { columns, rows, totals } = view;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const indexed = rows.map((r, i) => ({ r, i }));
    indexed.sort((a, b) => {
      let c: number;
      // Cột "Kỳ" của báo cáo theo thời gian: sắp theo thứ tự thời gian, không theo chữ.
      if (chronological && sort.col === 0) c = a.i - b.i;
      else {
        const x = a.r[sort.col];
        const y = b.r[sort.col];
        // Ô trống luôn nằm cuối.
        if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
        c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "vi");
      }
      return sort.dir === "asc" ? c : -c;
    });
    return indexed.map((x) => x.r);
  }, [rows, sort, chronological]);
  const shown = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggle = (i: number) => {
    setPage(1);
    setSort((s) => (s?.col === i ? { col: i, dir: s.dir === "asc" ? "desc" : "asc" } : { col: i, dir: columns[i].align === "right" ? "desc" : "asc" }));
  };
  const show = (i: number, v: Cell) => columns[i].format?.(v) ?? (v == null ? "—" : String(v));
  const cell = "px-3 py-2 first:pl-4 last:pr-4";

  return (
    <>
      <section id="report-table" className="hsv-card scroll-mt-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line bg-surface text-xs font-medium text-[#4a4a4a]">
                {columns.map((c, i) => (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={sort?.col === i ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(cell, "whitespace-nowrap font-medium", c.align === "right" ? "text-right" : "text-left")}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn("inline-flex items-center gap-1 rounded hover:text-ink", c.align === "right" && "flex-row-reverse", sort?.col === i && "text-ink")}
                    >
                      {c.label}
                      {sort?.col === i && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {totals && rows.length > 0 && (
                <tr className="border-b border-line bg-surface-2 font-semibold text-ink">
                  {totals.map((v, i) => (
                    <td key={i} className={cn(cell, columns[i]?.align === "right" && "text-right")}>
                      {i === 0 ? v : v == null ? "" : show(i, v)}
                    </td>
                  ))}
                </tr>
              )}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <EmptyState icon={FileText} title="Không có dữ liệu" body="Kỳ này chưa có số liệu cho báo cáo. Thử chọn kỳ dài hơn." />
                  </td>
                </tr>
              ) : (
                shown.map((r, ri) => (
                  <tr key={ri} className="border-b border-line-2 transition-colors last:border-b-0 hover:bg-surface-2">
                    {r.map((v, i) => (
                      <td key={i} className={cn(cell, columns[i].align === "right" ? "text-right" : "max-w-[360px] truncate", i === 0 && "font-medium text-ink")}>
                        {show(i, v)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {rows.length > PAGE_SIZE && <Pager page={page} total={rows.length} pageSize={PAGE_SIZE} onChange={setPage} anchorId="report-table" />}
    </>
  );
}
