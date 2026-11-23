import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { AdminDashboardSnapshot } from '../../types/video';
import {
  AdminKpiCard,
  IntegrationNoticeBanner,
  formatCompactUsd,
  formatCount,
  formatUsd,
} from './adminFormatters';

type RevenueRange = '7d' | '30d' | '90d' | '1y';

interface ProjectionRow {
  month: string;
  rewardedAds: number;
  bannerAds: number;
  subscriptions: number;
  totalNet: number;
}

function ForecastChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((acc, item) => acc + Number(item.value || 0), 0);
  return (
    <div className="rounded-xl border border-white/[0.15] bg-[#0A100D] px-3.5 py-2.5 shadow-xl space-y-1.5 text-xs">
      <p className="font-display font-semibold text-[#ECF3EF]">{label} Net Forecast</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-5">
            <span className="inline-flex items-center gap-1.5 text-[#94A69C]">
              <span
                className="h-2 w-2 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              {entry.name}
            </span>
            <span className="font-mono font-medium text-[#ECF3EF] tabular-nums">
              {formatUsd(entry.value, 0)}
            </span>
          </div>
        ))}
      </div>
      <div className="pt-1 border-t border-white/[0.08] flex items-center justify-between gap-5 font-semibold text-emerald-400">
        <span>Total Net</span>
        <span className="font-mono tabular-nums">{formatUsd(total, 0)}</span>
      </div>
    </div>
  );
}

