import { useState } from 'react';
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
} from 'recharts';
import type { AdminDashboardSnapshot, AdminTimeSeriesPoint } from '../../types/video';
import {
  AdminKpiCard,
  IntegrationNoticeBanner,
  formatCompactUsd,
  formatCount,
  formatDateTime,
  formatUsd,
} from './adminFormatters';

type RangeKey = '7d' | '30d' | '90d' | '1y';

function RevenueTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.15] bg-[#0A100D] px-3.5 py-2.5 shadow-xl space-y-1 text-xs">
      <p className="font-display font-semibold text-[#ECF3EF]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="text-[#94A69C]">{entry.name}</span>
          <span className="font-mono font-semibold text-emerald-400 tabular-nums">
            {formatUsd(Number(entry.value || 0), 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function UsersTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ value: number }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.15] bg-[#0A100D] px-3.5 py-2 shadow-xl text-xs">
      <p className="font-display font-semibold text-[#ECF3EF]">{label}</p>
      <p className="text-[#94A69C] mt-0.5 tabular-nums">
        New users:{' '}
        <span className="font-mono font-semibold text-emerald-400">
          {formatCount(Number(payload[0]?.value || 0))}
        </span>
      </p>
    </div>
  );
}

export function AdminOverviewView({
  snapshot,
  onNavigate,
}: {
  snapshot: AdminDashboardSnapshot;
  onNavigate: (
    section:
      | 'analytics'
      | 'users'
      | 'revenue'
      | 'subscriptions'
      | 'transactions'
  ) => void;
}) {
  const [range, setRange] = useState<RangeKey>('30d');

  const activeSeries: AdminTimeSeriesPoint[] =
    range === '7d'
      ? snapshot.series.daily7
      : range === '30d'
        ? snapshot.series.daily30
        : range === '90d'
          ? snapshot.series.daily90
          : snapshot.series.monthly12;

  const { kpis } = snapshot;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">
            Dashboard Overview
          </h1>
          <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
            Live server revenue, user registrations, subscription activity, and recent transactions.
          </p>
        </div>
        <span className="text-xs text-[#7E9288] font-mono tabular-nums">
          Server active since {formatDateTime(snapshot.summary.serverStartedAt)}
        </span>
      </div>

      {!snapshot.integrations.databaseConnected && (
        <IntegrationNoticeBanner
          title="Live Session Telemetry Mode"
          description="All metrics below reflect real events recorded by the active Node.js server. External database, payment gateway, and ad-network webhooks are currently not connected, so totals reset when the server restarts."
        />
      )}

      {/* 6 Summary KPI Cards */}
      <section aria-label="Dashboard summary metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <AdminKpiCard
          label="Total Users"
          value={formatCount(kpis.totalUsers)}
          subtext={`${formatCount(kpis.newUsersToday)} registered today`}
          deltaPct={kpis.deltas.totalUsersPct}
          periodLabel="vs yesterday"
        />
        <AdminKpiCard
          label="Active Users"
          value={formatCount(kpis.activeUsersToday)}
          subtext={`${formatCount(kpis.activeUsersMonth)} monthly active`}
          deltaPct={kpis.deltas.activeUsersPct}
          periodLabel="vs yesterday"
        />
        <AdminKpiCard
          label="Total Revenue"
          value={formatUsd(kpis.totalRevenueUsd, 4)}
          subtext={`${formatUsd(snapshot.summary.revenue.advertisingTotalUsd, 4)} ads · ${formatUsd(snapshot.summary.revenue.subscriptionUsd, 2)} subs`}
          deltaPct={kpis.deltas.totalRevenuePct}
          periodLabel="vs prev 7d"
          accent
        />
        <AdminKpiCard
          label="Today's Revenue"
          value={formatUsd(kpis.todayRevenueUsd, 4)}
          subtext={`${formatUsd(kpis.weekRevenueUsd, 2)} this week`}
          deltaPct={kpis.deltas.todayRevenuePct}
          periodLabel="vs yesterday"
        />
        <AdminKpiCard
          label="Premium Subscribers"
          value={formatCount(kpis.premiumSubscribers)}
          subtext={`${formatCount(kpis.activeSubscriptions)} active accounts`}
          deltaPct={kpis.deltas.premiumSubscribersPct}
          periodLabel="vs yesterday"
        />
        <AdminKpiCard
          label="Total Transactions"
          value={formatCount(kpis.totalTransactions)}
          subtext={`Avg ${formatUsd(snapshot.summary.paymentStats.averageOrderValueUsd, 2)} order`}
          deltaPct={kpis.deltas.totalTransactionsPct}
          periodLabel="vs yesterday"
        />
      </section>

      {/* Revenue Graph + User Growth Graph */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">Revenue Graph</h2>
              <p className="text-xs text-[#7E9288]">
                Combined advertising and subscription earnings
              </p>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-[#090E0B] border border-white/[0.07] gap-1">
              {(
                [
                  { id: '7d', label: '7 days' },
                  { id: '30d', label: '30 days' },
                  { id: '90d', label: '90 days' },
                  { id: '1y', label: '1 year' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
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

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={activeSeries} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="overviewRevFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Tooltip content={<RevenueTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenueUsd"
                  name="Revenue"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#overviewRevFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="xl:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                User Growth Graph
              </h2>
              <p className="text-xs text-[#7E9288]">New user registrations over time</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              Analytics →
            </button>
          </div>

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={activeSeries} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
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
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#7E9288' }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip content={<UsersTooltip />} cursor={{ fill: 'rgba(16,185,129,0.06)' }} />
                <Bar
                  dataKey="newUsers"
                  name="New Users"
                  fill="#34D399"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Recent Transactions + Recent Users */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                Recent Transactions
              </h2>
              <p className="text-xs text-[#7E9288]">Latest premium plan activations</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              View all →
            </button>
          </div>

          {snapshot.transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#090E0B] px-4 py-8 text-center text-xs text-[#7E9288]">
              No payment transactions recorded yet. Transactions appear automatically when a user completes a subscription upgrade flow.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[#7E9288]">
                    <th className="py-2 pr-3 font-medium">Transaction ID</th>
                    <th className="py-2 pr-3 font-medium">User</th>
                    <th className="py-2 pr-3 font-medium text-right">Amount</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] tabular-nums">
                  {snapshot.transactions.slice(0, 6).map((txn) => (
                    <tr key={txn.id}>
                      <td className="py-2.5 pr-3 font-mono text-[#ECF3EF]">{txn.id}</td>
                      <td className="py-2.5 pr-3 text-[#C7D4CD]">{txn.userName}</td>
                      <td className="py-2.5 pr-3 font-mono text-right font-semibold text-emerald-400">
                        {formatUsd(txn.amountUsd, 2)}
                      </td>
                      <td className="py-2.5 pr-3 text-[#7E9288] whitespace-nowrap">
                        {formatDateTime(txn.date)}
                      </td>
                      <td className="py-2.5 text-right capitalize font-medium text-emerald-300">
                        {txn.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="xl:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">Recent Users</h2>
              <p className="text-xs text-[#7E9288]">Recently synced user profiles</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('users')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              Manage users →
            </button>
          </div>

          {snapshot.users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#090E0B] px-4 py-8 text-center text-xs text-[#7E9288]">
              No registered users yet. Users appear here once they sign in via the ClipLens profile drawer.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {snapshot.users.slice(0, 6).map((user) => (
                <div key={user.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#ECF3EF] truncate">{user.name}</p>
                    <p className="text-[11px] text-[#7E9288] truncate">{user.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-medium capitalize text-emerald-400">
                      {user.subscriptionPlan}
                    </p>
                    <p className="text-[11px] text-[#7E9288] tabular-nums">
                      {formatDateTime(user.registeredAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
