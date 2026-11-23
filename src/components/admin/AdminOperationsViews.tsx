import { useEffect, useState, type FormEvent } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Bell, CheckCircle2, Loader2, Save, Trash2 } from 'lucide-react';
import type { AdminAppConfig, AdminDashboardSnapshot } from '../../types/video';
import {
  AdminKpiCard,
  IntegrationNoticeBanner,
  formatCompactUsd,
  formatCount,
  formatDateTime,
  formatUsd,
} from './adminFormatters';

export function AdminAdvertisementsView({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const series =
    range === '7d'
      ? snapshot.series.daily7
      : range === '30d'
        ? snapshot.series.daily30
        : snapshot.series.daily90;

  const { kpis, summary } = snapshot;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">
            Advertisements
          </h1>
          <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
            Banner &amp; rewarded ad telemetry, completion performance, and ad-network status.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-[#090E0B] border border-white/[0.07] gap-1">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold uppercase transition-all ${
                range === r
                  ? 'bg-[#16221C] text-emerald-300 border border-emerald-500/30'
                  : 'text-[#899C92] hover:text-[#ECF3EF]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {!snapshot.integrations.adNetworkConnected && (
        <IntegrationNoticeBanner
          title="Google AdSense (Optional · Not Yet Connected)"
          description="Banner impressions and rewarded ad completions are tracked live by ClipLens. Add Google AdSense credentials whenever you are ready to display network ads and sync external click/CTR earnings."
        />
      )}

      <section aria-label="Advertisement metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          label="Total Ad Impressions"
          value={formatCount(kpis.adImpressions)}
          subtext={`${formatCount(summary.counts.bannerImpressions)} banner · ${formatCount(summary.counts.rewardedAdStarts)} rewarded`}
        />
        <AdminKpiCard
          label="Total Ad Clicks"
          value={kpis.adClicks !== null ? formatCount(kpis.adClicks) : 'Data not connected'}
          subtext="Requires external ad network SDK"
        />
        <AdminKpiCard
          label="CTR"
          value={kpis.adCtrPct !== null ? `${kpis.adCtrPct.toFixed(2)}%` : 'Data not connected'}
          subtext={`Rewarded completion: ${summary.userStats.adCompletionRatePct.toFixed(1)}%`}
        />
        <AdminKpiCard
          label="Ad Revenue"
          value={formatUsd(summary.revenue.advertisingTotalUsd, 4)}
          subtext={`Rewarded $${summary.rates.rewardedEcpmUsd} · Banner $${summary.rates.bannerEcpmUsd} eCPM`}
          accent
        />
      </section>

      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
            Ad Revenue Performance
          </h2>
          <p className="text-xs text-[#7E9288]">
            Estimated daily advertising revenue from completed rewarded views and banner impressions
          </p>
        </div>

        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
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
                cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                contentStyle={{
                  backgroundColor: '#0A100D',
                  borderColor: 'rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#ECF3EF',
                }}
              />
              <Bar dataKey="adRevenueUsd" name="Ad Revenue ($)" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export function AdminAppManagementView({
  snapshot,
  onSaveConfig,
}: {
  snapshot: AdminDashboardSnapshot;
  onSaveConfig: (next: Partial<AdminAppConfig>) => Promise<void>;
}) {
  const [form, setForm] = useState<AdminAppConfig>(snapshot.appConfig);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setForm(snapshot.appConfig);
  }, [snapshot.appConfig]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveConfig({
        maintenanceMode: form.maintenanceMode,
        appStatus: form.maintenanceMode ? 'maintenance' : form.appStatus,
        announcementEnabled: form.announcementEnabled,
        announcementMessage: form.announcementMessage,
        aiToolsEnabled: form.aiToolsEnabled,
        adGateEnabled: form.adGateEnabled,
        dailyFreeInspectLimit: form.dailyFreeInspectLimit,
      });
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">
          App Management
        </h1>
        <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
          Control ClipLens availability, public announcements, feature switches, and usage limits.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-6 max-w-3xl"
      >
        {/* Maintenance & Status */}
        <div className="space-y-4">
          <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
            Availability &amp; Status
          </h2>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#090E0B] p-4 cursor-pointer">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-[#ECF3EF]">Maintenance Mode</p>
              <p className="text-xs text-[#7E9288] mt-0.5">
                Pauses video, channel, and AI tool API endpoints with HTTP 503 for public users.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.maintenanceMode}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  maintenanceMode: e.target.checked,
                  appStatus: e.target.checked ? 'maintenance' : 'operational',
                }))
              }
              className="h-5 w-5 accent-emerald-500 rounded"
            />
          </label>

          <div className="space-y-1.5">
            <label htmlFor="cfg-status" className="block text-xs font-semibold text-[#C7D4CD]">
              Application Status
            </label>
            <select
              id="cfg-status"
              value={form.maintenanceMode ? 'maintenance' : form.appStatus}
              disabled={form.maintenanceMode}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  appStatus: e.target.value as AdminAppConfig['appStatus'],
                }))
              }
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 text-xs sm:text-sm text-[#ECF3EF] disabled:opacity-60 focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="operational">Operational</option>
              <option value="degraded">Degraded Performance</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        {/* Public Announcement */}
        <div className="space-y-4 pt-4 border-t border-white/[0.06]">
          <h2 className="font-display text-base font-semibold text-[#ECF3EF]">App Announcements</h2>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#090E0B] p-4 cursor-pointer">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-[#ECF3EF]">
                Show Public Announcement Banner
              </p>
              <p className="text-xs text-[#7E9288] mt-0.5">
                Displays a top notice inside the ClipLens workspace when enabled.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.announcementEnabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, announcementEnabled: e.target.checked }))
              }
              className="h-5 w-5 accent-emerald-500 rounded"
            />
          </label>

          <div className="space-y-1.5">
            <label htmlFor="cfg-announce" className="block text-xs font-semibold text-[#C7D4CD]">
              Announcement Message
            </label>
            <input
              id="cfg-announce"
              type="text"
              maxLength={280}
              value={form.announcementMessage}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, announcementMessage: e.target.value }))
              }
              placeholder="e.g., Scheduled maintenance tonight at 11 PM UTC."
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-xs sm:text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Feature Controls & Usage Limits */}
        <div className="space-y-4 pt-4 border-t border-white/[0.06]">
          <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
            Feature Controls &amp; Usage Limits
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#090E0B] p-3.5 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-[#ECF3EF]">AI Creator Tools</p>
                <p className="text-[11px] text-[#7E9288]">Enable Gemini-powered tools</p>
              </div>
              <input
                type="checkbox"
                checked={form.aiToolsEnabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, aiToolsEnabled: e.target.checked }))
                }
                className="h-4 w-4 accent-emerald-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#090E0B] p-3.5 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-[#ECF3EF]">Rewarded Ad Gate</p>
                <p className="text-[11px] text-[#7E9288]">Prompt free users before inspect</p>
              </div>
              <input
                type="checkbox"
                checked={form.adGateEnabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, adGateEnabled: e.target.checked }))
                }
                className="h-4 w-4 accent-emerald-500 rounded"
              />
            </label>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <label htmlFor="cfg-limit" className="block text-xs font-semibold text-[#C7D4CD]">
              Daily Free Inspect Limit
            </label>
            <input
              id="cfg-limit"
              type="number"
              min={1}
              max={500}
              value={form.dailyFreeInspectLimit}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  dailyFreeInspectLimit: Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                }))
              }
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 font-mono text-xs sm:text-sm text-[#ECF3EF] tabular-nums focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-[#7E9288] font-mono tabular-nums">
            Last saved: {formatDateTime(snapshot.appConfig.updatedAt)}
          </span>
          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Configuration saved
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 transition-all"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Save Configuration
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function AdminNotificationsView({
  snapshot,
  onCreateNotification,
  onToggleNotification,
  onDeleteNotification,
}: {
  snapshot: AdminDashboardSnapshot;
  onCreateNotification: (payload: {
    title: string;
    message: string;
    audience: 'all' | 'free' | 'premium';
  }) => Promise<void>;
  onToggleNotification: (id: string, active: boolean) => Promise<void>;
  onDeleteNotification: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'all' | 'free' | 'premium'>('all');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      await onCreateNotification({
        title: title.trim(),
        message: message.trim(),
        audience,
      });
      setTitle('');
      setMessage('');
      setAudience('all');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Notifications</h1>
        <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
          Publish targeted user notifications and manage active ClipLens notices.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Publish Notification
            </h2>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notif-title" className="block text-xs font-semibold text-[#C7D4CD]">
              Title
            </label>
            <input
              id="notif-title"
              type="text"
              maxLength={100}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New AI Hashtag Engine Live"
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-xs sm:text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notif-msg" className="block text-xs font-semibold text-[#C7D4CD]">
              Message
            </label>
            <textarea
              id="notif-msg"
              rows={3}
              maxLength={280}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a concise update for ClipLens users..."
              className="w-full rounded-xl border border-white/[0.09] bg-[#070B09] p-3 text-xs sm:text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notif-audience" className="block text-xs font-semibold text-[#C7D4CD]">
              Target Audience
            </label>
            <select
              id="notif-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as 'all' | 'free' | 'premium')}
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 text-xs sm:text-sm text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="all">All Users</option>
              <option value="free">Free Tier Users</option>
              <option value="premium">Premium Subscribers</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 transition-all"
          >
            {submitting ? 'Publishing...' : 'Send Notification'}
          </button>
        </form>

        <section className="lg:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Published Notifications
            </h2>
            <p className="text-xs text-[#7E9288]">
              Active notices are delivered via /api/public-config
            </p>
          </div>

          {snapshot.notifications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#090E0B] px-4 py-10 text-center text-xs text-[#7E9288]">
              No notifications created yet. Use the form on the left to publish an update.
            </div>
          ) : (
            <div className="space-y-3">
              {snapshot.notifications.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-white/[0.07] bg-[#090E0B] p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs sm:text-sm font-semibold text-[#ECF3EF]">{n.title}</p>
                      <span className="text-[11px] font-mono uppercase text-emerald-400">
                        {n.audience}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          n.active ? 'text-emerald-300' : 'text-[#7E9288]'
                        }`}
                      >
                        · {n.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-xs text-[#94A69C]">{n.message}</p>
                    <p className="text-[11px] text-[#7E9288] font-mono tabular-nums">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onToggleNotification(n.id, !n.active)}
                      className="min-h-[34px] rounded-lg border border-white/[0.09] bg-[#0D1310] px-2.5 text-[11px] font-semibold text-[#C7D4CD] hover:bg-[#141E19]"
                    >
                      {n.active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteNotification(n.id)}
                      aria-label={`Delete ${n.title}`}
                      className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-rose-500/25 bg-rose-950/30 text-rose-300 hover:bg-rose-950/60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
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
