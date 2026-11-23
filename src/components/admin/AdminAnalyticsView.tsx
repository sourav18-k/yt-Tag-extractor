import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from 'recharts';
import { Globe } from 'lucide-react';
import type { AdminDashboardSnapshot } from '../../types/video';
import { AdminKpiCard, IntegrationNoticeBanner, formatCount } from './adminFormatters';

type AnalyticsRange = '7d' | '30d' | '90d' | '1y';

export function AdminAnalyticsView({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const [range, setRange] = useState<AnalyticsRange>('30d');

  const series =
    range === '7d'
      ? snapshot.series.daily7
      : range === '30d'
        ? snapshot.series.daily30
        : range === '90d'
          ? snapshot.series.daily90
          : snapshot.series.monthly12;

  const totalInspectionsInRange = series.reduce((sum, item) => sum + item.inspections, 0);
  const { kpis } = snapshot;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Analytics</h1>
          <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
            User engagement, active user counts, tool adoption, and device distribution.
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

      {/* User & Retention Metrics */}
      <section aria-label="User analytics metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminKpiCard
          label="Total Registered Users"
          value={formatCount(kpis.totalUsers)}
          subtext="Synced ClipLens profiles"
        />
        <AdminKpiCard
          label="Daily Active Users (DAU)"
          value={formatCount(kpis.activeUsersToday)}
          subtext="Active in the last 24 hours"
          accent
        />
        <AdminKpiCard
          label="Monthly Active Users (MAU)"
          value={formatCount(kpis.activeUsersMonth)}
          subtext="Active in the last 30 days"
        />
        <AdminKpiCard
          label="New Users Today"
          value={formatCount(kpis.newUsersToday)}
          subtext="First-time registrations today"
        />
        <AdminKpiCard
          label="Returning Users"
          value={formatCount(kpis.returningUsers)}
          subtext="Active across multiple sessions"
        />
        <AdminKpiCard
          label="User Retention"
          value="Data not connected"
          subtext="Requires persistent user cohort database"
        />
      </section>

      {/* Activity Trend + Feature Usage */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-6 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                Inspection Activity Trend
              </h2>
              <p className="text-xs text-[#7E9288]">
                {formatCount(totalInspectionsInRange)} inspections in selected window
              </p>
            </div>
          </div>

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="analyticsInspFill" x1="0" y1="0" x2="0" y2="1">
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
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#7E9288' }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
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
                <Area
                  type="monotone"
                  dataKey="inspections"
                  name="Inspections"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#analyticsInspFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="xl:col-span-6 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">Feature Usage</h2>
            <p className="text-xs text-[#7E9288]">
              Live request counts per ClipLens tool &amp; analyzer endpoint
            </p>
          </div>

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={snapshot.featureUsage}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#7E9288' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="feature"
                  width={132}
                  tick={{ fontSize: 11, fill: '#C7D4CD' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                  contentStyle={{
                    backgroundColor: '#0A100D',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#ECF3EF',
                  }}
                />
                <Bar dataKey="count" name="Requests" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Device Statistics + Geographic Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Device Statistics
            </h2>
            <p className="text-xs text-[#7E9288]">Detected from live API request User-Agent headers</p>
          </div>

          <div className="space-y-3">
            {(() => {
              const totalDevices = snapshot.deviceBreakdown.reduce((acc, d) => acc + d.count, 0);
              return snapshot.deviceBreakdown.map((item) => {
                const pct = totalDevices > 0 ? Math.round((item.count / totalDevices) * 100) : 0;
                return (
                  <div key={item.device} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#ECF3EF]">{item.device}</span>
                      <span className="font-mono text-[#94A69C] tabular-nums">
                        {formatCount(item.count)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#090E0B] overflow-hidden border border-white/[0.05]">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>

        <section className="lg:col-span-6 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Globe className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                Geographic Statistics
              </h2>
              <p className="text-xs text-[#7E9288]">Regional user &amp; traffic breakdown</p>
            </div>
          </div>

          <IntegrationNoticeBanner
            title="GeoIP Service: Data not connected"
            description="No GeoIP database or edge geolocation header integration (such as MaxMind GeoLite2 or Cloudflare CF-IPCountry) is configured on this server. Connect a GeoIP provider to populate country and region charts."
          />
        </section>
      </div>
    </div>
  );
}
