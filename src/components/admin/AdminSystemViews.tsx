import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LogOut, RotateCcw, ShieldCheck, UserCog } from 'lucide-react';
import type { AdminDashboardSnapshot } from '../../types/video';
import { IntegrationNoticeBanner, formatCount, formatDateTime } from './adminFormatters';

export function AdminSettingsView({
  snapshot,
  onSaveProfile,
  onChangePassword,
  onResetEvents,
  onLogout,
}: {
  snapshot: AdminDashboardSnapshot;
  onSaveProfile: (displayName: string, email: string) => Promise<void>;
  onChangePassword: (currentPasscode: string, newPasscode: string) => Promise<void>;
  onResetEvents: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(snapshot.adminProfile.displayName);
  const [email, setEmail] = useState(snapshot.adminProfile.email);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSaved, setPwdSaved] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setDisplayName(snapshot.adminProfile.displayName);
    setEmail(snapshot.adminProfile.email);
  }, [snapshot.adminProfile.displayName, snapshot.adminProfile.email]);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      await onSaveProfile(displayName, email);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSaved(false);
    if (newPasscode.trim().length < 8) {
      setPwdError('New passcode must be at least 8 characters.');
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setPwdError('New passcodes do not match.');
      return;
    }

    setPwdSaving(true);
    try {
      await onChangePassword(currentPasscode, newPasscode);
      setCurrentPasscode('');
      setNewPasscode('');
      setConfirmPasscode('');
      setPwdSaved(true);
      window.setTimeout(() => setPwdSaved(false), 3000);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Failed to change passcode.');
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Settings</h1>
        <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
          Manage your administrator profile, credential rotation, and session telemetry controls.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Admin Profile */}
        <form
          onSubmit={handleProfileSubmit}
          className="lg:col-span-6 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Administrator Profile
            </h2>
          </div>

          {profileError && (
            <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl px-3 py-2">
              {profileError}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="adm-name" className="block text-xs font-semibold text-[#C7D4CD]">
              Display Name
            </label>
            <input
              id="adm-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-xs sm:text-sm text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="adm-email" className="block text-xs font-semibold text-[#C7D4CD]">
              Administrator Email
            </label>
            <input
              id="adm-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-xs sm:text-sm text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            {profileSaved ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Profile updated
              </span>
            ) : (
              <span className="text-[11px] text-[#7E9288]">
                Role: Administrator · Last sign-in {formatDateTime(snapshot.adminProfile.lastLoginAt)}
              </span>
            )}
            <button
              type="submit"
              disabled={profileSaving}
              className="min-h-[40px] rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>

        {/* Change Passcode */}
        <div className="lg:col-span-6 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">Change Passcode</h2>
          </div>

          {snapshot.integrations.authMethod === 'env_secret' ? (
            <IntegrationNoticeBanner
              title="Managed by ADMIN_PASSCODE Environment Secret"
              description="This deployment authenticates administrators using the server ADMIN_PASSCODE environment variable. To rotate the passcode, update ADMIN_PASSCODE in your environment secrets and restart the server."
            />
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
              {pwdError && (
                <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl px-3 py-2">
                  {pwdError}
                </p>
              )}

              <div className="space-y-1">
                <label htmlFor="pwd-curr" className="block text-xs font-semibold text-[#C7D4CD]">
                  Current Passcode
                </label>
                <input
                  id="pwd-curr"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPasscode}
                  onChange={(e) => setCurrentPasscode(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-xs sm:text-sm text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="pwd-new" className="block text-xs font-semibold text-[#C7D4CD]">
                    New Passcode
                  </label>
                  <input
                    id="pwd-new"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-xs sm:text-sm text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="pwd-conf" className="block text-xs font-semibold text-[#C7D4CD]">
                    Confirm New
                  </label>
                  <input
                    id="pwd-conf"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-xs sm:text-sm text-[#ECF3EF] focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                {pwdSaved ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Passcode rotated &amp; other sessions revoked
                  </span>
                ) : (
                  <span className="text-[11px] text-[#7E9288]">Minimum 8 characters</span>
                )}
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="min-h-[40px] rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {pwdSaving ? 'Updating...' : 'Update Passcode'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Session & Telemetry Actions */}
      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
            Session &amp; Telemetry Controls
          </h2>
          <p className="text-xs text-[#7E9288] mt-0.5">
            Clear in-memory monetization &amp; feature counters or end your current administrator session.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#090E0B] px-3.5 py-2 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19]"
            >
              <RotateCcw className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              Reset Session Counters
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-1.5">
              <span className="text-xs text-rose-200">Clear all event counters?</span>
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                  void onResetEvents();
                }}
                className="rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-400"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg px-2 py-1 text-[11px] text-[#C7D4CD] hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void onLogout()}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-950/60"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Log Out
          </button>
        </div>
      </section>
    </div>
  );
}

