import { useMemo, useState } from 'react';
import { Search, ShieldBan, ShieldCheck, X } from 'lucide-react';
import type { AdminDashboardSnapshot, AdminUserRecord } from '../../types/video';
import { formatCount, formatDateTime, formatShortDate } from './adminFormatters';

export function AdminUsersView({
  snapshot,
  onToggleUserStatus,
}: {
  snapshot: AdminDashboardSnapshot;
  onToggleUserStatus: (userId: string, status: 'active' | 'suspended') => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'monthly' | 'annual'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (planFilter !== 'all' && u.subscriptionPlan !== planFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    });
  }, [snapshot.users, query, statusFilter, planFilter]);

  const selectedUser: AdminUserRecord | null = useMemo(
    () => snapshot.users.find((u) => u.id === selectedUserId) ?? null,
    [snapshot.users, selectedUserId]
  );

  const handleStatusChange = async (user: AdminUserRecord) => {
    setUpdatingId(user.id);
    try {
      await onToggleUserStatus(user.id, user.status === 'active' ? 'suspended' : 'active');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Users</h1>
        <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
          Inspect synced user profiles, subscription plans, activity history, and account status.
        </p>
      </div>

      {/* Search & Filters */}
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users by name, email, or ID..."
              aria-label="Search users"
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] pl-10 pr-3.5 text-xs sm:text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by account status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
              className="min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 text-xs font-medium text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>

            <select
              aria-label="Filter by plan"
              value={planFilter}
              onChange={(e) =>
                setPlanFilter(e.target.value as 'all' | 'free' | 'monthly' | 'annual')
              }
              className="min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3 text-xs font-medium text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        {filteredUsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#090E0B] px-4 py-10 text-center text-xs text-[#7E9288]">
            {snapshot.users.length === 0
              ? 'No users registered in this session yet. Profiles appear automatically when users sign in on the ClipLens app.'
              : 'No users match the current search or filter criteria.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/[0.08] text-[#7E9288]">
                  <th className="py-2.5 pr-3 font-medium">User ID</th>
                  <th className="py-2.5 pr-3 font-medium">Name &amp; Email</th>
                  <th className="py-2.5 pr-3 font-medium">Plan</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Inspections</th>
                  <th className="py-2.5 pr-3 font-medium">Registered</th>
                  <th className="py-2.5 font-medium text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] tabular-nums">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#101814] transition-colors">
                    <td className="py-3 pr-3 font-mono text-[#94A69C]">{user.id}</td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-[#ECF3EF]">{user.name}</p>
                      <p className="text-[11px] text-[#7E9288]">{user.email}</p>
                    </td>
                    <td className="py-3 pr-3 capitalize text-[#C7D4CD]">{user.subscriptionPlan}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`font-semibold capitalize ${
                          user.status === 'active' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono text-right text-[#ECF3EF]">
                      {formatCount(user.inspectionCount)}
                    </td>
                    <td className="py-3 pr-3 text-[#7E9288] whitespace-nowrap">
                      {formatShortDate(user.registeredAt)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className="min-h-[32px] rounded-lg border border-white/[0.09] bg-[#090E0B] px-2.5 text-[11px] font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-emerald-300"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* User Profile Detail Drawer/Modal */}
      {selectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-user-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-lg bg-[#0D1310] rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <div>
                <h2
                  id="admin-user-modal-title"
                  className="font-display text-base font-bold text-[#ECF3EF]"
                >
                  {selectedUser.name}
                </h2>
                <p className="text-xs text-[#7E9288]">
                  {selectedUser.email} · {selectedUser.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                aria-label="Close user profile"
                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl text-[#7E9288] hover:text-[#ECF3EF] hover:bg-[#141E19]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-3">
                  <p className="text-[#7E9288]">Registered</p>
                  <p className="font-medium text-[#ECF3EF] mt-1">
                    {formatDateTime(selectedUser.registeredAt)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-3">
                  <p className="text-[#7E9288]">Last Active</p>
                  <p className="font-medium text-[#ECF3EF] mt-1">
                    {formatDateTime(selectedUser.lastActiveAt)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-3">
                  <p className="text-[#7E9288]">Subscription</p>
                  <p className="font-medium text-emerald-400 capitalize mt-1">
                    {selectedUser.subscriptionPlan} ({selectedUser.subscriptionStatus})
                  </p>
                </div>
                <div className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-3">
                  <p className="text-[#7E9288]">Usage &amp; Device</p>
                  <p className="font-medium text-[#ECF3EF] mt-1 tabular-nums">
                    {formatCount(selectedUser.inspectionCount)} inspects · {selectedUser.deviceType}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[#C7D4CD]">Recent User Activity</h3>
                {selectedUser.recentActivity.length === 0 ? (
                  <p className="text-xs text-[#7E9288]">No activity recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.06] rounded-xl bg-[#090E0B] border border-white/[0.06] px-3.5">
                    {selectedUser.recentActivity.slice(0, 8).map((act, idx) => (
                      <li
                        key={`${act.timestamp}-${idx}`}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-[#ECF3EF]">{act.action}</span>
                        <span className="text-[11px] text-[#7E9288] font-mono tabular-nums shrink-0">
                          {formatDateTime(act.timestamp)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <span className="text-xs text-[#7E9288]">
                  Account Status:{' '}
                  <strong
                    className={`capitalize ${
                      selectedUser.status === 'active' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {selectedUser.status}
                  </strong>
                </span>
                <button
                  type="button"
                  disabled={updatingId === selectedUser.id}
                  onClick={() => void handleStatusChange(selectedUser)}
                  className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all disabled:opacity-60 ${
                    selectedUser.status === 'active'
                      ? 'border border-rose-500/30 bg-rose-950/40 text-rose-200 hover:bg-rose-950/70'
                      : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                  }`}
                >
                  {selectedUser.status === 'active' ? (
                    <>
                      <ShieldBan className="h-3.5 w-3.5" aria-hidden="true" />
                      Suspend Account
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Reactivate Account
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
