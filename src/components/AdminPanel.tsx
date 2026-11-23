import { useState, useEffect, useCallback, type FormEvent, type ComponentType } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bell,
  Clock,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  AUTHORIZED_ADMIN_EMAIL,
  adminCreateNotificationInFirestore,
  adminDeleteNotificationInFirestore,
  adminSaveAppConfigInFirestore,
  adminSyncServerLedgerToFirestore,
  adminToggleNotificationInFirestore,
  adminUpdateUserStatusInFirestore,
  fetchAdminFirestoreDataset,
  syncAuthenticatedUserToFirestore,
} from '../services/firestoreService';
import type {
  AdminAppConfig,
  AdminDashboardSnapshot,
  AdminSectionId,
  AdminTimeSeriesPoint,
  AdminUserRecord,
} from '../types/video';
import { formatRemaining } from './admin/adminFormatters';
import { AdminOverviewView } from './admin/AdminOverviewView';
import { AdminAnalyticsView } from './admin/AdminAnalyticsView';
import { AdminUsersView } from './admin/AdminUsersView';
import { AdminRevenueView } from './admin/AdminRevenueView';
import { AdminSubscriptionsView, AdminTransactionsView } from './admin/AdminCommerceViews';
import {
  AdminAdvertisementsView,
  AdminAppManagementView,
  AdminNotificationsView,
} from './admin/AdminOperationsViews';
import { AdminSecurityView, AdminSettingsView } from './admin/AdminSystemViews';

interface AdminPanelProps {
  onExitToApp: () => void;
}

interface AdminStatus {
  needsSetup: boolean;
  firebaseAdminConfigured?: boolean;
  authorizedAdminEmailHint?: string;
}

function isFirebaseAdminActive(): boolean {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !user.email) return false;
  return user.email.trim().toLowerCase() === AUTHORIZED_ADMIN_EMAIL.toLowerCase();
}

function dateBucketKey(isoDate: string): string | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rebuildNewUserSeries(
  series: AdminTimeSeriesPoint[],
  daysBack: number,
  users: AdminUserRecord[]
): AdminTimeSeriesPoint[] {
  const now = new Date();
  const counts = new Map<string, number>();
  for (const u of users) {
    const key = dateBucketKey(u.registeredAt);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return series.map((point, idx) => {
    const offset = daysBack - 1 - idx;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      ...point,
      newUsers: Math.max(point.newUsers, counts.get(key) || 0),
    };
  });
}

function rebuildMonthlyUserSeries(
  series: AdminTimeSeriesPoint[],
  users: AdminUserRecord[]
): AdminTimeSeriesPoint[] {
  const now = new Date();
  const counts = new Map<string, number>();
  for (const u of users) {
    const d = new Date(u.registeredAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return series.map((point, idx) => {
    const offset = series.length - 1 - idx;
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      ...point,
      newUsers: Math.max(point.newUsers, counts.get(key) || 0),
    };
  });
}

const SIDEBAR_ITEMS: Array<{
  id: AdminSectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'advertisements', label: 'Advertisements', icon: Megaphone },
  { id: 'app-management', label: 'App Management', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'security', label: 'Security', icon: ShieldCheck },
];

