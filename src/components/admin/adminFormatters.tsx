import { Info, TrendingDown, TrendingUp } from 'lucide-react';

export function formatUsd(val: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatCompactUsd(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(val > 0 && val < 10 ? 2 : 0)}`;
}

export function formatCount(val: number): string {
  return new Intl.NumberFormat('en-US').format(val);
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Expired';
  const totalMin = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function DeltaBadge({
  deltaPct,
  periodLabel = 'vs prev period',
}: {
  deltaPct: number | null;
  periodLabel?: string;
}) {
  if (deltaPct === null) {
    return <span className="text-[11px] text-[#7E9288] tabular-nums">No prior baseline</span>;
  }
  const isPositive = deltaPct > 0;
  const isNegative = deltaPct < 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${
        isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-[#94A69C]'
      }`}
    >
      {isPositive && <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {isNegative && <TrendingDown className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>
        {isPositive ? `+${deltaPct.toFixed(1)}%` : `${deltaPct.toFixed(1)}%`} {periodLabel}
      </span>
    </span>
  );
}

export function AdminKpiCard({
  label,
  value,
  subtext,
  deltaPct,
  periodLabel,
  accent = false,
}: {
  label: string;
  value: string;
  subtext: string;
  deltaPct?: number | null;
  periodLabel?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`bg-[#0D1310] rounded-2xl border p-5 space-y-2 ${
        accent ? 'border-emerald-500/25' : 'border-white/[0.07]'
      }`}
    >
      <p className="text-xs font-medium text-[#94A69C]">{label}</p>
      <p
        className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${
          accent ? 'text-emerald-400' : 'text-[#ECF3EF]'
        }`}
      >
        {value}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] text-[#7E9288] tabular-nums">{subtext}</span>
        {deltaPct !== undefined && <DeltaBadge deltaPct={deltaPct} periodLabel={periodLabel} />}
      </div>
    </div>
  );
}

export function IntegrationNoticeBanner({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-[#090E0B] px-4 py-3.5 flex items-start gap-3">
      <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-0.5 text-xs">
        <p className="font-semibold text-[#ECF3EF]">{title}</p>
        <p className="text-[#94A69C] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
