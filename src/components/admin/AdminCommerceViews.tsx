import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type {
  AdminDashboardSnapshot,
  AdminTransactionRecord,
  AdminUserRecord,
} from '../../types/video';
import {
  AdminKpiCard,
  IntegrationNoticeBanner,
  formatCount,
  formatDateTime,
  formatUsd,
} from './adminFormatters';

export function AdminSubscriptionsView({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'cancelled'>(
    'all'
  );
  const [selectedSubscriber, setSelectedSubscriber] = useState<AdminUserRecord | null>(null);

  const premiumUsers = useMemo(
    () =>
      snapshot.users.filter(
        (u) => u.subscriptionPlan === 'monthly' || u.subscriptionPlan === 'annual'
      ),
    [snapshot.users]
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return premiumUsers;
    return premiumUsers.filter((u) => u.subscriptionStatus === statusFilter);
  }, [premiumUsers, statusFilter]);

  const { kpis, summary } = snapshot;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Subscriptions</h1>
        <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
          Track monthly and annual ClipLens Premium activations and subscriber lifecycle status.
        </p>
      </div>

      {/* 6 Subscription KPI Cards */}
      <section aria-label="Subscription metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminKpiCard
          label="Total Premium Users"
          value={formatCount(kpis.premiumSubscribers)}
          subtext="Monthly + annual plan activations"
          accent
        />
        <AdminKpiCard
          label="Active Subscriptions"
          value={formatCount(kpis.activeSubscriptions)}
          subtext="Currently active premium profiles"
        />
        <AdminKpiCard
          label="Expired Subscriptions"
          value={formatCount(kpis.expiredSubscriptions)}
          subtext="Elapsed billing cycles"
        />
        <AdminKpiCard
          label="Cancelled Subscriptions"
          value={formatCount(kpis.cancelledSubscriptions)}
          subtext="User-cancelled renewals"
        />
        <AdminKpiCard
          label="Monthly Subscriptions"
          value={formatCount(summary.userStats.monthlySubscribers)}
          subtext={`$${summary.rates.monthlyPriceUsd.toFixed(2)}/mo tier`}
        />
        <AdminKpiCard
          label="Yearly Subscriptions"
          value={formatCount(summary.userStats.annualSubscribers)}
          subtext={`$${summary.rates.annualPriceUsd.toFixed(2)}/yr tier`}
        />
      </section>

      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Subscriber Directory
            </h2>
            <p className="text-xs text-[#7E9288]">
              Signed-in profiles that activated a ClipLens Premium plan
            </p>
          </div>
          <select
            aria-label="Filter subscriptions by status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'active' | 'expired' | 'cancelled')
            }
            className="min-h-[38px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 text-xs font-medium text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#090E0B] px-4 py-10 text-center text-xs text-[#7E9288]">
            No signed-in subscriber profiles match this filter. Guest upgrades are counted in the summary cards above and logged in Transactions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/[0.08] text-[#7E9288]">
                  <th className="py-2.5 pr-3 font-medium">Subscriber</th>
                  <th className="py-2.5 pr-3 font-medium">Plan</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 pr-3 font-medium">Last Active</th>
                  <th className="py-2.5 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-[#101814] transition-colors">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-[#ECF3EF]">{user.name}</p>
                      <p className="text-[11px] text-[#7E9288]">{user.email}</p>
                    </td>
                    <td className="py-3 pr-3 capitalize text-[#C7D4CD]">{user.subscriptionPlan}</td>
                    <td className="py-3 pr-3 capitalize font-semibold text-emerald-400">
                      {user.subscriptionStatus}
                    </td>
                    <td className="py-3 pr-3 text-[#7E9288] tabular-nums">
                      {formatDateTime(user.lastActiveAt)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedSubscriber(user)}
                        className="min-h-[32px] rounded-lg border border-white/[0.09] bg-[#090E0B] px-2.5 text-[11px] font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-emerald-300"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedSubscriber && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sub-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md bg-[#0D1310] rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <h2 id="sub-detail-title" className="font-display text-base font-bold text-[#ECF3EF]">
                Subscription Details
              </h2>
              <button
                type="button"
                onClick={() => setSelectedSubscriber(null)}
                aria-label="Close subscription details"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-xl text-[#7E9288] hover:text-[#ECF3EF] hover:bg-[#141E19]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <dl className="p-5 space-y-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Subscriber</dt>
                <dd className="font-semibold text-[#ECF3EF]">{selectedSubscriber.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Email</dt>
                <dd className="text-[#C7D4CD]">{selectedSubscriber.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Plan</dt>
                <dd className="capitalize font-semibold text-emerald-400">
                  {selectedSubscriber.subscriptionPlan}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Status</dt>
                <dd className="capitalize text-[#ECF3EF]">
                  {selectedSubscriber.subscriptionStatus}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Registered</dt>
                <dd className="font-mono text-[#94A69C] tabular-nums">
                  {formatDateTime(selectedSubscriber.registeredAt)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

export function AdminTransactionsView({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded' | 'failed'>(
    'all'
  );
  const [planFilter, setPlanFilter] = useState<'all' | 'monthly' | 'annual'>('all');
  const [page, setPage] = useState(1);
  const [selectedTxn, setSelectedTxn] = useState<AdminTransactionRecord | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.transactions.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (planFilter !== 'all' && t.plan !== planFilter) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.userId.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q)
      );
    });
  }, [snapshot.transactions, query, statusFilter, planFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Transactions</h1>
        <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
          Searchable ledger of subscription purchases and payment status records.
        </p>
      </div>

      {!snapshot.integrations.paymentGatewayConnected && (
        <IntegrationNoticeBanner
          title="Live Payment Gateway: Data not connected"
          description="Rows below represent in-app subscription upgrade activations tracked by ClipLens. Connect Stripe or Play Billing webhooks to capture external card/wallet settlement receipts."
        />
      )}

      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7E9288]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Transaction ID, User ID, or User Name..."
              aria-label="Search transactions"
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] pl-10 pr-3.5 text-xs sm:text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by transaction status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'completed' | 'refunded' | 'failed');
                setPage(1);
              }}
              className="min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 text-xs font-medium text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>

            <select
              aria-label="Filter by plan"
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value as 'all' | 'monthly' | 'annual');
                setPage(1);
              }}
              className="min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 text-xs font-medium text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="all">All Plans</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>

        {paginated.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#090E0B] px-4 py-10 text-center text-xs text-[#7E9288]">
            No transactions match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/[0.08] text-[#7E9288]">
                  <th className="py-2.5 pr-3 font-medium">Transaction ID</th>
                  <th className="py-2.5 pr-3 font-medium">User ID</th>
                  <th className="py-2.5 pr-3 font-medium">User Name</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Amount</th>
                  <th className="py-2.5 pr-3 font-medium">Payment Method</th>
                  <th className="py-2.5 pr-3 font-medium">Date</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] tabular-nums">
                {paginated.map((txn) => (
                  <tr key={txn.id} className="hover:bg-[#101814] transition-colors">
                    <td className="py-3 pr-3 font-mono text-[#ECF3EF]">{txn.id}</td>
                    <td className="py-3 pr-3 font-mono text-[#94A69C]">{txn.userId}</td>
                    <td className="py-3 pr-3 text-[#ECF3EF]">{txn.userName}</td>
                    <td className="py-3 pr-3 font-mono text-right font-semibold text-emerald-400">
                      {formatUsd(txn.amountUsd, 2)}
                    </td>
                    <td className="py-3 pr-3 text-[#94A69C]">{txn.paymentMethod}</td>
                    <td className="py-3 pr-3 text-[#7E9288] whitespace-nowrap">
                      {formatDateTime(txn.date)}
                    </td>
                    <td className="py-3 pr-3 capitalize font-semibold text-emerald-300">
                      {txn.status}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedTxn(txn)}
                        className="min-h-[32px] rounded-lg border border-white/[0.09] bg-[#090E0B] px-2.5 text-[11px] font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-emerald-300"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#94A69C]">
          <span className="tabular-nums">
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {formatCount(filtered.length)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-white/[0.09] bg-[#090E0B] disabled:opacity-40 hover:bg-[#141E19]"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="px-2 font-mono tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-white/[0.09] bg-[#090E0B] disabled:opacity-40 hover:bg-[#141E19]"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {selectedTxn && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="txn-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md bg-[#0D1310] rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <h2 id="txn-detail-title" className="font-display text-base font-bold text-[#ECF3EF]">
                Transaction Details
              </h2>
              <button
                type="button"
                onClick={() => setSelectedTxn(null)}
                aria-label="Close transaction details"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-xl text-[#7E9288] hover:text-[#ECF3EF] hover:bg-[#141E19]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <dl className="p-5 space-y-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Transaction ID</dt>
                <dd className="font-mono text-[#ECF3EF]">{selectedTxn.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">User</dt>
                <dd className="text-[#ECF3EF]">
                  {selectedTxn.userName} ({selectedTxn.userId})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Plan</dt>
                <dd className="capitalize text-[#C7D4CD]">{selectedTxn.plan}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Amount</dt>
                <dd className="font-mono font-semibold text-emerald-400">
                  {formatUsd(selectedTxn.amountUsd, 2)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Payment Method</dt>
                <dd className="text-[#C7D4CD]">{selectedTxn.paymentMethod}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Date</dt>
                <dd className="font-mono text-[#94A69C] tabular-nums">
                  {formatDateTime(selectedTxn.date)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7E9288]">Status</dt>
                <dd className="capitalize font-semibold text-emerald-400">{selectedTxn.status}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