export function AdminPanel({ onExitToApp }: AdminPanelProps) {
  // Keep admin token strictly in React memory (never persisted in localStorage/sessionStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [activeSection, setActiveSection] = useState<AdminSectionId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const clearSessionState = useCallback((reason?: string, isForbidden = false) => {
    setAdminToken(null);
    setSessionExpiresAt(null);
    setSnapshot(null);
    setDataError(null);
    setMobileMenuOpen(false);
    if (isForbidden) {
      setAccessDeniedMessage(reason || 'Access denied. Administrator permissions are required.');
      setAuthError(null);
    } else if (reason) {
      setAccessDeniedMessage(null);
      setAuthError(reason);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/admin/status', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as AdminStatus;
        setStatus(data);
      }
    } catch {
      // Ignore network hiccup; fallback to sign-in view
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const authorizedRequest = useCallback(
    async (
      url: string,
      options: RequestInit = {},
      tokenOverride?: string
    ): Promise<AdminDashboardSnapshot> => {
      const activeToken = tokenOverride ?? adminToken;
      if (!activeToken) {
        throw new Error('Authentication required.');
      }

      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${activeToken}`);
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(url, {
        ...options,
        headers,
        cache: 'no-store',
      });

      if (res.status === 401) {
        clearSessionState('Your admin session expired or was revoked. Please sign in again.');
        throw new Error('Session expired.');
      }
      if (res.status === 403) {
        clearSessionState(
          'Access denied. Administrator role is required to view protected data.',
          true
        );
        throw new Error('Access denied.');
      }

      const payload = (await res.json().catch(() => ({}))) as AdminDashboardSnapshot & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || 'Admin request failed.');
      }
      return payload;
    },
    [adminToken, clearSessionState]
  );

  const mergeWithFirestore = useCallback(
    async (serverData: AdminDashboardSnapshot): Promise<AdminDashboardSnapshot> => {
      if (!isFirebaseAdminActive()) {
        return serverData;
      }

      try {
        if (
          serverData.verifiedLedger &&
          (serverData.verifiedLedger.transactions.length > 0 ||
            serverData.verifiedLedger.subscriptions.length > 0)
        ) {
          await adminSyncServerLedgerToFirestore(
            serverData.verifiedLedger.transactions,
            serverData.verifiedLedger.subscriptions
          );
        }

        const cloud = await fetchAdminFirestoreDataset();

        const userMap = new Map<string, AdminUserRecord>();
        for (const cu of cloud.users) {
          userMap.set(cu.id, cu);
        }
        for (const su of serverData.users) {
          const existing = userMap.get(su.id);
          if (!existing) {
            userMap.set(su.id, su);
          } else {
            const latestActive =
              new Date(su.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()
                ? su.lastActiveAt
                : existing.lastActiveAt;
            userMap.set(su.id, {
              ...existing,
              name: su.name || existing.name,
              email: su.email.includes('@firebase') ? existing.email : su.email,
              lastActiveAt: latestActive,
              inspectionCount: Math.max(existing.inspectionCount, su.inspectionCount),
              aiToolRuns: Math.max(existing.aiToolRuns, su.aiToolRuns),
              recentActivity:
                existing.recentActivity.length >= su.recentActivity.length
                  ? existing.recentActivity
                  : su.recentActivity,
            });
          }
        }
        const mergedUsers = Array.from(userMap.values()).sort(
          (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
        );

        const txnMap = new Map<string, AdminDashboardSnapshot['transactions'][number]>();
        for (const ct of cloud.transactions) txnMap.set(ct.id, ct);
        for (const st of serverData.transactions) txnMap.set(st.id, st);
        const mergedTxns = Array.from(txnMap.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        const notifMap = new Map<string, AdminDashboardSnapshot['notifications'][number]>();
        for (const cn of cloud.notifications) notifMap.set(cn.id, cn);
        for (const sn of serverData.notifications) {
          if (!notifMap.has(sn.id)) notifMap.set(sn.id, sn);
        }
        const mergedNotifs = Array.from(notifMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        let activeToday = 0;
        let activeMonth = 0;
        let newToday = 0;
        let returningUsers = 0;
        for (const u of mergedUsers) {
          const lastMs = new Date(u.lastActiveAt).getTime();
          const regMs = new Date(u.registeredAt).getTime();
          if (lastMs >= startOfToday) activeToday += 1;
          if (lastMs >= startOfMonth) activeMonth += 1;
          if (regMs >= startOfToday) newToday += 1;
          if (u.inspectionCount > 1 || lastMs - regMs > 300_000) returningUsers += 1;
        }

        const deviceCounts: Record<string, number> = {};
        for (const d of serverData.deviceBreakdown) {
          deviceCounts[d.device] = d.count;
        }
        for (const u of mergedUsers) {
          if (u.deviceType !== 'Unknown') {
            deviceCounts[u.deviceType] = Math.max(deviceCounts[u.deviceType] || 0, 1);
          }
        }

        return {
          ...serverData,
          integrations: {
            ...serverData.integrations,
            databaseConnected: true,
          },
          kpis: {
            ...serverData.kpis,
            totalUsers: mergedUsers.length,
            activeUsersToday: Math.max(serverData.kpis.activeUsersToday, activeToday),
            activeUsersMonth: Math.max(serverData.kpis.activeUsersMonth, activeMonth),
            newUsersToday: Math.max(serverData.kpis.newUsersToday, newToday),
            returningUsers: Math.max(serverData.kpis.returningUsers, returningUsers),
            totalTransactions: mergedTxns.length,
          },
          series: {
            daily7: rebuildNewUserSeries(serverData.series.daily7, 7, mergedUsers),
            daily30: rebuildNewUserSeries(serverData.series.daily30, 30, mergedUsers),
            daily90: rebuildNewUserSeries(serverData.series.daily90, 90, mergedUsers),
            monthly12: rebuildMonthlyUserSeries(serverData.series.monthly12, mergedUsers),
          },
          deviceBreakdown: Object.entries(deviceCounts).map(([device, count]) => ({
            device,
            count,
          })),
          users: mergedUsers,
          transactions: mergedTxns.slice(0, 200),
          notifications: mergedNotifs,
          appConfig: cloud.appConfig ?? serverData.appConfig,
        };
      } catch {
        return serverData;
      }
    },
    []
  );

  const fetchOverview = useCallback(
    async (tokenOverride?: string) => {
      setDataLoading(true);
      setDataError(null);
      try {
        const data = await authorizedRequest('/api/admin/overview', { method: 'GET' }, tokenOverride);
        const merged = await mergeWithFirestore(data);
        setSnapshot(merged);
      } catch (err) {
        if (err instanceof Error && err.message !== 'Session expired.' && err.message !== 'Access denied.') {
          setDataError(err.message);
        }
      } finally {
        setDataLoading(false);
      }
    },
    [authorizedRequest, mergeWithFirestore]
  );

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (adminToken) {
      void fetchOverview(adminToken);
    }
  }, [adminToken, fetchOverview]);

  // Monitor session expiration countdown and lock automatically upon expiry
  useEffect(() => {
    if (!adminToken || !sessionExpiresAt) return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= sessionExpiresAt) {
        clearSessionState('Your admin session expired. Please sign in again.');
      }
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [adminToken, sessionExpiresAt, clearSessionState]);

  // Verify session validity periodically with server
  useEffect(() => {
    if (!adminToken) return;
    const verifyInterval = window.setInterval(async () => {
      try {
        const res = await fetch('/api/admin/session', {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: 'no-store',
        });
        if (res.status === 401) {
          clearSessionState('Your admin session expired or ended. Please sign in again.');
        } else if (res.status === 403) {
          clearSessionState('Access denied. Administrator role required.', true);
        }
      } catch {
        // Ignore transient network errors
      }
    }, 60_000);

    return () => window.clearInterval(verifyInterval);
  }, [adminToken, clearSessionState]);

  const handleSetupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAccessDeniedMessage(null);
    if (passcode.trim().length < 8) {
      setAuthError('Administrator passcode must be at least 8 characters.');
      return;
    }
    if (passcode !== confirmPasscode) {
      setAuthError('Passcodes do not match.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = (await res.json()) as { token?: string; expiresAt?: number; error?: string };
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Setup failed.');
      }
      setPasscode('');
      setConfirmPasscode('');
      setAdminToken(data.token);
      setSessionExpiresAt(
        typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 2 * 60 * 60 * 1000
      );
      setNowTick(Date.now());
      void fetchStatus();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to configure admin access.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAccessDeniedMessage(null);
    if (!passcode.trim()) {
      setAuthError('Enter your administrator passcode.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = (await res.json()) as { token?: string; expiresAt?: number; error?: string };
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Invalid administrator credentials.');
      }
      setPasscode('');
      setAdminToken(data.token);
      setSessionExpiresAt(
        typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 2 * 60 * 60 * 1000
      );
      setNowTick(Date.now());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setAuthError(null);
    setAccessDeniedMessage(null);
    setAuthSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/admin/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        expiresAt?: number;
        error?: string;
      };
      if (res.status === 403) {
        await signOut(auth).catch(() => {});
        setAccessDeniedMessage(
          data.error ||
            'Access denied. Only the authorized administrator Google account can access this dashboard.'
        );
        return;
      }
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Google administrator sign-in failed.');
      }

      void syncAuthenticatedUserToFirestore(cred.user).catch(() => {});
      setPasscode('');
      setAdminToken(data.token);
      setSessionExpiresAt(
        typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 2 * 60 * 60 * 1000
      );
      setNowTick(Date.now());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    const tokenToRevoke = adminToken;
    clearSessionState();
    await signOut(auth).catch(() => {});
    if (tokenToRevoke) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenToRevoke}` },
        });
      } catch {
        // Token already cleared locally; server TTL also protects
      }
    }
  };

  const handleToggleUserStatus = async (userId: string, nextStatus: 'active' | 'suspended') => {
    let serverSnapshot: AdminDashboardSnapshot | null = null;
    try {
      serverSnapshot = await authorizedRequest(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch (err) {
      if (!isFirebaseAdminActive()) throw err;
    }
    if (isFirebaseAdminActive()) {
      await adminUpdateUserStatusInFirestore(userId, nextStatus);
    }
    if (serverSnapshot) {
      setSnapshot(await mergeWithFirestore(serverSnapshot));
    } else {
      await fetchOverview();
    }
  };

  const handleSaveConfig = async (next: Partial<AdminAppConfig>) => {
    const updated = await authorizedRequest('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    if (isFirebaseAdminActive()) {
      await adminSaveAppConfigInFirestore(updated.appConfig);
    }
    setSnapshot(await mergeWithFirestore(updated));
  };

  const handleCreateNotification = async (payload: {
    title: string;
    message: string;
    audience: 'all' | 'free' | 'premium';
  }) => {
    const updated = await authorizedRequest('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const createdId = updated.notifications[0]?.id;
    if (isFirebaseAdminActive() && createdId) {
      await adminCreateNotificationInFirestore(createdId, payload);
    }
    setSnapshot(await mergeWithFirestore(updated));
  };

  const handleToggleNotification = async (id: string, active: boolean) => {
    let updated: AdminDashboardSnapshot | null = null;
    try {
      updated = await authorizedRequest(`/api/admin/notifications/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
    } catch (err) {
      if (!isFirebaseAdminActive()) throw err;
    }
    if (isFirebaseAdminActive()) {
      await adminToggleNotificationInFirestore(id, active);
    }
    if (updated) {
      setSnapshot(await mergeWithFirestore(updated));
    } else {
      await fetchOverview();
    }
  };

  const handleDeleteNotification = async (id: string) => {
    let updated: AdminDashboardSnapshot | null = null;
    try {
      updated = await authorizedRequest(`/api/admin/notifications/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      if (!isFirebaseAdminActive()) throw err;
    }
    if (isFirebaseAdminActive()) {
      await adminDeleteNotificationInFirestore(id);
    }
    if (updated) {
      setSnapshot(await mergeWithFirestore(updated));
    } else {
      await fetchOverview();
    }
  };

  const handleSaveProfile = async (displayName: string, email: string) => {
    const updated = await authorizedRequest('/api/admin/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName, email }),
    });
    setSnapshot(await mergeWithFirestore(updated));
  };

  const handleChangePassword = async (currentPasscode: string, newPasscode: string) => {
    const updated = await authorizedRequest('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPasscode, newPasscode }),
    });
    setSnapshot(await mergeWithFirestore(updated));
  };

  const handleRevokeSession = async (jti: string) => {
    const updated = await authorizedRequest(`/api/admin/sessions/${encodeURIComponent(jti)}/revoke`, {
      method: 'POST',
    });
    setSnapshot(await mergeWithFirestore(updated));
  };

  const handleRevokeOtherSessions = async () => {
    const updated = await authorizedRequest('/api/admin/sessions/revoke-others', {
      method: 'POST',
    });
    setSnapshot(await mergeWithFirestore(updated));
  };

  const handleResetEvents = async () => {
    const updated = await authorizedRequest('/api/admin/reset-events', {
      method: 'POST',
    });
    setSnapshot(await mergeWithFirestore(updated));
  };

  // Access Denied Screen (HTTP 403)
  if (accessDeniedMessage) {
    return (
      <div className="min-h-screen bg-[#060908] text-[#ECF3EF] flex flex-col justify-center px-4 py-10">
        <div className="max-w-md w-full mx-auto bg-[#0D1310] rounded-2xl border border-rose-500/30 p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-[#ECF3EF]">Access Denied</h1>
              <p className="text-xs sm:text-sm text-[#94A69C] mt-1">{accessDeniedMessage}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setAccessDeniedMessage(null)}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 transition-all duration-200 smooth-ease"
            >
              Sign In as Administrator
            </button>
            <button
              type="button"
              onClick={onExitToApp}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#090E0B] px-4 py-2 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Return to ClipLens
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Auth Gate Render (Unauthenticated / Login Page)
  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#060908] text-[#ECF3EF] flex flex-col justify-center px-4 py-10">
        <div className="max-w-md w-full mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-[#94A69C]">
              ClipLens Admin · Private Portal
            </span>
            <button
              type="button"
              onClick={onExitToApp}
              className="min-h-[36px] inline-flex items-center gap-1.5 text-xs font-medium text-[#7E9288] hover:text-emerald-400 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Return to ClipLens
            </button>
          </div>

          <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-3.5">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-[#ECF3EF]">
                  {!statusLoading && status?.needsSetup
                    ? 'Initialize Admin Access'
                    : 'Administrator Sign-In'}
                </h1>
                <p className="text-xs sm:text-sm text-[#94A69C] mt-1">
                  {!statusLoading && status?.needsSetup
                    ? 'Create an administrator passcode (min. 8 characters) to lock this management console.'
                    : 'Sign in with your administrator credentials to access the ClipLens Admin Dashboard.'}
                </p>
              </div>
            </div>

            {authError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-rose-200"
              >
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
                <span>{authError}</span>
              </div>
            )}

            {statusLoading ? (
              <div className="py-6 flex items-center justify-center text-[#7E9288] text-xs gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" aria-hidden="true" />
                Verifying portal status...
              </div>
            ) : (
              <div className="space-y-4">
                {status?.firebaseAdminConfigured && (
                  <>
                    <button
                      type="button"
                      disabled={authSubmitting}
                      onClick={() => void handleGoogleAdminLogin()}
                      className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0A0F0D] hover:bg-emerald-50 disabled:opacity-60 transition-colors"
                    >
                      {authSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                          />
                        </svg>
                      )}
                      Continue with Google (Admin)
                    </button>

                    <div className="flex items-center gap-2 text-[11px] text-[#7E9288]">
                      <span className="h-px flex-1 bg-white/[0.08]" />
                      <span>or passcode</span>
                      <span className="h-px flex-1 bg-white/[0.08]" />
                    </div>
                  </>
                )}

                {status?.needsSetup ? (
                  <form onSubmit={handleSetupSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="setup-passcode" className="block text-xs font-semibold text-[#C7D4CD]">
                        Create Administrator Passcode
                      </label>
                      <input
                        id="setup-passcode"
                        type="password"
                        autoComplete="new-password"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="w-full min-h-[46px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:bg-[#090E0B] focus:border-emerald-500/50 focus:outline-none transition-all duration-200 smooth-ease"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="confirm-passcode" className="block text-xs font-semibold text-[#C7D4CD]">
                        Confirm Passcode
                      </label>
                      <input
                        id="confirm-passcode"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPasscode}
                        onChange={(e) => setConfirmPasscode(e.target.value)}
                        placeholder="Re-enter passcode"
                        className="w-full min-h-[46px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:bg-[#090E0B] focus:border-emerald-500/50 focus:outline-none transition-all duration-200 smooth-ease"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 transition-all duration-200 smooth-ease"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {authSubmitting ? 'Securing Portal...' : 'Claim Administrator Access'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="login-passcode" className="block text-xs font-semibold text-[#C7D4CD]">
                        Administrator Passcode
                      </label>
                      <input
                        id="login-passcode"
                        type="password"
                        autoComplete="current-password"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="Enter administrator passcode"
                        className="w-full min-h-[46px] rounded-xl border border-white/[0.09] bg-[#070B09] px-3.5 text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:bg-[#090E0B] focus:border-emerald-500/50 focus:outline-none transition-all duration-200 smooth-ease"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 transition-all duration-200 smooth-ease"
                    >
                      {authSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Verifying...
                        </>
                      ) : (
                        'Sign In with Passcode'
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  const remainingMs = sessionExpiresAt ? Math.max(0, sessionExpiresAt - nowTick) : 0;
  const activeNavMeta = SIDEBAR_ITEMS.find((i) => i.id === activeSection) ?? SIDEBAR_ITEMS[0];

  const selectSection = (section: AdminSectionId) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* ClipLens Admin Logo */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-sm font-bold tracking-tight text-[#ECF3EF] leading-none">
              ClipLens
            </p>
            <p className="text-[11px] font-medium text-emerald-400 mt-0.5 leading-none">
              Admin Console
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close sidebar"
          className="lg:hidden min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#899C92] hover:text-[#ECF3EF] hover:bg-[#141E19]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Admin sidebar navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`w-full min-h-[42px] flex items-center gap-3 rounded-xl px-3.5 text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-[#899C92] hover:text-[#ECF3EF] hover:bg-[#101814] border border-transparent'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-[#7E9288]'}`}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Logout */}
      <div className="p-3 border-t border-white/[0.07] space-y-2 shrink-0">
        {snapshot && (
          <div className="px-3 py-2 rounded-xl bg-[#090E0B] border border-white/[0.06]">
            <p className="text-xs font-semibold text-[#ECF3EF] truncate">
              {snapshot.adminProfile.displayName}
            </p>
            <p className="text-[11px] text-[#7E9288] truncate">{snapshot.adminProfile.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full min-h-[42px] flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3.5 text-xs font-semibold text-rose-200 hover:bg-rose-950/60 transition-all"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060908] text-[#ECF3EF] flex">
      {/* Permanent Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-[#0A0F0D] border-r border-white/[0.07] z-30">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Collapsible Hamburger Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0A0F0D] border-r border-white/[0.08] h-full z-10 flex flex-col">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-[#0A0F0D]/90 backdrop-blur-md border-b border-white/[0.07] px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open admin navigation menu"
              className="lg:hidden min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-white/[0.09] bg-[#0D1310] text-[#ECF3EF] hover:bg-[#141E19]"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="min-w-0 flex items-center gap-2 text-xs sm:text-sm">
              <span className="hidden sm:inline text-[#7E9288] font-medium">ClipLens Admin</span>
              <span className="hidden sm:inline text-[#7E9288]" aria-hidden="true">
                /
              </span>
              <span className="font-display font-bold text-[#ECF3EF] truncate">
                {activeNavMeta.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sessionExpiresAt && (
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-[#090E0B] px-2.5 py-1.5 font-mono text-[11px] text-[#94A69C] tabular-nums">
                <Clock className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                Session: {formatRemaining(remainingMs)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchOverview()}
              disabled={dataLoading}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#0D1310] px-3 py-1.5 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-emerald-400 ${dataLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={onExitToApp}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#0D1310] px-3 py-1.5 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">ClipLens App</span>
            </button>
          </div>
        </header>

        {/* Workspace Canvas */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          {dataError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-xs text-rose-200 flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
              <span>{dataError}</span>
            </div>
          )}

          {!snapshot && dataLoading && (
            <div className="py-16 flex items-center justify-center gap-2.5 text-xs text-[#94A69C]">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" aria-hidden="true" />
              Loading ClipLens Admin telemetry...
            </div>
          )}

          {snapshot && activeSection === 'dashboard' && (
            <AdminOverviewView snapshot={snapshot} onNavigate={selectSection} />
          )}
          {snapshot && activeSection === 'analytics' && (
            <AdminAnalyticsView snapshot={snapshot} />
          )}
          {snapshot && activeSection === 'users' && (
            <AdminUsersView snapshot={snapshot} onToggleUserStatus={handleToggleUserStatus} />
          )}
          {snapshot && activeSection === 'revenue' && <AdminRevenueView snapshot={snapshot} />}
          {snapshot && activeSection === 'subscriptions' && (
            <AdminSubscriptionsView snapshot={snapshot} />
          )}
          {snapshot && activeSection === 'transactions' && (
            <AdminTransactionsView snapshot={snapshot} />
          )}
          {snapshot && activeSection === 'advertisements' && (
            <AdminAdvertisementsView snapshot={snapshot} />
          )}
          {snapshot && activeSection === 'app-management' && (
            <AdminAppManagementView snapshot={snapshot} onSaveConfig={handleSaveConfig} />
          )}
          {snapshot && activeSection === 'notifications' && (
            <AdminNotificationsView
              snapshot={snapshot}
              onCreateNotification={handleCreateNotification}
              onToggleNotification={handleToggleNotification}
              onDeleteNotification={handleDeleteNotification}
            />
          )}
          {snapshot && activeSection === 'settings' && (
            <AdminSettingsView
              snapshot={snapshot}
              onSaveProfile={handleSaveProfile}
              onChangePassword={handleChangePassword}
              onResetEvents={handleResetEvents}
              onLogout={handleLogout}
            />
          )}
          {snapshot && activeSection === 'security' && (
            <AdminSecurityView
              snapshot={snapshot}
              onRevokeSession={handleRevokeSession}
              onRevokeOtherSessions={handleRevokeOtherSessions}
            />
          )}
        </main>
      </div>
    </div>
  );
}