export function AdminRevenueView({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const [range, setRange] = useState<RevenueRange>('30d');

  // Interactive 12-Month Estimator state (preserved from original Admin Console)
  const [dau, setDau] = useState(2500);
  const [inspectionsPerUser, setInspectionsPerUser] = useState(3);
  const [rewardedEcpm, setRewardedEcpm] = useState(18);
  const [bannerEcpm, setBannerEcpm] = useState(1.8);
  const [premiumConversionPct, setPremiumConversionPct] = useState(3.5);
  const [storeFeePct, setStoreFeePct] = useState<0 | 15 | 30>(15);

  const series =
    range === '7d'
      ? snapshot.series.daily7
      : range === '30d'
        ? snapshot.series.daily30
        : range === '90d'
          ? snapshot.series.daily90
          : snapshot.series.monthly12;

  const forecast = useMemo(() => {
    const netFactor = 1 - storeFeePct / 100;
    const convRate = premiumConversionPct / 100;

    const freeDau = dau * (1 - convRate);
    const paidUsers = Math.round(dau * convRate);

    const monthlyRewardedImpr = freeDau * inspectionsPerUser * 30;
    const monthlyBannerImpr = freeDau * 2.2 * 30;

    const grossRewardedM1 = (monthlyRewardedImpr / 1000) * rewardedEcpm;
    const grossBannerM1 = (monthlyBannerImpr / 1000) * bannerEcpm;

    const blendedSubMonthly = 0.7 * 4.99 + 0.3 * (39.99 / 12);
    const grossSubsM1 = paidUsers * blendedSubMonthly;

    const netRewardedM1 = grossRewardedM1 * netFactor;
    const netBannerM1 = grossBannerM1 * netFactor;
    const netSubsM1 = grossSubsM1 * netFactor;
    const monthlyNet = netRewardedM1 + netBannerM1 + netSubsM1;
    const dailyNet = monthlyNet / 30;
    const arpuMonthly = dau > 0 ? monthlyNet / dau : 0;

    const projection: ProjectionRow[] = [];
    let retainedSubs = 0;
    let annualNetSum = 0;

    for (let m = 1; m <= 12; m++) {
      const growthMult = Math.pow(1.08, m - 1);
      const activeDau = dau * growthMult;
      const activeFree = activeDau * (1 - convRate);
      const newPaid = activeDau * convRate * 0.45;
      retainedSubs = m === 1 ? activeDau * convRate : retainedSubs * 0.85 + newPaid;

      const rNet = ((activeFree * inspectionsPerUser * 30) / 1000) * rewardedEcpm * netFactor;
      const bNet = ((activeFree * 2.2 * 30) / 1000) * bannerEcpm * netFactor;
      const sNet = retainedSubs * blendedSubMonthly * netFactor;
      const tNet = rNet + bNet + sNet;
      annualNetSum += tNet;

      projection.push({
        month: `M${m}`,
        rewardedAds: Math.round(rNet),
        bannerAds: Math.round(bNet),
        subscriptions: Math.round(sNet),
        totalNet: Math.round(tNet),
      });
    }

    return {
      paidUsers,
      grossRewardedM1,
      grossBannerM1,
      grossSubsM1,
      netRewardedM1,
      netBannerM1,
      netSubsM1,
      monthlyNet,
      dailyNet,
      annualNetSum,
      arpuMonthly,
      projection,
    };
  }, [dau, inspectionsPerUser, rewardedEcpm, bannerEcpm, premiumConversionPct, storeFeePct]);

  const { kpis, summary } = snapshot;
  const totalM1Gross = forecast.grossRewardedM1 + forecast.grossBannerM1 + forecast.grossSubsM1;
  const refundedTxns = snapshot.transactions.filter((t) => t.status === 'refunded');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Revenue</h1>
          <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
            Period breakdown, advertising vs subscription revenue streams, payment stats, and forecast modeling.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-[#090E0B] border border-white/[0.07] gap-1">
          {(
            [
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: '90d', label: '90D' },
              { id: '1y', label: '1Y' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRange(opt.id)}
              className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
                range === opt.id
                  ? 'bg-[#16221C] text-emerald-300 border border-emerald-500/30'
                  : 'text-[#899C92] hover:text-[#ECF3EF]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 8 Revenue Breakdown KPI Cards */}
      <section aria-label="Revenue breakdown metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AdminKpiCard
          label="Total Revenue"
          value={formatUsd(kpis.totalRevenueUsd, 4)}
          subtext="Cumulative tracked server earnings"
          accent
        />
        <AdminKpiCard
          label="Today's Revenue"
          value={formatUsd(kpis.todayRevenueUsd, 4)}
          subtext="Since midnight UTC"
        />
        <AdminKpiCard
          label="This Week's Revenue"
          value={formatUsd(kpis.weekRevenueUsd, 4)}
          subtext="Rolling 7-day total"
        />
        <AdminKpiCard
          label="This Month's Revenue"
          value={formatUsd(kpis.monthRevenueUsd, 4)}
          subtext="Rolling 30-day total"
        />
        <AdminKpiCard
          label="This Year's Revenue"
          value={formatUsd(kpis.yearRevenueUsd, 4)}
          subtext="Current calendar year"
        />
        <AdminKpiCard
          label="Advertising Revenue"
          value={formatUsd(summary.revenue.advertisingTotalUsd, 4)}
          subtext={`${formatUsd(summary.revenue.rewardedAdUsd, 4)} rewarded · ${formatUsd(summary.revenue.bannerAdUsd, 4)} banner`}
        />
        <AdminKpiCard
          label="Subscription Revenue"
          value={formatUsd(summary.revenue.subscriptionUsd, 2)}
          subtext={`MRR run-rate ${formatUsd(summary.revenue.monthlyRecurringRunRateUsd, 2)}`}
        />
        <AdminKpiCard
          label="Other Revenue"
          value={formatUsd(kpis.otherRevenueUsd, 2)}
          subtext="Affiliate & miscellaneous streams"
        />
      </section>

      {/* Revenue Stream Trend + Monthly Comparison / Payment & Refund Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Revenue Breakdown Over Time
            </h2>
            <p className="text-xs text-[#7E9288]">
              Advertising vs subscription revenue in selected window
            </p>
          </div>

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#7E9288' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={18}
                />
                <YAxis
                  tickFormatter={formatCompactUsd}
                  tick={{ fontSize: 11, fill: '#7E9288' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A100D',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#ECF3EF',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#94A69C' }} />
                <Area
                  type="monotone"
                  dataKey="adRevenueUsd"
                  name="Ad Revenue"
                  stackId="1"
                  stroke="#34D399"
                  fill="rgba(52,211,153,0.22)"
                />
                <Area
                  type="monotone"
                  dataKey="subscriptionRevenueUsd"
                  name="Subscriptions"
                  stackId="1"
                  stroke="#10B981"
                  fill="rgba(16,185,129,0.4)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="xl:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Payment &amp; Refund Statistics
            </h2>
            <p className="text-xs text-[#7E9288]">
              Order metrics and payment gateway settlement status
            </p>
          </div>

          <dl className="divide-y divide-white/[0.06] text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-[#94A69C]">Total Payment Transactions</dt>
              <dd className="font-mono font-semibold text-[#ECF3EF] tabular-nums">
                {formatCount(summary.paymentStats.totalTransactions)}
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-[#94A69C]">Average Order Value</dt>
              <dd className="font-mono font-semibold text-emerald-400 tabular-nums">
                {formatUsd(summary.paymentStats.averageOrderValueUsd, 2)}
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-[#94A69C]">Monthly Plan Revenue</dt>
              <dd className="font-mono font-semibold text-[#ECF3EF] tabular-nums">
                {formatUsd(summary.paymentStats.monthlyPlanRevenueUsd, 2)}
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-[#94A69C]">Annual Plan Revenue</dt>
              <dd className="font-mono font-semibold text-[#ECF3EF] tabular-nums">
                {formatUsd(summary.paymentStats.annualPlanRevenueUsd, 2)}
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-[#94A69C]">Refunds Processed</dt>
              <dd className="font-mono font-semibold text-[#ECF3EF] tabular-nums">
                {snapshot.integrations.paymentGatewayConnected
                  ? formatCount(refundedTxns.length)
                  : 'Data not connected'}
              </dd>
            </div>
          </dl>

          {!snapshot.integrations.paymentGatewayConnected && (
            <IntegrationNoticeBanner
              title="Payment Gateway: Data not connected"
              description="Connect Stripe or Google Play Billing webhooks to track settled payouts, chargebacks, and live refund events."
            />
          )}
        </section>
      </div>

      {/* Monthly Comparison Table */}
      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#ECF3EF]">Monthly Comparison</h2>
          <p className="text-xs text-[#7E9288]">Last 6 months of tracked advertising &amp; subscription totals</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#7E9288]">
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 pr-3 font-medium text-right">Advertising</th>
                <th className="py-2 pr-3 font-medium text-right">Subscriptions</th>
                <th className="py-2 pr-3 font-medium text-right">Total Revenue</th>
                <th className="py-2 font-medium text-right">Inspections</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] tabular-nums">
              {snapshot.series.monthly12.slice(-6).map((row) => (
                <tr key={row.label}>
                  <td className="py-2.5 pr-3 font-medium text-[#ECF3EF]">{row.label}</td>
                  <td className="py-2.5 pr-3 font-mono text-right text-[#C7D4CD]">
                    {formatUsd(row.adRevenueUsd, 4)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-right text-[#C7D4CD]">
                    {formatUsd(row.subscriptionRevenueUsd, 2)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-right font-semibold text-emerald-400">
                    {formatUsd(row.revenueUsd, 4)}
                  </td>
                  <td className="py-2.5 font-mono text-right text-[#94A69C]">
                    {formatCount(row.inspections)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Preserved Revenue Estimator + 12-Month Net Revenue Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="font-display text-base sm:text-lg font-semibold text-[#ECF3EF]">
              Revenue Estimator
            </h2>
            <p className="text-xs text-[#7E9288] mt-0.5">
              Adjust traffic, ad rates, and conversion assumptions to forecast net earnings.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="sim-dau" className="font-medium text-[#C7D4CD]">
                  Daily Active Users (DAU)
                </label>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                  {formatCount(dau)}
                </span>
              </div>
              <input
                id="sim-dau"
                type="range"
                min={100}
                max={50000}
                step={100}
                value={dau}
                onChange={(e) => setDau(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="sim-insp" className="font-medium text-[#C7D4CD]">
                  Inspections per Free User / Day
                </label>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                  {inspectionsPerUser}
                </span>
              </div>
              <input
                id="sim-insp"
                type="range"
                min={1}
                max={10}
                step={1}
                value={inspectionsPerUser}
                onChange={(e) => setInspectionsPerUser(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="sim-recpm" className="block text-xs font-medium text-[#C7D4CD]">
                  Rewarded eCPM ($)
                </label>
                <input
                  id="sim-recpm"
                  type="number"
                  min={1}
                  max={60}
                  step={0.5}
                  value={rewardedEcpm}
                  onChange={(e) => setRewardedEcpm(Math.max(0, Number(e.target.value)))}
                  className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 font-mono text-xs text-[#ECF3EF] tabular-nums focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sim-becpm" className="block text-xs font-medium text-[#C7D4CD]">
                  Banner eCPM ($)
                </label>
                <input
                  id="sim-becpm"
                  type="number"
                  min={0.1}
                  max={15}
                  step={0.1}
                  value={bannerEcpm}
                  onChange={(e) => setBannerEcpm(Math.max(0, Number(e.target.value)))}
                  className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 font-mono text-xs text-[#ECF3EF] tabular-nums focus:border-emerald-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="sim-conv" className="font-medium text-[#C7D4CD]">
                  Premium Conversion Rate
                </label>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                  {premiumConversionPct.toFixed(1)}% ({formatCount(forecast.paidUsers)} paid)
                </span>
              </div>
              <input
                id="sim-conv"
                type="range"
                min={0.5}
                max={15}
                step={0.5}
                value={premiumConversionPct}
                onChange={(e) => setPremiumConversionPct(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[#C7D4CD]">
                App Store / Payment Fee
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#090E0B] border border-white/[0.07] rounded-xl">
                {([0, 15, 30] as const).map((fee) => (
                  <button
                    key={fee}
                    type="button"
                    onClick={() => setStoreFeePct(fee)}
                    className={`min-h-[36px] rounded-lg text-xs font-semibold transition-all duration-200 tabular-nums ${
                      storeFeePct === fee
                        ? 'bg-[#16221C] text-emerald-300 border border-emerald-500/30'
                        : 'text-[#899C92] hover:text-[#ECF3EF]'
                    }`}
                  >
                    {fee === 0 ? '0% Web' : `${fee}% Store`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06] grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[11px] text-[#7E9288]">Est. Daily Net</p>
              <p className="font-mono text-sm font-bold text-[#ECF3EF] tabular-nums mt-0.5">
                {formatUsd(forecast.dailyNet, 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#7E9288]">Monthly Net</p>
              <p className="font-mono text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
                {formatUsd(forecast.monthlyNet, 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#7E9288]">Year 1 Net</p>
              <p className="font-mono text-sm font-bold text-[#ECF3EF] tabular-nums mt-0.5">
                {formatUsd(forecast.annualNetSum, 0)}
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-[#ECF3EF]">
                12-Month Net Revenue Forecast
              </h2>
              <p className="text-xs text-[#7E9288] mt-0.5">
                Models 8% monthly DAU growth and 85% monthly subscriber retention
              </p>
            </div>
            <span className="font-mono text-xs font-medium text-emerald-400 tabular-nums">
              ARPU: {formatUsd(forecast.arpuMonthly, 2)}/user/mo
            </span>
          </div>

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={forecast.projection} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#7E9288' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatCompactUsd}
                  tick={{ fontSize: 11, fill: '#7E9288' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  content={<ForecastChartTooltip />}
                  cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px', color: '#94A69C' }} />
                <Bar dataKey="rewardedAds" name="Rewarded Ads" stackId="rev" fill="#10B981" />
                <Bar dataKey="bannerAds" name="Banner Ads" stackId="rev" fill="#2B4036" />
                <Bar
                  dataKey="subscriptions"
                  name="Premium Plans"
                  stackId="rev"
                  fill="#6EE7B7"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto pt-2 border-t border-white/[0.06]">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/[0.08] text-[#7E9288]">
                  <th className="py-2 font-medium">Month 1 Stream</th>
                  <th className="py-2 font-medium text-right">Gross</th>
                  <th className="py-2 font-medium text-right">Net ({100 - storeFeePct}%)</th>
                  <th className="py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] tabular-nums">
                <tr>
                  <td className="py-2.5 font-medium text-[#ECF3EF]">Rewarded Video Ads</td>
                  <td className="py-2.5 font-mono text-right text-[#94A69C]">
                    {formatUsd(forecast.grossRewardedM1)}
                  </td>
                  <td className="py-2.5 font-mono text-right font-semibold text-emerald-400">
                    {formatUsd(forecast.netRewardedM1)}
                  </td>
                  <td className="py-2.5 font-mono text-right text-[#94A69C]">
                    {totalM1Gross > 0
                      ? `${((forecast.grossRewardedM1 / totalM1Gross) * 100).toFixed(1)}%`
                      : '0%'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-[#ECF3EF]">Inline Banner Ads</td>
                  <td className="py-2.5 font-mono text-right text-[#94A69C]">
                    {formatUsd(forecast.grossBannerM1)}
                  </td>
                  <td className="py-2.5 font-mono text-right font-semibold text-emerald-400">
                    {formatUsd(forecast.netBannerM1)}
                  </td>
                  <td className="py-2.5 font-mono text-right text-[#94A69C]">
                    {totalM1Gross > 0
                      ? `${((forecast.grossBannerM1 / totalM1Gross) * 100).toFixed(1)}%`
                      : '0%'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-[#ECF3EF]">Premium Subscriptions</td>
                  <td className="py-2.5 font-mono text-right text-[#94A69C]">
                    {formatUsd(forecast.grossSubsM1)}
                  </td>
                  <td className="py-2.5 font-mono text-right font-semibold text-emerald-400">
                    {formatUsd(forecast.netSubsM1)}
                  </td>
                  <td className="py-2.5 font-mono text-right text-[#94A69C]">
                    {totalM1Gross > 0
                      ? `${((forecast.grossSubsM1 / totalM1Gross) * 100).toFixed(1)}%`
                      : '0%'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