export function AdminSecurityView({
  snapshot,
  onRevokeSession,
  onRevokeOtherSessions,
}: {
  snapshot: AdminDashboardSnapshot;
  onRevokeSession: (jti: string) => Promise<void>;
  onRevokeOtherSessions: () => Promise<void>;
}) {
  const { security } = snapshot;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">Security</h1>
        <p className="text-xs sm:text-sm text-[#94A69C] mt-0.5">
          Monitor active administrator sessions, rate-limit lockouts, and real-time audit logs.
        </p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0D1310] rounded-2xl border border-emerald-500/25 p-5 space-y-1">
          <p className="text-xs text-[#94A69C]">Auth Verification</p>
          <p className="font-display text-lg font-bold text-emerald-400">
            {security.authMethod === 'env_secret' ? 'Server Env Secret' : 'scrypt Salted Hash'}
          </p>
          <p className="text-[11px] text-[#7E9288]">HMAC-SHA256 signed bearer tokens</p>
        </div>
        <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 space-y-1">
          <p className="text-xs text-[#94A69C]">Active Admin Sessions</p>
          <p className="font-mono text-2xl font-bold text-[#ECF3EF] tabular-nums">
            {formatCount(security.activeSessions.length)}
          </p>
          <p className="text-[11px] text-[#7E9288]">Stored in-memory on server</p>
        </div>
        <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 space-y-1">
          <p className="text-xs text-[#94A69C]">Currently Locked IPs</p>
          <p className="font-mono text-2xl font-bold text-[#ECF3EF] tabular-nums">
            {formatCount(security.lockedIpsCount)}
          </p>
          <p className="text-[11px] text-[#7E9288]">5 failed attempts triggers 15m lock</p>
        </div>
        <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 space-y-1">
          <p className="text-xs text-[#94A69C]">Client Token Storage</p>
          <p className="font-display text-lg font-bold text-[#ECF3EF]">Memory Only</p>
          <p className="text-[11px] text-[#7E9288]">No localStorage / sessionStorage</p>
        </div>
      </section>

      {/* Active Sessions */}
      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                Active Administrator Sessions
              </h2>
              <p className="text-xs text-[#7E9288]">
                Every bearer token can be revoked immediately server-side
              </p>
            </div>
          </div>

          {security.activeSessions.length > 1 && (
            <button
              type="button"
              onClick={() => void onRevokeOtherSessions()}
              className="min-h-[36px] rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-950/60"
            >
              Revoke All Other Sessions
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#7E9288]">
                <th className="py-2 pr-3 font-medium">Token ID</th>
                <th className="py-2 pr-3 font-medium">IP Address</th>
                <th className="py-2 pr-3 font-medium">Client</th>
                <th className="py-2 pr-3 font-medium">Issued</th>
                <th className="py-2 pr-3 font-medium">Expires</th>
                <th className="py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] tabular-nums">
              {security.activeSessions.map((sess) => (
                <tr key={sess.jti}>
                  <td className="py-2.5 pr-3 font-mono text-[#ECF3EF]">
                    {sess.jtiPrefix}…{' '}
                    {sess.isCurrent && (
                      <span className="ml-1 text-[11px] font-sans font-semibold text-emerald-400">
                        (Current)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[#C7D4CD]">{sess.ip}</td>
                  <td className="py-2.5 pr-3 text-[#94A69C] max-w-[220px] truncate">
                    {sess.userAgent}
                  </td>
                  <td className="py-2.5 pr-3 text-[#7E9288] whitespace-nowrap">
                    {formatDateTime(new Date(sess.issuedAt).toISOString())}
                  </td>
                  <td className="py-2.5 pr-3 text-[#7E9288] whitespace-nowrap">
                    {formatDateTime(new Date(sess.expiresAt).toISOString())}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      disabled={sess.isCurrent}
                      onClick={() => void onRevokeSession(sess.jti)}
                      className="min-h-[30px] rounded-lg border border-white/[0.09] bg-[#090E0B] px-2.5 text-[11px] font-semibold text-[#C7D4CD] hover:bg-rose-950/50 hover:text-rose-200 disabled:opacity-40"
                    >
                      {sess.isCurrent ? 'Active' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit Log */}
      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
            Security Audit Log
          </h2>
          <p className="text-xs text-[#7E9288]">
            Recent authentication, configuration, and session revocation events
          </p>
        </div>

        {security.recentAudit.length === 0 ? (
          <p className="text-xs text-[#7E9288]">No audit events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/[0.08] text-[#7E9288]">
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 font-medium">Actor</th>
                  <th className="py-2 pr-3 font-medium">IP</th>
                  <th className="py-2 pr-3 font-medium">Outcome</th>
                  <th className="py-2 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] tabular-nums">
                {security.recentAudit.slice(0, 20).map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-3 text-[#ECF3EF]">{item.action}</td>
                    <td className="py-2.5 pr-3 text-[#94A69C]">{item.actor}</td>
                    <td className="py-2.5 pr-3 font-mono text-[#7E9288]">{item.ip}</td>
                    <td
                      className={`py-2.5 pr-3 font-semibold capitalize ${
                        item.outcome === 'success'
                          ? 'text-emerald-400'
                          : item.outcome === 'blocked'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {item.outcome}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[#7E9288] whitespace-nowrap">
                      {formatDateTime(item.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
