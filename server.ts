import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth as FirebaseAdminAuth } from 'firebase-admin/auth';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  AdminAppConfig,
  AdminDashboardSnapshot,
  AdminNotificationRecord,
  AdminRevenueSummary,
  AdminSecurityAuditEntry,
  AdminTimeSeriesPoint,
  AdminTransactionRecord,
  AdminUserRecord,
  ChannelDetails,
  ChannelLookupResponse,
  CreatorToolId,
  CreatorToolResult,
  MonetizationEventType,
  MonetizationLogEntry,
  PaymentConfigStatus,
  PublicAppConfig,
  RazorpayCreateOrderResponse,
  RelatedVideo,
  ThumbnailVariant,
  TrendingVideoItem,
  VerifiedEntitlementResponse,
  VerifiedSubscriptionEntry,
  VerifiedTransactionEntry,
  VideoDetails,
} from './src/types/video.ts';

const AUTHORIZED_ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'berasourav5132@gmail.com'
).trim().toLowerCase();

const INR_TO_USD_RATE = 84;
const PLAN_PRICING = {
  monthly: { inr: 399, paise: 39900, usd: 4.99, durationDays: 30 },
  annual: { inr: 3299, paise: 329900, usd: 39.99, durationDays: 365 },
} as const;

let firebaseAdminAuth: FirebaseAdminAuth | null = null;
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const rawCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
    if (rawCfg.projectId && !rawCfg.projectId.startsWith('YOUR_')) {
      const fbApp = getApps().length ? getApp() : initializeApp({ projectId: rawCfg.projectId });
      firebaseAdminAuth = getAuth(fbApp);
    }
  }
} catch (err) {
  console.warn('Firebase Admin Auth initialization skipped:', err instanceof Error ? err.message : err);
}

interface RazorpayOrderRecord {
  orderId: string;
  uid: string;
  userEmail: string;
  userName: string;
  plan: 'monthly' | 'annual';
  amountPaise: number;
  currency: 'INR';
  createdAt: string;
  status: 'created' | 'paid' | 'failed';
}

interface VerifiedAdReportEntry {
  dateKey: string;
  adRevenueUsd: number;
  adImpressions: number;
  adClicks: number;
}

interface PersistentLedgerData {
  orders: Record<string, RazorpayOrderRecord>;
  transactions: VerifiedTransactionEntry[];
  subscriptions: VerifiedSubscriptionEntry[];
  adReports: VerifiedAdReportEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), '.cliplens-data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');

function loadPersistentLedger(): PersistentLedgerData {
  try {
    if (!fs.existsSync(LEDGER_FILE)) {
      return { orders: {}, transactions: [], subscriptions: [], adReports: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) as Partial<PersistentLedgerData>;
    return {
      orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {},
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      adReports: Array.isArray(parsed.adReports) ? parsed.adReports : [],
    };
  } catch {
    return { orders: {}, transactions: [], subscriptions: [], adReports: [] };
  }
}

const ledgerStore: PersistentLedgerData = loadPersistentLedger();

function savePersistentLedger(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${LEDGER_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(ledgerStore, null, 2), 'utf8');
    fs.renameSync(tmpPath, LEDGER_FILE);
  } catch (err) {
    console.error('Failed to persist payment ledger:', err instanceof Error ? err.message : err);
  }
}

function getRazorpayConfig() {
  const keyId = typeof process.env.RAZORPAY_KEY_ID === 'string' ? process.env.RAZORPAY_KEY_ID.trim() : '';
  const keySecret =
    typeof process.env.RAZORPAY_KEY_SECRET === 'string' ? process.env.RAZORPAY_KEY_SECRET.trim() : '';
  const webhookSecret =
    typeof process.env.RAZORPAY_WEBHOOK_SECRET === 'string'
      ? process.env.RAZORPAY_WEBHOOK_SECRET.trim()
      : '';
  return {
    keyId,
    keySecret,
    webhookSecret,
    configured: keyId.length > 0 && keySecret.length > 0,
  };
}

function getAdSenseConfig() {
  const clientId =
    typeof process.env.VITE_ADSENSE_CLIENT_ID === 'string'
      ? process.env.VITE_ADSENSE_CLIENT_ID.trim()
      : '';
  const bannerSlot =
    typeof process.env.VITE_ADSENSE_BANNER_SLOT === 'string'
      ? process.env.VITE_ADSENSE_BANNER_SLOT.trim()
      : '';
  const accountId =
    typeof process.env.ADSENSE_ACCOUNT_ID === 'string' ? process.env.ADSENSE_ACCOUNT_ID.trim() : '';
  const accessToken =
    typeof process.env.ADSENSE_ACCESS_TOKEN === 'string'
      ? process.env.ADSENSE_ACCESS_TOKEN.trim()
      : '';
  return {
    clientId: clientId || null,
    bannerSlot: bannerSlot || null,
    accountId: accountId || null,
    accessToken: accessToken || null,
    configured: clientId.length > 0 && bannerSlot.length > 0,
    reportingConfigured: accountId.length > 0 && accessToken.length > 0,
  };
}

const PORT = 3000;

const SESSION_SIGNING_KEY =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length > 0
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AdminSessionRecord {
  jti: string;
  role: 'admin';
  issuedAt: number;
  expiresAt: number;
  ip: string;
  userAgent: string;
}

interface VerifiedAuthContext {
  jti: string;
  role: string;
  expiresAt: number;
}

interface AuthenticatedRequest extends Request {
  auth?: VerifiedAuthContext;
}

const activeAdminSessions = new Map<string, AdminSessionRecord>();
const failedAuthAttempts = new Map<
  string,
  { failures: number; windowStart: number; lockedUntil: number }
>();

let claimedAdminCredential: { salt: string; hashHex: string } | null = null;

const adminProfileStore = {
  displayName: 'ClipLens Administrator',
  email: AUTHORIZED_ADMIN_EMAIL,
  lastLoginAt: null as string | null,
};

const appConfigStore: AdminAppConfig = {
  maintenanceMode: false,
  appStatus: 'operational',
  announcementEnabled: false,
  announcementMessage: '',
  aiToolsEnabled: true,
  adGateEnabled: true,
  dailyFreeInspectLimit: 25,
  updatedAt: new Date().toISOString(),
};

const usersStore = new Map<string, AdminUserRecord>();
const notificationsStore: AdminNotificationRecord[] = [];
const securityAuditLog: AdminSecurityAuditEntry[] = [];

const featureUsageStore: Record<string, number> = {
  'Video Inspector': 0,
  'Channel Analyzer': 0,
  'Keyword Suggestion': 0,
  'AI Hashtag Generator': 0,
  'AI Tags Generator': 0,
  'AI Channel': 0,
  'AI Video': 0,
  'Trending Feed': 0,
};

const deviceUsageStore: Record<'Desktop' | 'Mobile' | 'Tablet' | 'Unknown', number> = {
  Desktop: 0,
  Mobile: 0,
  Tablet: 0,
  Unknown: 0,
};

const MONETIZATION_RATES = {
  rewardedEcpmUsd: 0,
  bannerEcpmUsd: 0,
  monthlyPriceUsd: PLAN_PRICING.monthly.usd,
  annualPriceUsd: PLAN_PRICING.annual.usd,
};

// Client telemetry events can only track ad & inspect usage; Premium upgrades require verified Razorpay checkout
const ALLOWED_EVENT_TYPES = new Set<MonetizationEventType>([
  'banner_impression',
  'rewarded_ad_start',
  'rewarded_ad_complete',
  'video_inspect',
]);

const monetizationStore = {
  bannerImpressions: 0,
  rewardedAdStarts: 0,
  rewardedAdCompletes: 0,
  videoInspections: 0,
  recentEvents: [] as MonetizationLogEntry[],
  eventHistory: [] as MonetizationLogEntry[],
  serverStartedAt: new Date().toISOString(),
};

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

async function verifyFirebaseIdTokenString(token: string): Promise<VerifiedFirebaseUser | null> {
  if (!firebaseAdminAuth || !token) return null;
  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '',
      emailVerified: Boolean(decoded.email_verified),
      name:
        typeof decoded.name === 'string' && decoded.name.trim()
          ? decoded.name.trim().slice(0, 80)
          : (decoded.email || 'Creator').split('@')[0],
    };
  } catch {
    return null;
  }
}

async function verifyFirebaseBearer(req: Request): Promise<VerifiedFirebaseUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return verifyFirebaseIdTokenString(token);
}

function getActiveEntitlementForUid(uid: string): VerifiedEntitlementResponse {
  const nowMs = Date.now();
  const matching = ledgerStore.subscriptions
    .filter((s) => s.uid === uid)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const active = matching.find(
    (s) => s.status === 'active' && new Date(s.expiresAt).getTime() > nowMs
  );
  if (active) {
    return {
      isPremium: true,
      plan: active.plan,
      status: 'active',
      provider: 'razorpay',
      expiresAt: active.expiresAt,
    };
  }

  const latest = matching[0];
  if (latest) {
    const expired = new Date(latest.expiresAt).getTime() <= nowMs;
    return {
      isPremium: false,
      plan: latest.plan,
      status: latest.status === 'cancelled' ? 'cancelled' : expired ? 'expired' : 'none',
      provider: 'razorpay',
      expiresAt: latest.expiresAt,
    };
  }

  return {
    isPremium: false,
    plan: null,
    status: 'none',
    provider: null,
    expiresAt: null,
  };
}

function recordVerifiedRazorpayActivation(params: {
  uid: string;
  userName: string;
  userEmail: string;
  orderId: string;
  paymentId: string;
  plan: 'monthly' | 'annual';
  amountPaise: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: 'captured' | 'authorized';
}): VerifiedEntitlementResponse {
  const nowIso = new Date().toISOString();
  const existingTxn = ledgerStore.transactions.find(
    (t) => t.paymentId === params.paymentId || t.id === params.paymentId
  );

  const amountMajor =
    params.currency === 'INR' ? Number((params.amountPaise / 100).toFixed(2)) : Number((params.amountPaise / 100).toFixed(2));
  const amountUsdEquivalent =
    params.currency === 'INR'
      ? Number((amountMajor / INR_TO_USD_RATE).toFixed(2))
      : amountMajor;

  if (!existingTxn) {
    ledgerStore.transactions.unshift({
      id: params.paymentId,
      uid: params.uid,
      userName: params.userName,
      userEmail: params.userEmail,
      orderId: params.orderId,
      paymentId: params.paymentId,
      amount: amountMajor,
      currency: params.currency,
      amountUsdEquivalent,
      paymentMethod: params.paymentMethod || 'Razorpay',
      subscriptionType: params.plan,
      paymentStatus: params.paymentStatus,
      refundStatus: 'none',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    if (ledgerStore.transactions.length > 2000) {
      ledgerStore.transactions.length = 2000;
    }
  } else {
    existingTxn.paymentStatus = params.paymentStatus;
    existingTxn.updatedAt = nowIso;
  }

  const order = ledgerStore.orders[params.orderId];
  if (order) {
    order.status = 'paid';
  }

  const durationDays = PLAN_PRICING[params.plan].durationDays;
  const expiresIso = new Date(Date.now() + durationDays * 86_400_000).toISOString();

  // Supersede previous active subscription for the user if upgrading/switching
  for (const sub of ledgerStore.subscriptions) {
    if (sub.uid === params.uid && sub.status === 'active' && sub.razorpayPaymentId !== params.paymentId) {
      sub.status = 'cancelled';
      sub.updatedAt = nowIso;
    }
  }

  const existingSub = ledgerStore.subscriptions.find(
    (s) => s.razorpayPaymentId === params.paymentId || s.id === `sub_${params.paymentId}`
  );
  if (!existingSub) {
    ledgerStore.subscriptions.unshift({
      id: `sub_${params.paymentId}`,
      uid: params.uid,
      plan: params.plan,
      status: 'active',
      provider: 'razorpay',
      razorpayOrderId: params.orderId,
      razorpayPaymentId: params.paymentId,
      amount: amountMajor,
      currency: params.currency,
      startedAt: nowIso,
      expiresAt: expiresIso,
      updatedAt: nowIso,
    });
  }

  const matchedUser =
    Array.from(usersStore.values()).find((u) => u.id === params.uid || u.email === params.userEmail);
  if (matchedUser) {
    matchedUser.subscriptionPlan = params.plan;
    matchedUser.subscriptionStatus = 'active';
    matchedUser.lastActiveAt = nowIso;
    matchedUser.recentActivity.unshift({
      action: `Verified Razorpay ${params.plan} payment (${params.paymentId})`,
      timestamp: nowIso,
    });
    if (matchedUser.recentActivity.length > 20) matchedUser.recentActivity.length = 20;
  }

  savePersistentLedger();
  return getActiveEntitlementForUid(params.uid);
}

function getEnvAdminPasscode(): string {
  return typeof process.env.ADMIN_PASSCODE === 'string' ? process.env.ADMIN_PASSCODE.trim() : '';
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [jti, session] of activeAdminSessions.entries()) {
    if (session.expiresAt <= now) {
      activeAdminSessions.delete(jti);
    }
  }
}

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const record = failedAuthAttempts.get(ip);
  if (!record) return { allowed: true, retryAfterSec: 0 };

  if (record.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((record.lockedUntil - now) / 1000)),
    };
  }

  if (now - record.windowStart > LOGIN_WINDOW_MS) {
    failedAuthAttempts.delete(ip);
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedLoginAttempt(ip: string): { locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = failedAuthAttempts.get(ip);

  if (!existing || now - existing.windowStart > LOGIN_WINDOW_MS) {
    failedAuthAttempts.set(ip, { failures: 1, windowStart: now, lockedUntil: 0 });
    return { locked: false, retryAfterSec: 0 };
  }

  existing.failures += 1;
  if (existing.failures >= MAX_LOGIN_ATTEMPTS) {
    existing.lockedUntil = now + LOGIN_LOCKOUT_MS;
    return {
      locked: true,
      retryAfterSec: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
    };
  }

  return { locked: false, retryAfterSec: 0 };
}

function clearLoginAttempts(ip: string): void {
  failedAuthAttempts.delete(ip);
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verifyAdminPasscode(candidate: string): boolean {
  const envPass = getEnvAdminPasscode();
  if (envPass.length > 0) {
    return timingSafeCompareStrings(candidate, envPass);
  }
  if (!claimedAdminCredential) {
    return false;
  }
  const derived = crypto.scryptSync(candidate, claimedAdminCredential.salt, 64);
  const stored = Buffer.from(claimedAdminCredential.hashHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function detectDeviceType(userAgentHeader: string | undefined): 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown' {
  const ua = (userAgentHeader || '').toLowerCase();
  if (!ua) return 'Unknown';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'Tablet';
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function recordFeatureAndDevice(req: Request, featureName: string): void {
  featureUsageStore[featureName] = (featureUsageStore[featureName] || 0) + 1;
  const device = detectDeviceType(req.headers['user-agent']);
  deviceUsageStore[device] = (deviceUsageStore[device] || 0) + 1;
}

function pushAuditLog(
  action: string,
  ip: string,
  outcome: AdminSecurityAuditEntry['outcome'],
  actor = adminProfileStore.email
): void {
  securityAuditLog.unshift({
    id: crypto.randomUUID(),
    action,
    actor,
    ip,
    timestamp: new Date().toISOString(),
    outcome,
  });
  if (securityAuditLog.length > 100) {
    securityAuditLog.length = 100;
  }
}

function issueAdminBearerToken(req: Request): { token: string; expiresAt: number; jti: string } {
  pruneExpiredSessions();
  const jti = crypto.randomUUID();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_MS;
  const ip = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || 'Unknown client').slice(0, 120);

  activeAdminSessions.set(jti, {
    jti,
    role: 'admin',
    issuedAt,
    expiresAt,
    ip,
    userAgent,
  });

  adminProfileStore.lastLoginAt = new Date(issuedAt).toISOString();

  const payload = Buffer.from(
    JSON.stringify({
      jti,
      role: 'admin',
      iat: issuedAt,
      exp: expiresAt,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(payload)
    .digest('base64url');

  return { token: `${payload}.${sig}`, expiresAt, jti };
}

function verifyBearerToken(token: string): VerifiedAuthContext | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, providedSig] = parts;
  if (!payload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(payload)
    .digest('base64url');
  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      jti?: unknown;
      role?: unknown;
      exp?: unknown;
    };
    if (
      typeof decoded.jti !== 'string' ||
      typeof decoded.role !== 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }

    const now = Date.now();
    if (decoded.exp <= now) {
      activeAdminSessions.delete(decoded.jti);
      return null;
    }

    if (decoded.role === 'admin') {
      const active = activeAdminSessions.get(decoded.jti);
      if (!active || active.expiresAt <= now) {
        activeAdminSessions.delete(decoded.jti);
        return null;
      }
      return {
        jti: decoded.jti,
        role: active.role,
        expiresAt: active.expiresAt,
      };
    }

    return {
      jti: decoded.jti,
      role: decoded.role,
      expiresAt: decoded.exp,
    };
  } catch {
    return null;
  }
}

function requireAuthenticated(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const verified = verifyBearerToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Invalid, expired, or revoked session. Please sign in again.' });
    return;
  }
  req.auth = verified;
  next();
}

function requireAdminRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.auth.role !== 'admin') {
    res.status(403).json({ error: 'Access denied. Administrator role is required.' });
    return;
  }
  next();
}

function noStoreAdminHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

function mapVerifiedTransactionsToAdminRecords(): AdminTransactionRecord[] {
  return ledgerStore.transactions.map((t) => ({
    id: t.id,
    userId: t.uid,
    userName: t.userName || t.userEmail || 'Verified User',
    amountUsd: t.amountUsdEquivalent,
    paymentMethod: t.paymentMethod || 'Razorpay',
    plan: t.subscriptionType,
    date: t.createdAt,
    status:
      t.refundStatus === 'full'
        ? 'refunded'
        : t.paymentStatus === 'failed'
          ? 'failed'
          : 'completed',
    source: 'gateway',
  }));
}

function buildAdminRevenueSummary(): AdminRevenueSummary {
  // Real verified subscription revenue from Razorpay transactions (no fabricated estimates)
  const validTxns = ledgerStore.transactions.filter(
    (t) => (t.paymentStatus === 'captured' || t.paymentStatus === 'authorized') && t.refundStatus !== 'full'
  );

  let monthlyPlanRevenueUsd = 0;
  let annualPlanRevenueUsd = 0;
  let monthlyTxnsCount = 0;
  let annualTxnsCount = 0;

  for (const t of validTxns) {
    if (t.subscriptionType === 'annual') {
      annualPlanRevenueUsd += t.amountUsdEquivalent;
      annualTxnsCount += 1;
    } else {
      monthlyPlanRevenueUsd += t.amountUsdEquivalent;
      monthlyTxnsCount += 1;
    }
  }

  const subscriptionUsd = monthlyPlanRevenueUsd + annualPlanRevenueUsd;
  const activeMonthlySubs = ledgerStore.subscriptions.filter(
    (s) => s.status === 'active' && s.plan === 'monthly' && new Date(s.expiresAt).getTime() > Date.now()
  ).length;
  const activeAnnualSubs = ledgerStore.subscriptions.filter(
    (s) => s.status === 'active' && s.plan === 'annual' && new Date(s.expiresAt).getTime() > Date.now()
  ).length;

  const monthlyRecurringRunRateUsd =
    activeMonthlySubs * MONETIZATION_RATES.monthlyPriceUsd +
    activeAnnualSubs * (MONETIZATION_RATES.annualPriceUsd / 12);

  // Real advertising revenue strictly from synced AdSense reporting data (zero fake eCPM math)
  const advertisingTotalUsd = ledgerStore.adReports.reduce(
    (acc, r) => acc + Number(r.adRevenueUsd || 0),
    0
  );

  const totalTransactions = validTxns.length;
  const averageOrderValueUsd =
    totalTransactions > 0 ? subscriptionUsd / totalTransactions : 0;

  const adCompletionRatePct =
    monetizationStore.rewardedAdStarts > 0
      ? Math.min(
          100,
          (monetizationStore.rewardedAdCompletes / monetizationStore.rewardedAdStarts) * 100
        )
      : 0;

  return {
    counts: {
      bannerImpressions: monetizationStore.bannerImpressions,
      rewardedAdStarts: monetizationStore.rewardedAdStarts,
      rewardedAdCompletes: monetizationStore.rewardedAdCompletes,
      premiumMonthlySignups: monthlyTxnsCount,
      premiumAnnualSignups: annualTxnsCount,
      videoInspections: monetizationStore.videoInspections,
    },
    rates: { ...MONETIZATION_RATES },
    revenue: {
      rewardedAdUsd: 0,
      bannerAdUsd: Number(advertisingTotalUsd.toFixed(4)),
      advertisingTotalUsd: Number(advertisingTotalUsd.toFixed(4)),
      subscriptionUsd: Number(subscriptionUsd.toFixed(2)),
      monthlyRecurringRunRateUsd: Number(monthlyRecurringRunRateUsd.toFixed(2)),
      totalUsd: Number((advertisingTotalUsd + subscriptionUsd).toFixed(4)),
    },
    userStats: {
      videoInspections: monetizationStore.videoInspections,
      adCompletionRatePct: Number(adCompletionRatePct.toFixed(1)),
      premiumSubscribers: activeMonthlySubs + activeAnnualSubs,
      monthlySubscribers: activeMonthlySubs,
      annualSubscribers: activeAnnualSubs,
    },
    paymentStats: {
      totalTransactions,
      monthlyPlanRevenueUsd: Number(monthlyPlanRevenueUsd.toFixed(2)),
      annualPlanRevenueUsd: Number(annualPlanRevenueUsd.toFixed(2)),
      averageOrderValueUsd: Number(averageOrderValueUsd.toFixed(2)),
    },
    recentEvents: monetizationStore.recentEvents.slice(0, 25),
    serverStartedAt: monetizationStore.serverStartedAt,
  };
}

function buildDailyTimeSeries(days: number): AdminTimeSeriesPoint[] {
  const now = new Date();
  const buckets = new Map<string, AdminTimeSeriesPoint>();
  const keys: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label =
      days <= 30
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `${d.getMonth() + 1}/${d.getDate()}`;
    keys.push(key);
    buckets.set(key, {
      label,
      revenueUsd: 0,
      adRevenueUsd: 0,
      subscriptionRevenueUsd: 0,
      newUsers: 0,
      inspections: 0,
    });
  }

  for (const r of ledgerStore.adReports) {
    const bucket = buckets.get(r.dateKey);
    if (!bucket) continue;
    bucket.adRevenueUsd = Number((bucket.adRevenueUsd + r.adRevenueUsd).toFixed(4));
    bucket.revenueUsd = Number((bucket.revenueUsd + r.adRevenueUsd).toFixed(4));
  }

  for (const t of ledgerStore.transactions) {
    if (t.refundStatus === 'full' || t.paymentStatus === 'failed') continue;
    const d = new Date(t.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.subscriptionRevenueUsd = Number(
      (bucket.subscriptionRevenueUsd + t.amountUsdEquivalent).toFixed(2)
    );
    bucket.revenueUsd = Number((bucket.revenueUsd + t.amountUsdEquivalent).toFixed(4));
  }

  for (const ev of monetizationStore.eventHistory) {
    if (ev.type !== 'video_inspect') continue;
    const d = new Date(ev.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.inspections += 1;
    }
  }

  for (const u of usersStore.values()) {
    const d = new Date(u.registeredAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.newUsers += 1;
    }
  }

  return keys.map((k) => buckets.get(k)!);
}

function buildMonthlyTimeSeries(months = 12): AdminTimeSeriesPoint[] {
  const now = new Date();
  const buckets = new Map<string, AdminTimeSeriesPoint>();
  const keys: string[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    keys.push(key);
    buckets.set(key, {
      label,
      revenueUsd: 0,
      adRevenueUsd: 0,
      subscriptionRevenueUsd: 0,
      newUsers: 0,
      inspections: 0,
    });
  }

  for (const r of ledgerStore.adReports) {
    const monthKey = r.dateKey.slice(0, 7);
    const bucket = buckets.get(monthKey);
    if (!bucket) continue;
    bucket.adRevenueUsd = Number((bucket.adRevenueUsd + r.adRevenueUsd).toFixed(4));
    bucket.revenueUsd = Number((bucket.revenueUsd + r.adRevenueUsd).toFixed(4));
  }

  for (const t of ledgerStore.transactions) {
    if (t.refundStatus === 'full' || t.paymentStatus === 'failed') continue;
    const d = new Date(t.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.subscriptionRevenueUsd = Number(
      (bucket.subscriptionRevenueUsd + t.amountUsdEquivalent).toFixed(2)
    );
    bucket.revenueUsd = Number((bucket.revenueUsd + t.amountUsdEquivalent).toFixed(4));
  }

  for (const ev of monetizationStore.eventHistory) {
    if (ev.type !== 'video_inspect') continue;
    const d = new Date(ev.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.inspections += 1;
    }
  }

  for (const u of usersStore.values()) {
    const d = new Date(u.registeredAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.newUsers += 1;
    }
  }

  return keys.map((k) => buckets.get(k)!);
}

function calcPctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function buildAdminDashboardSnapshot(currentJti: string): AdminDashboardSnapshot {
  pruneExpiredSessions();
  const summary = buildAdminRevenueSummary();
  const razorpayCfg = getRazorpayConfig();
  const adsenseCfg = getAdSenseConfig();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

  let todayRevenueUsd = 0;
  let yesterdayRevenueUsd = 0;
  let weekRevenueUsd = 0;
  let monthRevenueUsd = 0;
  let yearRevenueUsd = 0;

  for (const t of ledgerStore.transactions) {
    if (t.refundStatus === 'full' || t.paymentStatus === 'failed') continue;
    const ts = new Date(t.createdAt).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts >= startOfToday) todayRevenueUsd += t.amountUsdEquivalent;
    else if (ts >= startOfYesterday && ts < startOfToday) yesterdayRevenueUsd += t.amountUsdEquivalent;
    if (ts >= startOfWeek) weekRevenueUsd += t.amountUsdEquivalent;
    if (ts >= startOfMonth) monthRevenueUsd += t.amountUsdEquivalent;
    if (ts >= startOfYear) yearRevenueUsd += t.amountUsdEquivalent;
  }

  for (const r of ledgerStore.adReports) {
    const ts = new Date(`${r.dateKey}T00:00:00.000Z`).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts >= startOfToday) todayRevenueUsd += r.adRevenueUsd;
    else if (ts >= startOfYesterday && ts < startOfToday) yesterdayRevenueUsd += r.adRevenueUsd;
    if (ts >= startOfWeek) weekRevenueUsd += r.adRevenueUsd;
    if (ts >= startOfMonth) monthRevenueUsd += r.adRevenueUsd;
    if (ts >= startOfYear) yearRevenueUsd += r.adRevenueUsd;
  }

  const users = Array.from(usersStore.values()).sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  );

  let activeUsersToday = 0;
  let activeUsersMonth = 0;
  let newUsersToday = 0;
  let newUsersYesterday = 0;
  let returningUsers = 0;

  for (const u of users) {
    const lastMs = new Date(u.lastActiveAt).getTime();
    const regMs = new Date(u.registeredAt).getTime();
    if (lastMs >= startOfToday) activeUsersToday += 1;
    if (lastMs >= startOfMonth) activeUsersMonth += 1;
    if (regMs >= startOfToday) newUsersToday += 1;
    else if (regMs >= startOfYesterday && regMs < startOfToday) newUsersYesterday += 1;
    if (u.inspectionCount > 1 || lastMs - regMs > 300_000) returningUsers += 1;
  }

  const nowMs = Date.now();
  const activeSubscriptions = ledgerStore.subscriptions.filter(
    (s) => s.status === 'active' && new Date(s.expiresAt).getTime() > nowMs
  ).length;
  const expiredSubscriptions = ledgerStore.subscriptions.filter(
    (s) => s.status === 'expired' || (s.status === 'active' && new Date(s.expiresAt).getTime() <= nowMs)
  ).length;
  const cancelledSubscriptions = ledgerStore.subscriptions.filter(
    (s) => s.status === 'cancelled'
  ).length;

  const totalAdClicks =
    adsenseCfg.reportingConfigured && ledgerStore.adReports.length > 0
      ? ledgerStore.adReports.reduce((acc, r) => acc + r.adClicks, 0)
      : null;
  const totalAdReportImpressions =
    adsenseCfg.reportingConfigured && ledgerStore.adReports.length > 0
      ? ledgerStore.adReports.reduce((acc, r) => acc + r.adImpressions, 0)
      : monetizationStore.bannerImpressions + monetizationStore.rewardedAdCompletes;
  const adCtrPct =
    totalAdClicks !== null && totalAdReportImpressions > 0
      ? Number(((totalAdClicks / totalAdReportImpressions) * 100).toFixed(2))
      : null;

  const authMethod = getEnvAdminPasscode().length > 0 ? 'env_secret' : 'claimed_hash';
  const activeSessions = Array.from(activeAdminSessions.values())
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .map((s) => ({
      jti: s.jti,
      jtiPrefix: s.jti.slice(0, 8),
      issuedAt: s.issuedAt,
      expiresAt: s.expiresAt,
      ip: s.ip,
      userAgent: s.userAgent,
      isCurrent: s.jti === currentJti,
    }));

  const lockedIpsCount = Array.from(failedAuthAttempts.values()).filter(
    (entry) => entry.lockedUntil > Date.now()
  ).length;

  const mappedTransactions = mapVerifiedTransactionsToAdminRecords();

  return {
    summary,
    integrations: {
      databaseConnected: Boolean(firebaseAdminAuth),
      paymentGatewayConnected: razorpayCfg.configured,
      adNetworkConnected: adsenseCfg.configured || adsenseCfg.reportingConfigured,
      geoAnalyticsConnected: false,
      authMethod,
    },
    kpis: {
      totalUsers: users.length,
      activeUsersToday,
      activeUsersMonth,
      newUsersToday,
      returningUsers,
      totalRevenueUsd: summary.revenue.totalUsd,
      todayRevenueUsd: Number(todayRevenueUsd.toFixed(4)),
      weekRevenueUsd: Number(weekRevenueUsd.toFixed(4)),
      monthRevenueUsd: Number(monthRevenueUsd.toFixed(4)),
      yearRevenueUsd: Number(yearRevenueUsd.toFixed(4)),
      otherRevenueUsd: 0,
      premiumSubscribers: activeSubscriptions,
      activeSubscriptions,
      expiredSubscriptions,
      cancelledSubscriptions,
      totalTransactions: mappedTransactions.length,
      adImpressions: totalAdReportImpressions,
      adClicks: totalAdClicks,
      adCtrPct,
      deltas: {
        totalUsersPct: calcPctDelta(newUsersToday, newUsersYesterday),
        activeUsersPct: null,
        totalRevenuePct: null,
        todayRevenuePct: calcPctDelta(todayRevenueUsd, yesterdayRevenueUsd),
        premiumSubscribersPct: null,
        totalTransactionsPct: null,
      },
    },
    series: {
      daily7: buildDailyTimeSeries(7),
      daily30: buildDailyTimeSeries(30),
      daily90: buildDailyTimeSeries(90),
      monthly12: buildMonthlyTimeSeries(12),
    },
    featureUsage: Object.entries(featureUsageStore).map(([feature, count]) => ({
      feature,
      count,
    })),
    deviceBreakdown: Object.entries(deviceUsageStore)
      .filter(([, count]) => count > 0)
      .map(([device, count]) => ({ device, count })),
    users,
    transactions: mappedTransactions.slice(0, 200),
    notifications: notificationsStore,
    appConfig: { ...appConfigStore },
    adminProfile: {
      displayName: adminProfileStore.displayName,
      email: adminProfileStore.email,
      role: 'admin',
      lastLoginAt: adminProfileStore.lastLoginAt,
    },
    security: {
      authMethod,
      activeSessions,
      recentAudit: securityAuditLog.slice(0, 40),
      lockedIpsCount,
    },
    verifiedLedger: {
      transactions: ledgerStore.transactions.slice(0, 200),
      subscriptions: ledgerStore.subscriptions.slice(0, 200),
    },
  };
}

const ALLOWED_YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const ALLOWED_IMAGE_HOSTS = new Set([
  'i.ytimg.com',
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com',
  'i4.ytimg.com',
  'yt3.ggpht.com',
  'yt3.googleusercontent.com',
]);

const ALLOWED_THUMB_QUALITIES = new Set([
  'maxresdefault',
  'sddefault',
  'hqdefault',
  'mqdefault',
  'default',
]);

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_REGEX = /^UC[A-Za-z0-9_-]{20,24}$/;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const BOT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Accept-Language': 'en-US,en;q=0.9',
};

const GENERIC_YT_META_KEYWORDS = new Set([
  'video',
  'sharing',
  'camera phone',
  'video phone',
  'free',
  'upload',
]);

async function fetchNextApi(videoId: string): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_HEADERS['User-Agent'],
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241120.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseYouTubeInput(rawInput: string): { videoId: string; isShortsUrl: boolean } | null {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length > 500) {
    return null;
  }

  if (VIDEO_ID_REGEX.test(trimmed)) {
    return { videoId: trimmed, isShortsUrl: false };
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YT_HOSTS.has(host)) {
    return null;
  }

  let candidateId: string | null = null;
  let isShortsUrl = false;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    candidateId = firstSegment;
  } else {
    const vParam = parsed.searchParams.get('v');
    if (vParam) {
      candidateId = vParam;
    } else {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(segments[0])) {
        candidateId = segments[1];
        if (segments[0] === 'shorts') {
          isShortsUrl = true;
        }
      }
    }
  }

  if (!candidateId || !VIDEO_ID_REGEX.test(candidateId)) {
    return null;
  }

  return { videoId: candidateId, isShortsUrl };
}

function extractBalancedJson(source: string, markers: string[]): Record<string, unknown> | null {
  for (const marker of markers) {
    const idx = source.indexOf(marker);
    if (idx === -1) continue;

    const startBrace = source.indexOf('{', idx + marker.length);
    if (startBrace === -1) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startBrace; i < source.length; i++) {
      const ch = source[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const slice = source.slice(startBrace, i + 1);
            try {
              return JSON.parse(slice) as Record<string, unknown>;
            } catch {
              break;
            }
          }
        }
      }
    }
  }
  return null;
}

function formatDuration(totalSeconds: number): { formatted: string; readable: string } {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatted =
    hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return { formatted, readable: parts.join(' ') };
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/(?:^|\s)(#[\p{L}\p{N}_]{2,50})/gu);
  if (!matches) return [];
  const unique = new Set<string>();
  for (const m of matches) {
    unique.add(m.trim());
  }
  return Array.from(unique);
}

function findNestedObject(
  root: unknown,
  predicate: (obj: Record<string, unknown>) => boolean,
  maxDepth = 18
): Record<string, unknown> | null {
  if (!root || typeof root !== 'object' || maxDepth <= 0) return null;

  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findNestedObject(item, predicate, maxDepth - 1);
      if (found) return found;
    }
    return null;
  }

  const record = root as Record<string, unknown>;
  if (predicate(record)) {
    return record;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      const found = findNestedObject(value, predicate, maxDepth - 1);
      if (found) return found;
    }
  }

  return null;
}

function pickLargestThumbnail(thumbnails: unknown): string | null {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
  let bestUrl: string | null = null;
  let bestWidth = -1;
  for (const t of thumbnails) {
    if (t && typeof t === 'object') {
      const item = t as { url?: unknown; width?: unknown };
      if (typeof item.url === 'string') {
        const w = typeof item.width === 'number' ? item.width : 0;
        if (w >= bestWidth) {
          bestWidth = w;
          bestUrl = item.url.startsWith('//') ? `https:${item.url}` : item.url;
        }
      }
    }
  }
  return bestUrl;
}

function decodeMetaContent(html: string, nameOrProp: string): string | null {
  const escaped = nameOrProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
    'i'
  );
  const match = html.match(regex);
  const raw = match?.[1] ?? match?.[2] ?? null;
  if (!raw) return null;
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toProxyUrl(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  try {
    const parsed = new URL(remoteUrl);
    if (parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return `/api/image-proxy?url=${encodeURIComponent(remoteUrl)}`;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchChannelAboutDetails(
  channelId: string
): Promise<Partial<ChannelDetails>> {
  if (!CHANNEL_ID_REGEX.test(channelId)) return {};

  try {
    const resp = await fetch(`https://www.youtube.com/channel/${channelId}/about?hl=en`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(5500),
    });
    if (!resp.ok) return {};
    const html = await resp.text();
    const initialData = extractBalancedJson(html, [
      'var ytInitialData = ',
      'window["ytInitialData"] = ',
    ]);
    if (!initialData) return {};

    const aboutVm = findNestedObject(
      initialData,
      (obj) =>
        typeof obj.description === 'string' &&
        ('subscriberCountText' in obj || 'joinedDateText' in obj || 'canonicalChannelUrl' in obj)
    );

    const legacyAbout = findNestedObject(
      initialData,
      (obj) => 'channelAboutFullMetadataRenderer' in obj
    )?.channelAboutFullMetadataRenderer as Record<string, unknown> | undefined;

    const bannerRenderer = findNestedObject(
      initialData,
      (obj) => 'imageBannerViewModel' in obj
    )?.imageBannerViewModel as Record<string, unknown> | undefined;

    const c4Header = findNestedObject(
      initialData,
      (obj) => 'c4TabbedHeaderRenderer' in obj
    )?.c4TabbedHeaderRenderer as Record<string, unknown> | undefined;

    const bannerSources =
      ((bannerRenderer?.image as Record<string, unknown> | undefined)?.sources as unknown[]) ??
      ((c4Header?.banner as Record<string, unknown> | undefined)?.thumbnails as unknown[]) ??
      null;

    const rawBannerUrl = pickLargestThumbnail(bannerSources);

    const avatarVm = findNestedObject(
      initialData,
      (obj) => 'decoratedAvatarViewModel' in obj
    )?.decoratedAvatarViewModel as Record<string, unknown> | undefined;

    const avatarSources =
      (((avatarVm?.avatar as Record<string, unknown> | undefined)?.avatarViewModel as Record<string, unknown> | undefined)
        ?.image as Record<string, unknown> | undefined)?.sources ??
      ((c4Header?.avatar as Record<string, unknown> | undefined)?.thumbnails as unknown[]) ??
      null;

    const rawAvatarUrl = pickLargestThumbnail(avatarSources);

    const description =
      (typeof aboutVm?.description === 'string' && aboutVm.description) ||
      ((legacyAbout?.description as Record<string, unknown> | undefined)?.simpleText as string | undefined) ||
      null;

    const subscriberCount =
      (typeof aboutVm?.subscriberCountText === 'string' && aboutVm.subscriberCountText) ||
      null;

    const videoCount =
      (typeof aboutVm?.videoCountText === 'string' && aboutVm.videoCountText) || null;

    const totalViews =
      (typeof aboutVm?.viewCountText === 'string' && aboutVm.viewCountText) ||
      ((legacyAbout?.viewCountText as Record<string, unknown> | undefined)?.simpleText as string | undefined) ||
      null;

    const country =
      (typeof aboutVm?.country === 'string' && aboutVm.country) ||
      ((legacyAbout?.country as Record<string, unknown> | undefined)?.simpleText as string | undefined) ||
      null;

    const joinedContent =
      ((aboutVm?.joinedDateText as Record<string, unknown> | undefined)?.content as string | undefined) ||
      (((legacyAbout?.joinedDateText as Record<string, unknown> | undefined)?.runs as Array<{ text?: string }> | undefined)
        ?.map((r) => r.text ?? '')
        .join('') ?? null);

    return {
      description,
      subscriberCount,
      videoCount,
      totalViews,
      country,
      joinedDate: joinedContent ? joinedContent.replace(/^Joined\s+/i, '') : null,
      bannerUrl: toProxyUrl(rawBannerUrl) ?? rawBannerUrl,
      avatarUrl: toProxyUrl(rawAvatarUrl) ?? rawAvatarUrl,
    };
  } catch {
    return {};
  }
}

async function buildThumbnails(videoId: string): Promise<ThumbnailVariant[]> {
  const specs: Array<{
    key: ThumbnailVariant['key'];
    label: string;
    width: number;
    height: number;
  }> = [
    { key: 'maxresdefault', label: 'Max Resolution (HD)', width: 1280, height: 720 },
    { key: 'sddefault', label: 'Standard Definition', width: 640, height: 480 },
    { key: 'hqdefault', label: 'High Quality', width: 480, height: 360 },
    { key: 'mqdefault', label: 'Medium Quality', width: 320, height: 180 },
    { key: 'default', label: 'Default Preview', width: 120, height: 90 },
  ];

  const checks = await Promise.allSettled(
    specs.map(async (spec) => {
      const remoteUrl = `https://i.ytimg.com/vi/${videoId}/${spec.key}.jpg`;
      let available = spec.key === 'hqdefault' || spec.key === 'mqdefault' || spec.key === 'default';
      if (spec.key === 'maxresdefault' || spec.key === 'sddefault') {
        try {
          const headRes = await fetch(remoteUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
          });
          available = headRes.ok;
        } catch {
          available = false;
        }
      }
      return {
        key: spec.key,
        label: spec.label,
        width: spec.width,
        height: spec.height,
        url: remoteUrl,
        proxyUrl: `/api/image-proxy?url=${encodeURIComponent(remoteUrl)}`,
        downloadUrl: `/api/download-thumbnail?videoId=${encodeURIComponent(videoId)}&quality=${spec.key}`,
        available,
      };
    })
  );

  return checks
    .filter((r): r is PromiseFulfilledResult<ThumbnailVariant> => r.status === 'fulfilled')
    .map((r) => r.value);
}

async function fetchVideoDetails(videoId: string, isShortsUrl: boolean): Promise<VideoDetails> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

  const [watchResult, nextData, oembedResult, thumbnails] = await Promise.all([
    fetch(watchUrl, {
      headers: BOT_HEADERS,
      signal: AbortSignal.timeout(10000),
    }),
    fetchNextApi(videoId),
    fetch(oembedUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    }).catch(() => null),
    buildThumbnails(videoId),
  ]);

  let oembedData: { title?: string; author_name?: string; author_url?: string } | null = null;
  if (oembedResult && oembedResult.ok) {
    try {
      oembedData = (await oembedResult.json()) as {
        title?: string;
        author_name?: string;
        author_url?: string;
      };
    } catch {
      oembedData = null;
    }
  }

  if (!watchResult.ok && !oembedData && !nextData) {
    throw new Error('Could not reach YouTube to retrieve video information.');
  }

  const html = watchResult.ok ? await watchResult.text() : '';
  const playerResponse = html
    ? extractBalancedJson(html, [
        'var ytInitialPlayerResponse = ',
        'window["ytInitialPlayerResponse"] = ',
      ])
    : null;
  const watchInitialData = html
    ? extractBalancedJson(html, ['var ytInitialData = ', 'window["ytInitialData"] = '])
    : null;
  const initialData = nextData ?? watchInitialData;

  const videoDetails = (playerResponse?.videoDetails ?? {}) as Record<string, unknown>;
  const microformat = (
    (playerResponse?.microformat as Record<string, unknown> | undefined)?.playerMicroformatRenderer ??
    {}
  ) as Record<string, unknown>;
  const playability = (playerResponse?.playabilityStatus ?? {}) as Record<string, unknown>;

  const primaryInfo = initialData
    ? (findNestedObject(initialData, (obj) => 'videoPrimaryInfoRenderer' in obj)
        ?.videoPrimaryInfoRenderer as Record<string, unknown> | undefined)
    : undefined;
  const secondaryInfo = initialData
    ? (findNestedObject(initialData, (obj) => 'videoSecondaryInfoRenderer' in obj)
        ?.videoSecondaryInfoRenderer as Record<string, unknown> | undefined)
    : undefined;

  const primaryTitle = Array.isArray(
    (primaryInfo?.title as Record<string, unknown> | undefined)?.runs
  )
    ? ((primaryInfo?.title as { runs: Array<{ text?: string }> }).runs
        .map((r) => r.text ?? '')
        .join('') || null)
    : null;

  const title =
    (typeof videoDetails.title === 'string' && videoDetails.title) ||
    ((microformat.title as Record<string, unknown> | undefined)?.simpleText as string | undefined) ||
    primaryTitle ||
    oembedData?.title ||
    decodeMetaContent(html, 'og:title') ||
    '';

  if (!title) {
    const reason =
      typeof playability.reason === 'string'
        ? playability.reason
        : 'Video not found, private, or unavailable.';
    throw new Error(reason);
  }

  const secondaryDesc =
    ((secondaryInfo?.attributedDescription as Record<string, unknown> | undefined)?.content as
      | string
      | undefined) ?? null;

  const description =
    (typeof videoDetails.shortDescription === 'string' && videoDetails.shortDescription) ||
    ((microformat.description as Record<string, unknown> | undefined)?.simpleText as string | undefined) ||
    secondaryDesc ||
    decodeMetaContent(html, 'og:description') ||
    '';

  const durationSeconds = Number(videoDetails.lengthSeconds ?? microformat.lengthSeconds ?? 0) || 0;
  const { formatted: durationFormatted, readable: durationReadable } = formatDuration(durationSeconds);

  const rawKeywords = Array.isArray(videoDetails.keywords)
    ? videoDetails.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    : [];

  const metaKeywordsRaw = decodeMetaContent(html, 'keywords');
  const metaKeywords = metaKeywordsRaw
    ? metaKeywordsRaw
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : [];
  const isGenericMetaOnly =
    metaKeywords.length > 0 &&
    metaKeywords.every((kw) => GENERIC_YT_META_KEYWORDS.has(kw.toLowerCase()));

  const tags = Array.from(
    new Set(rawKeywords.length > 0 ? rawKeywords : isGenericMetaOnly ? [] : metaKeywords)
  );
  const hashtags = extractHashtags(description);

  const category = typeof microformat.category === 'string' ? microformat.category : null;
  const publishDate =
    (typeof microformat.publishDate === 'string' && microformat.publishDate) ||
    (typeof microformat.uploadDate === 'string' && microformat.uploadDate) ||
    ((primaryInfo?.dateText as Record<string, unknown> | undefined)?.simpleText as string | undefined) ||
    null;

  const viewCountRaw = videoDetails.viewCount ?? microformat.viewCount;
  const viewCount =
    viewCountRaw !== undefined && viewCountRaw !== null && !Number.isNaN(Number(viewCountRaw))
      ? Number(viewCountRaw)
      : null;

  const isLiveContent = Boolean(videoDetails.isLiveContent);
  const familySafe =
    typeof microformat.isFamilySafe === 'boolean' ? microformat.isFamilySafe : null;

  // Channel info from watch/next owner renderer
  const ownerRenderer = initialData
    ? (findNestedObject(initialData, (obj) => 'videoOwnerRenderer' in obj)?.videoOwnerRenderer as
        | Record<string, unknown>
        | undefined)
    : undefined;

  const ownerBrowseId = (
    ((ownerRenderer?.navigationEndpoint as Record<string, unknown> | undefined)?.browseEndpoint as
      | Record<string, unknown>
      | undefined)?.browseId as string | undefined
  );

  const channelId =
    (typeof videoDetails.channelId === 'string' && videoDetails.channelId) ||
    (typeof microformat.externalChannelId === 'string' && microformat.externalChannelId) ||
    ownerBrowseId ||
    '';

  const ownerName = Array.isArray(
    (ownerRenderer?.title as Record<string, unknown> | undefined)?.runs
  )
    ? ((ownerRenderer?.title as { runs: Array<{ text?: string }> }).runs
        .map((r) => r.text ?? '')
        .join('') || null)
    : null;

  const channelName =
    (typeof videoDetails.author === 'string' && videoDetails.author) ||
    (typeof microformat.ownerChannelName === 'string' && microformat.ownerChannelName) ||
    ownerName ||
    oembedData?.author_name ||
    'Unknown Channel';

  const canonicalHandle = (
    ((ownerRenderer?.navigationEndpoint as Record<string, unknown> | undefined)?.browseEndpoint as
      | Record<string, unknown>
      | undefined)?.canonicalBaseUrl as string | undefined
  )?.replace(/^\//, '');

  const rawOwnerAvatar = pickLargestThumbnail(
    (ownerRenderer?.thumbnail as Record<string, unknown> | undefined)?.thumbnails
  );

  const ownerSubscribers =
    ((ownerRenderer?.subscriberCountText as Record<string, unknown> | undefined)?.simpleText as
      | string
      | undefined) ?? null;

  const ownerBadges = Array.isArray(ownerRenderer?.badges) ? ownerRenderer.badges : [];
  const verified = ownerBadges.some((badge) => {
    const renderer = (badge as Record<string, unknown>)?.metadataBadgeRenderer as
      | Record<string, unknown>
      | undefined;
    const style = typeof renderer?.style === 'string' ? renderer.style : '';
    const tooltip = typeof renderer?.tooltip === 'string' ? renderer.tooltip : '';
    return style.includes('VERIFIED') || tooltip.toLowerCase().includes('verified');
  });

  // Extract like count from structuredDescription factoid or likeButtonViewModel
  let likeCount: string | null = null;
  if (initialData) {
    const descHeader = findNestedObject(
      initialData,
      (obj) => 'videoDescriptionHeaderRenderer' in obj
    )?.videoDescriptionHeaderRenderer as Record<string, unknown> | undefined;
    const factoids = Array.isArray(descHeader?.factoid) ? descHeader.factoid : [];
    for (const f of factoids) {
      const fr = (f as Record<string, unknown>)?.factoidRenderer as
        | Record<string, unknown>
        | undefined;
      const label = (fr?.label as Record<string, unknown> | undefined)?.simpleText;
      const val = (fr?.value as Record<string, unknown> | undefined)?.simpleText;
      if (label === 'Likes' && typeof val === 'string' && val) {
        likeCount = val;
        break;
      }
    }
    if (!likeCount) {
      const likeVm = findNestedObject(
        initialData,
        (obj) => 'likeButtonViewModel' in obj
      )?.likeButtonViewModel as Record<string, unknown> | undefined;
      const toggleVm = likeVm?.toggleButtonViewModel as Record<string, unknown> | undefined;
      const defaultVm = toggleVm?.toggleButtonViewModel as Record<string, unknown> | undefined;
      const buttonVm = (
        (toggleVm?.defaultButtonViewModel as Record<string, unknown> | undefined) ??
        (defaultVm?.defaultButtonViewModel as Record<string, unknown> | undefined)
      )?.buttonViewModel as Record<string, unknown> | undefined;

      if (typeof buttonVm?.title === 'string' && buttonVm.title && buttonVm.title !== 'Like') {
        likeCount = buttonVm.title;
      }
    }
  }

  // Enrich with channel /about metadata
  const extraChannel = channelId ? await fetchChannelAboutDetails(channelId) : {};

  const channel: ChannelDetails = {
    id: channelId,
    name: channelName,
    handle: canonicalHandle && canonicalHandle.startsWith('@') ? canonicalHandle : null,
    url:
      oembedData?.author_url ||
      (canonicalHandle ? `https://www.youtube.com/${canonicalHandle}` : null) ||
      (channelId ? `https://www.youtube.com/channel/${channelId}` : watchUrl),
    avatarUrl: toProxyUrl(rawOwnerAvatar) ?? rawOwnerAvatar ?? extraChannel.avatarUrl ?? null,
    bannerUrl: extraChannel.bannerUrl ?? null,
    subscriberCount: ownerSubscribers ?? extraChannel.subscriberCount ?? null,
    videoCount: extraChannel.videoCount ?? null,
    totalViews: extraChannel.totalViews ?? null,
    country: extraChannel.country ?? null,
    joinedDate: extraChannel.joinedDate ?? null,
    description: extraChannel.description ?? null,
    verified,
  };

  const isShorts = isShortsUrl || Boolean(microformat.isShortsEligible);
  const relatedVideos = initialData ? extractRelatedVideos(initialData, videoId) : [];

  return {
    videoId,
    url: watchUrl,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    title,
    description,
    durationSeconds,
    durationFormatted,
    durationReadable,
    tags,
    hashtags,
    category,
    publishDate,
    viewCount,
    likeCount,
    isLiveContent,
    isShorts,
    familySafe,
    thumbnails,
    channel,
    relatedVideos,
    fetchedAt: new Date().toISOString(),
  };
}

function parseCompactViewCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/views?/g, '').replace(/,/g, '').trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/i);
  if (!match) return null;
  const num = Number(match[1]);
  if (Number.isNaN(num)) return null;
  const suffix = (match[2] ?? '').toLowerCase();
  if (suffix === 'k') return Math.round(num * 1_000);
  if (suffix === 'm') return Math.round(num * 1_000_000);
  if (suffix === 'b') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function extractRelatedVideos(
  initialData: Record<string, unknown>,
  currentVideoId: string
): RelatedVideo[] {
  const contents = initialData.contents as Record<string, unknown> | undefined;
  const twoCol = contents?.twoColumnWatchNextResults as Record<string, unknown> | undefined;
  const secOuter = twoCol?.secondaryResults as Record<string, unknown> | undefined;
  const secInner = secOuter?.secondaryResults as Record<string, unknown> | undefined;
  const results = Array.isArray(secInner?.results) ? secInner.results : [];

  const out: RelatedVideo[] = [];
  const seen = new Set<string>([currentVideoId]);

  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    if (rec.lockupViewModel && typeof rec.lockupViewModel === 'object') {
      const lockup = rec.lockupViewModel as Record<string, unknown>;
      const id = typeof lockup.contentId === 'string' ? lockup.contentId : '';
      const contentType = typeof lockup.contentType === 'string' ? lockup.contentType : '';
      if (!VIDEO_ID_REGEX.test(id) || seen.has(id)) continue;
      if (contentType && contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') continue;

      const metaOuter = lockup.metadata as Record<string, unknown> | undefined;
      const metaVm = metaOuter?.lockupMetadataViewModel as Record<string, unknown> | undefined;
      const title =
        ((metaVm?.title as Record<string, unknown> | undefined)?.content as string | undefined) ??
        '';
      if (!title) continue;

      const contentMeta = (
        metaVm?.metadata as Record<string, unknown> | undefined
      )?.contentMetadataViewModel as Record<string, unknown> | undefined;
      const rows = Array.isArray(contentMeta?.metadataRows) ? contentMeta.metadataRows : [];

      const getRowTexts = (idx: number): string[] => {
        const row = rows[idx] as Record<string, unknown> | undefined;
        const parts = Array.isArray(row?.metadataParts) ? row.metadataParts : [];
        return parts
          .map((p) => {
            const textObj = (p as Record<string, unknown> | undefined)?.text as
              | Record<string, unknown>
              | undefined;
            return typeof textObj?.content === 'string' ? textObj.content : '';
          })
          .filter(Boolean);
      };

      const row0 = getRowTexts(0);
      const row1 = getRowTexts(1);
      const channelName = row0[0] ?? 'YouTube Channel';
      const viewCountText = row1[0] ?? null;
      const publishedTimeText = row1[1] ?? null;

      const contentImg = lockup.contentImage as Record<string, unknown> | undefined;
      const thumbVm = contentImg?.thumbnailViewModel as Record<string, unknown> | undefined;
      const thumbSources = (thumbVm?.image as Record<string, unknown> | undefined)?.sources;
      const rawThumb =
        pickLargestThumbnail(thumbSources) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      const overlays = Array.isArray(thumbVm?.overlays) ? thumbVm.overlays : [];
      const firstOverlay = (overlays[0] as Record<string, unknown> | undefined)
        ?.thumbnailBottomOverlayViewModel as Record<string, unknown> | undefined;
      const badges = Array.isArray(firstOverlay?.badges) ? firstOverlay.badges : [];
      const badgeVm = (badges[0] as Record<string, unknown> | undefined)
        ?.thumbnailBadgeViewModel as Record<string, unknown> | undefined;
      const duration = typeof badgeVm?.text === 'string' ? badgeVm.text : null;

      seen.add(id);
      out.push({
        videoId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title,
        channelName,
        viewCountText,
        viewCount: parseCompactViewCount(viewCountText),
        publishedTimeText,
        duration,
        thumbnailUrl: toProxyUrl(rawThumb) ?? `/api/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`,
      });
    } else if (rec.compactVideoRenderer && typeof rec.compactVideoRenderer === 'object') {
      const cvr = rec.compactVideoRenderer as Record<string, unknown>;
      const id = typeof cvr.videoId === 'string' ? cvr.videoId : '';
      if (!VIDEO_ID_REGEX.test(id) || seen.has(id)) continue;

      const titleObj = cvr.title as Record<string, unknown> | undefined;
      const title =
        (typeof titleObj?.simpleText === 'string' && titleObj.simpleText) ||
        (Array.isArray(titleObj?.runs)
          ? (titleObj.runs as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
          : '');
      if (!title) continue;

      const byline = cvr.shortBylineText as Record<string, unknown> | undefined;
      const channelName =
        (Array.isArray(byline?.runs)
          ? (byline.runs as Array<{ text?: string }>)[0]?.text
          : null) ?? 'YouTube Channel';

      const viewObj = (cvr.shortViewCountText ?? cvr.viewCountText) as
        | Record<string, unknown>
        | undefined;
      const viewCountText =
        typeof viewObj?.simpleText === 'string' ? viewObj.simpleText : null;

      const pubObj = cvr.publishedTimeText as Record<string, unknown> | undefined;
      const publishedTimeText =
        typeof pubObj?.simpleText === 'string' ? pubObj.simpleText : null;

      const lenObj = cvr.lengthText as Record<string, unknown> | undefined;
      const duration = typeof lenObj?.simpleText === 'string' ? lenObj.simpleText : null;

      const rawThumb =
        pickLargestThumbnail(
          (cvr.thumbnail as Record<string, unknown> | undefined)?.thumbnails
        ) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      seen.add(id);
      out.push({
        videoId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title,
        channelName,
        viewCountText,
        viewCount: parseCompactViewCount(viewCountText),
        publishedTimeText,
        duration,
        thumbnailUrl: toProxyUrl(rawThumb) ?? `/api/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`,
      });
    }

    if (out.length >= 10) break;
  }

  return out;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to use AI creator tools.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseYouTubeChannelInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length > 500) return null;

  if (/^@[A-Za-z0-9._-]{2,60}$/.test(trimmed)) {
    return `https://www.youtube.com/${trimmed}`;
  }
  if (CHANNEL_ID_REGEX.test(trimmed)) {
    return `https://www.youtube.com/channel/${trimmed}`;
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YT_HOSTS.has(host) || host === 'youtu.be' || host === 'www.youtu.be') {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  if (segments[0].startsWith('@') && segments[0].length > 1) {
    return `https://www.youtube.com/${segments[0]}`;
  }
  if (segments.length >= 2 && segments[0] === 'channel' && CHANNEL_ID_REGEX.test(segments[1])) {
    return `https://www.youtube.com/channel/${segments[1]}`;
  }
  if (segments.length >= 2 && (segments[0] === 'c' || segments[0] === 'user')) {
    return `https://www.youtube.com/${segments[0]}/${encodeURIComponent(segments[1])}`;
  }
  return null;
}

function extractVideoRenderersFromData(
  root: unknown,
  limit = 14,
  fallbackChannelName = 'YouTube Creator'
): TrendingVideoItem[] {
  const out: TrendingVideoItem[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth <= 0 || out.length >= limit) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth - 1);
        if (out.length >= limit) return;
      }
      return;
    }

    const rec = node as Record<string, unknown>;
    if (rec.videoRenderer && typeof rec.videoRenderer === 'object') {
      const vr = rec.videoRenderer as Record<string, unknown>;
      const id = typeof vr.videoId === 'string' ? vr.videoId : '';
      if (VIDEO_ID_REGEX.test(id) && !seen.has(id)) {
        const titleObj = vr.title as Record<string, unknown> | undefined;
        const title =
          (typeof titleObj?.simpleText === 'string' && titleObj.simpleText) ||
          (Array.isArray(titleObj?.runs)
            ? (titleObj.runs as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
            : '');

        if (title) {
          const ownerObj = (vr.ownerText ?? vr.longBylineText ?? vr.shortBylineText) as
            | Record<string, unknown>
            | undefined;
          const channelName =
            (Array.isArray(ownerObj?.runs)
              ? (ownerObj.runs as Array<{ text?: string }>)[0]?.text
              : null) ?? fallbackChannelName;

          const viewObj = (vr.shortViewCountText ?? vr.viewCountText) as
            | Record<string, unknown>
            | undefined;
          const viewCountText =
            (typeof viewObj?.simpleText === 'string' && viewObj.simpleText) ||
            (Array.isArray(viewObj?.runs)
              ? (viewObj.runs as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
              : null);

          const pubObj = vr.publishedTimeText as Record<string, unknown> | undefined;
          const publishedTimeText =
            typeof pubObj?.simpleText === 'string' ? pubObj.simpleText : null;

          const lenObj = vr.lengthText as Record<string, unknown> | undefined;
          const duration = typeof lenObj?.simpleText === 'string' ? lenObj.simpleText : null;

          const rawThumb =
            pickLargestThumbnail(
              (vr.thumbnail as Record<string, unknown> | undefined)?.thumbnails
            ) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

          seen.add(id);
          out.push({
            videoId: id,
            url: `https://www.youtube.com/watch?v=${id}`,
            title,
            channelName,
            viewCountText,
            viewCount: parseCompactViewCount(viewCountText),
            publishedTimeText,
            duration,
            thumbnailUrl:
              toProxyUrl(rawThumb) ??
              `/api/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`,
          });
        }
      }
      return;
    }

    if (rec.lockupViewModel && typeof rec.lockupViewModel === 'object') {
      const lockup = rec.lockupViewModel as Record<string, unknown>;
      const id = typeof lockup.contentId === 'string' ? lockup.contentId : '';
      const contentType = typeof lockup.contentType === 'string' ? lockup.contentType : '';
      if (
        VIDEO_ID_REGEX.test(id) &&
        !seen.has(id) &&
        (!contentType || contentType === 'LOCKUP_CONTENT_TYPE_VIDEO')
      ) {
        const metaOuter = lockup.metadata as Record<string, unknown> | undefined;
        const metaVm = metaOuter?.lockupMetadataViewModel as Record<string, unknown> | undefined;
        const title =
          ((metaVm?.title as Record<string, unknown> | undefined)?.content as string | undefined) ??
          '';

        if (title) {
          const contentMeta = (
            metaVm?.metadata as Record<string, unknown> | undefined
          )?.contentMetadataViewModel as Record<string, unknown> | undefined;
          const rows = Array.isArray(contentMeta?.metadataRows) ? contentMeta.metadataRows : [];

          const rowTexts: string[] = [];
          for (const row of rows) {
            const parts = Array.isArray((row as Record<string, unknown> | undefined)?.metadataParts)
              ? ((row as Record<string, unknown>).metadataParts as Array<Record<string, unknown>>)
              : [];
            for (const p of parts) {
              const textObj = p?.text as Record<string, unknown> | undefined;
              if (typeof textObj?.content === 'string' && textObj.content) {
                rowTexts.push(textObj.content);
              }
            }
          }

          const viewCountText =
            rowTexts.find((t) => /views?/i.test(t)) ?? null;
          const publishedTimeText =
            rowTexts.find((t) => /ago|streamed/i.test(t)) ?? null;
          const channelName =
            rowTexts.find((t) => t !== viewCountText && t !== publishedTimeText) ??
            fallbackChannelName;

          const contentImg = lockup.contentImage as Record<string, unknown> | undefined;
          const thumbVm = contentImg?.thumbnailViewModel as Record<string, unknown> | undefined;
          const thumbSources = (thumbVm?.image as Record<string, unknown> | undefined)?.sources;
          const rawThumb =
            pickLargestThumbnail(thumbSources) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

          const overlays = Array.isArray(thumbVm?.overlays) ? thumbVm.overlays : [];
          const firstOverlay = (overlays[0] as Record<string, unknown> | undefined)
            ?.thumbnailBottomOverlayViewModel as Record<string, unknown> | undefined;
          const badges = Array.isArray(firstOverlay?.badges) ? firstOverlay.badges : [];
          const badgeVm = (badges[0] as Record<string, unknown> | undefined)
            ?.thumbnailBadgeViewModel as Record<string, unknown> | undefined;
          const duration = typeof badgeVm?.text === 'string' ? badgeVm.text : null;

          seen.add(id);
          out.push({
            videoId: id,
            url: `https://www.youtube.com/watch?v=${id}`,
            title,
            channelName,
            viewCountText,
            viewCount: parseCompactViewCount(viewCountText),
            publishedTimeText,
            duration,
            thumbnailUrl:
              toProxyUrl(rawThumb) ??
              `/api/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`,
          });
        }
      }
      return;
    }

    for (const val of Object.values(rec)) {
      if (val && typeof val === 'object') {
        walk(val, depth - 1);
        if (out.length >= limit) return;
      }
    }
  };

  walk(root, 30);
  return out;
}

async function fetchTrendingVideos(category: string): Promise<TrendingVideoItem[]> {
  const queryMap: Record<string, string> = {
    all: 'trending viral videos today',
    tech: 'new technology review 2026',
    gaming: 'trending gaming highlights 2026',
    music: 'top trending music video 2026',
  };
  const searchQuery = queryMap[category] ?? queryMap.all;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&sp=EgIQAQ%3D%3D&hl=en&gl=US`;

  const resp = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(9000),
  });
  if (!resp.ok) {
    throw new Error('Unable to reach YouTube trending feed.');
  }

  const html = await resp.text();
  const initialData = extractBalancedJson(html, [
    'var ytInitialData = ',
    'window["ytInitialData"] = ',
  ]);
  if (!initialData) {
    throw new Error('Could not parse YouTube feed data.');
  }

  const items = extractVideoRenderersFromData(initialData, 14);
  if (items.length === 0) {
    throw new Error('No trending videos found right now.');
  }
  return items;
}

async function fetchChannelLookup(channelUrl: string): Promise<ChannelLookupResponse> {
  const videosResp = await fetch(`${channelUrl}/videos?hl=en`, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(9000),
  });
  if (!videosResp.ok) {
    throw new Error('Channel not found or unavailable.');
  }
  const html = await videosResp.text();
  const channelIdMatch =
    html.match(/"externalId":"(UC[A-Za-z0-9_-]{20,24})"/) ??
    html.match(/"channelId":"(UC[A-Za-z0-9_-]{20,24})"/);
  const channelId = channelIdMatch?.[1] ?? '';
  if (!channelId) {
    throw new Error('Could not resolve this YouTube channel.');
  }

  const initialData = extractBalancedJson(html, [
    'var ytInitialData = ',
    'window["ytInitialData"] = ',
  ]);

  const extra = await fetchChannelAboutDetails(channelId);
  const headerObj = initialData
    ? (findNestedObject(initialData, (obj) => 'pageHeaderViewModel' in obj)?.pageHeaderViewModel as
        | Record<string, unknown>
        | undefined)
    : undefined;

  const titleFromHeader =
    ((headerObj?.title as Record<string, unknown> | undefined)?.dynamicTextViewModel as
      | Record<string, unknown>
      | undefined)?.text as Record<string, unknown> | undefined;

  const ogTitle = decodeMetaContent(html, 'og:title');
  const channelName =
    (typeof titleFromHeader?.content === 'string' && titleFromHeader.content) ||
    ogTitle ||
    'YouTube Channel';

  const handleMatch = channelUrl.match(/\/(@[A-Za-z0-9._-]+)/);
  const videos = initialData ? extractVideoRenderersFromData(initialData, 8, channelName) : [];

  const channel: ChannelDetails = {
    id: channelId,
    name: channelName,
    handle: handleMatch?.[1] ?? null,
    url: channelUrl,
    avatarUrl: extra.avatarUrl ?? null,
    bannerUrl: extra.bannerUrl ?? null,
    subscriberCount: extra.subscriberCount ?? null,
    videoCount: extra.videoCount ?? null,
    totalViews: extra.totalViews ?? null,
    country: extra.country ?? null,
    joinedDate: extra.joinedDate ?? null,
    description: extra.description ?? decodeMetaContent(html, 'og:description') ?? null,
    verified: html.includes('VERIFIED'),
  };

  return {
    channel,
    latestVideoUrl: videos[0]?.url ?? null,
    videos,
  };
}

const ALLOWED_AI_TOOLS = new Set<CreatorToolId>([
  'keyword-suggestion',
  'ai-hashtag-generator',
  'ai-tags-generator',
  'ai-channel',
  'ai-video',
]);

async function runCreatorAiTool(
  toolId: CreatorToolId,
  rawInput: string
): Promise<CreatorToolResult> {
  let contextText = rawInput.trim();
  let sourceVideoTitle: string | null = null;

  const parsedVideo = parseYouTubeInput(contextText);
  if (parsedVideo) {
    try {
      const details = await fetchVideoDetails(parsedVideo.videoId, parsedVideo.isShortsUrl);
      sourceVideoTitle = details.title;
      contextText = [
        `Video Title: ${details.title}`,
        `Channel: ${details.channel.name}`,
        details.category ? `Category: ${details.category}` : '',
        details.tags.length > 0 ? `Existing Tags: ${details.tags.slice(0, 15).join(', ')}` : '',
        details.description ? `Description Excerpt: ${details.description.slice(0, 400)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } catch {
      // Fall back to the raw input string if video metadata lookup fails
    }
  } else {
    const parsedChannel = parseYouTubeChannelInput(contextText);
    if (parsedChannel) {
      try {
        const ch = await fetchChannelLookup(parsedChannel);
        sourceVideoTitle = ch.channel.name;
        contextText = [
          `Channel Name: ${ch.channel.name}`,
          ch.channel.handle ? `Handle: ${ch.channel.handle}` : '',
          ch.channel.subscriberCount ? `Subscribers: ${ch.channel.subscriberCount}` : '',
          ch.channel.description ? `Bio: ${ch.channel.description.slice(0, 400)}` : '',
          ch.videos.length > 0
            ? `Recent Uploads: ${ch.videos.slice(0, 5).map((v) => v.title).join(' | ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
      } catch {
        // Fall back to raw channel URL
      }
    }
  }

  const promptSpecs: Record<
    Exclude<CreatorToolId, 'tags-extractor'>,
    { role: string; task: string }
  > = {
    'keyword-suggestion': {
      role: 'YouTube SEO and search keyword strategist.',
      task: 'Generate high-intent YouTube search keyword suggestions. Put 12-16 copy-ready search keywords in `items`, and group strategic insights into 2 `sections`: "Long-Tail Search Phrases" (5-6 phrases) and "High-Intent Creator Angles" (4-5 angles).',
    },
    'ai-hashtag-generator': {
      role: 'YouTube Shorts and video hashtag specialist.',
      task: 'Generate relevant YouTube hashtags (each starting with #, no spaces). Put 15 clean hashtags in `items`, and organize into 2 `sections`: "Broad Reach Hashtags" (5 hashtags) and "Niche Discovery Hashtags" (5 hashtags).',
    },
    'ai-tags-generator': {
      role: 'YouTube metadata and video tag optimization specialist.',
      task: 'Generate SEO-focused YouTube video tags (plain phrases, comma-ready, total under 480 characters). Put 14-18 tags in `items`, and organize into 2 `sections`: "Primary Topic Tags" (6 tags) and "Supporting Context Tags" (6 tags).',
    },
    'ai-channel': {
      role: 'YouTube channel growth strategist and branding advisor.',
      task: 'Analyze or ideate a YouTube channel strategy for the given channel/niche. Put 6 punchy channel name or tagline ideas in `items`, and organize into 3 `sections`: "Channel Positioning" (3 concise points), "Content Pillars" (4 series ideas), and "Bio Optimization" (2 concise bio templates).',
    },
    'ai-video': {
      role: 'YouTube packaging, CTR title, and retention script specialist.',
      task: 'Create a complete video packaging plan for the topic/video. Put 6 high-CTR title variations in `items`, and organize into 3 `sections`: "Opening Hook Ideas (First 15s)" (3 hooks), "Chapter Outline" (5 chapters), and "Thumbnail Text Concepts" (3 short 2-4 word phrases).',
    },
  };

  const spec = promptSpecs[toolId as Exclude<CreatorToolId, 'tags-extractor'>];
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze this input and produce the requested creator output:\n\n${contextText}`,
    config: {
      systemInstruction: `You are a ${spec.role} ${spec.task} Keep \`summary\` to 1-2 crisp sentences. Avoid generic filler or emojis.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Concise 1-2 sentence strategic summary.' },
          items: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Primary copyable list of keywords, hashtags, tags, or titles.',
          },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['title', 'items'],
            },
          },
        },
        required: ['summary', 'items', 'sections'],
      },
    },
  });

  const rawJson = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawJson) as {
    summary?: string;
    items?: string[];
    sections?: Array<{ title: string; items: string[] }>;
  };

  return {
    toolId,
    query: rawInput.trim(),
    summary: parsed.summary || 'Generated creator recommendations.',
    items: Array.isArray(parsed.items) ? parsed.items.filter(Boolean) : [],
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    sourceVideoTitle,
    generatedAt: new Date().toISOString(),
  };
}

async function startServer() {
  const app = express();
  app.use(
    express.json({
      limit: '16kb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  app.get('/api/public-config', (_req: Request, res: Response) => {
    const payload: PublicAppConfig = {
      maintenanceMode: appConfigStore.maintenanceMode,
      appStatus: appConfigStore.appStatus,
      announcementEnabled: appConfigStore.announcementEnabled,
      announcementMessage: appConfigStore.announcementMessage,
      aiToolsEnabled: appConfigStore.aiToolsEnabled,
      adGateEnabled: appConfigStore.adGateEnabled,
      notifications: notificationsStore.filter((n) => n.active).slice(0, 5),
    };
    res.json(payload);
  });

  app.get('/api/payments/config', (_req: Request, res: Response) => {
    const rzp = getRazorpayConfig();
    const ads = getAdSenseConfig();
    const payload: PaymentConfigStatus = {
      razorpayConfigured: rzp.configured,
      keyId: rzp.configured ? rzp.keyId : null,
      adsenseConfigured: ads.configured,
      adsenseClientId: ads.clientId,
      adsenseBannerSlot: ads.bannerSlot,
      plans: {
        monthly: { inr: PLAN_PRICING.monthly.inr, usd: PLAN_PRICING.monthly.usd },
        annual: { inr: PLAN_PRICING.annual.inr, usd: PLAN_PRICING.annual.usd },
      },
    };
    res.json(payload);
  });

  app.get('/api/payments/entitlement', async (req: Request, res: Response) => {
    const fbUser = await verifyFirebaseBearer(req);
    if (!fbUser) {
      res.status(401).json({ error: 'Authentication required to verify subscription entitlement.' });
      return;
    }
    res.json(getActiveEntitlementForUid(fbUser.uid));
  });

  app.post('/api/payments/razorpay/create-order', async (req: Request, res: Response) => {
    const fbUser = await verifyFirebaseBearer(req);
    if (!fbUser) {
      res.status(401).json({ error: 'Please sign in before purchasing ClipLens Premium.' });
      return;
    }
    if (!fbUser.emailVerified) {
      res.status(403).json({
        error: 'Please verify your email address before activating a paid subscription.',
      });
      return;
    }

    const rzp = getRazorpayConfig();
    if (!rzp.configured) {
      res.status(503).json({
        error:
          'Razorpay payment gateway is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server environment secrets.',
      });
      return;
    }

    const plan = req.body?.plan === 'annual' ? 'annual' : req.body?.plan === 'monthly' ? 'monthly' : null;
    if (!plan) {
      res.status(400).json({ error: 'Invalid subscription plan requested.' });
      return;
    }

    const spec = PLAN_PRICING[plan];
    const receipt = `cl_${crypto.randomBytes(6).toString('hex')}`;
    const authBasic = Buffer.from(`${rzp.keyId}:${rzp.keySecret}`).toString('base64');

    try {
      const rzpResp = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authBasic}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: spec.paise,
          currency: 'INR',
          receipt,
          notes: {
            uid: fbUser.uid,
            email: fbUser.email,
            plan,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      const orderData = (await rzpResp.json()) as {
        id?: string;
        amount?: number;
        currency?: string;
        error?: { description?: string };
      };
      if (!rzpResp.ok || !orderData.id) {
        res.status(502).json({
          error: orderData.error?.description || 'Failed to create Razorpay payment order.',
        });
        return;
      }

      ledgerStore.orders[orderData.id] = {
        orderId: orderData.id,
        uid: fbUser.uid,
        userEmail: fbUser.email,
        userName: fbUser.name,
        plan,
        amountPaise: spec.paise,
        currency: 'INR',
        createdAt: new Date().toISOString(),
        status: 'created',
      };
      savePersistentLedger();

      const responsePayload: RazorpayCreateOrderResponse = {
        orderId: orderData.id,
        amountPaise: spec.paise,
        currency: 'INR',
        keyId: rzp.keyId,
        plan,
        displayAmountInr: spec.inr,
      };
      res.json(responsePayload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to reach Razorpay Orders API.',
      });
    }
  });

  app.post('/api/payments/razorpay/verify', async (req: Request, res: Response) => {
    const fbUser = await verifyFirebaseBearer(req);
    if (!fbUser) {
      res.status(401).json({ error: 'Authentication required to verify payment.' });
      return;
    }

    const rzp = getRazorpayConfig();
    if (!rzp.configured) {
      res.status(503).json({ error: 'Razorpay payment gateway is not configured.' });
      return;
    }

    const orderId =
      typeof req.body?.razorpay_order_id === 'string' ? req.body.razorpay_order_id.trim() : '';
    const paymentId =
      typeof req.body?.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id.trim() : '';
    const signature =
      typeof req.body?.razorpay_signature === 'string' ? req.body.razorpay_signature.trim() : '';

    if (!orderId || !paymentId || !signature) {
      res.status(400).json({ error: 'Missing Razorpay payment verification parameters.' });
      return;
    }

    const orderRecord = ledgerStore.orders[orderId];
    if (!orderRecord) {
      res.status(404).json({ error: 'Payment order not found on server.' });
      return;
    }
    if (orderRecord.uid !== fbUser.uid) {
      res.status(403).json({ error: 'Order ownership verification failed.' });
      return;
    }

    const expectedSig = crypto
      .createHmac('sha256', rzp.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (!timingSafeCompareStrings(signature, expectedSig)) {
      pushAuditLog(`Invalid Razorpay signature for order ${orderId}`, getClientIp(req), 'denied', fbUser.email);
      res.status(400).json({ error: 'Payment signature verification failed.' });
      return;
    }

    // Independently fetch payment details from Razorpay API before unlocking Premium
    const authBasic = Buffer.from(`${rzp.keyId}:${rzp.keySecret}`).toString('base64');
    try {
      const payResp = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: { Authorization: `Basic ${authBasic}` },
          signal: AbortSignal.timeout(10000),
        }
      );
      const payData = (await payResp.json()) as {
        id?: string;
        order_id?: string;
        status?: string;
        amount?: number;
        currency?: string;
        method?: string;
        error?: { description?: string };
      };

      if (!payResp.ok || !payData.id) {
        res.status(502).json({
          error: payData.error?.description || 'Could not confirm payment status with Razorpay.',
        });
        return;
      }

      if (
        payData.order_id !== orderId ||
        payData.amount !== orderRecord.amountPaise ||
        payData.currency !== orderRecord.currency ||
        (payData.status !== 'captured' && payData.status !== 'authorized')
      ) {
        res.status(400).json({
          error: `Payment is not settled (status: ${payData.status || 'unknown'}). Premium remains locked.`,
        });
        return;
      }

      const entitlement = recordVerifiedRazorpayActivation({
        uid: fbUser.uid,
        userName: fbUser.name,
        userEmail: fbUser.email,
        orderId,
        paymentId,
        plan: orderRecord.plan,
        amountPaise: payData.amount,
        currency: payData.currency,
        paymentMethod: payData.method ? `Razorpay (${payData.method})` : 'Razorpay',
        paymentStatus: payData.status,
      });

      pushAuditLog(
        `Verified Razorpay payment ${paymentId} (${orderRecord.plan})`,
        getClientIp(req),
        'success',
        fbUser.email
      );
      res.json(entitlement);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to verify payment with Razorpay.',
      });
    }
  });

  app.post('/api/payments/razorpay/webhook', (req: Request, res: Response) => {
    const rzp = getRazorpayConfig();
    if (!rzp.webhookSecret) {
      res.status(503).json({ error: 'Razorpay webhook secret is not configured.' });
      return;
    }

    const sig = req.headers['x-razorpay-signature'];
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (typeof sig !== 'string' || !rawBody) {
      res.status(400).json({ error: 'Missing Razorpay webhook signature or payload.' });
      return;
    }

    const expected = crypto
      .createHmac('sha256', rzp.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!timingSafeCompareStrings(sig, expected)) {
      pushAuditLog('Rejected invalid Razorpay webhook signature', getClientIp(req), 'denied', 'webhook');
      res.status(400).json({ error: 'Invalid webhook signature.' });
      return;
    }

    const eventType = typeof req.body?.event === 'string' ? req.body.event : '';
    const paymentEntity = req.body?.payload?.payment?.entity as
      | {
          id?: string;
          order_id?: string;
          amount?: number;
          currency?: string;
          method?: string;
          status?: string;
          notes?: { uid?: string; email?: string; plan?: string };
        }
      | undefined;

    if (
      (eventType === 'payment.captured' || eventType === 'order.paid') &&
      paymentEntity?.id &&
      paymentEntity.order_id
    ) {
      const orderRecord = ledgerStore.orders[paymentEntity.order_id];
      const uid = orderRecord?.uid || paymentEntity.notes?.uid || '';
      const plan =
        orderRecord?.plan ||
        (paymentEntity.notes?.plan === 'annual' ? 'annual' : 'monthly');
      if (uid) {
        recordVerifiedRazorpayActivation({
          uid,
          userName: orderRecord?.userName || 'Verified User',
          userEmail: orderRecord?.userEmail || paymentEntity.notes?.email || '',
          orderId: paymentEntity.order_id,
          paymentId: paymentEntity.id,
          plan,
          amountPaise: Number(paymentEntity.amount || orderRecord?.amountPaise || 0),
          currency: paymentEntity.currency || 'INR',
          paymentMethod: paymentEntity.method ? `Razorpay (${paymentEntity.method})` : 'Razorpay',
          paymentStatus: 'captured',
        });
      }
    } else if (
      (eventType === 'refund.created' || eventType === 'payment.refunded') &&
      paymentEntity?.id
    ) {
      const txn = ledgerStore.transactions.find(
        (t) => t.paymentId === paymentEntity.id || t.id === paymentEntity.id
      );
      if (txn) {
        txn.refundStatus = 'full';
        txn.updatedAt = new Date().toISOString();
      }
      for (const sub of ledgerStore.subscriptions) {
        if (sub.razorpayPaymentId === paymentEntity.id) {
          sub.status = 'cancelled';
          sub.updatedAt = new Date().toISOString();
        }
      }
      savePersistentLedger();
    }

    res.json({ received: true });
  });

  app.post('/api/profile/sync', async (req: Request, res: Response) => {
    const fbUser = await verifyFirebaseBearer(req);
    if (!fbUser) {
      res.status(401).json({ error: 'Valid Firebase authentication token is required.' });
      return;
    }

    const name = fbUser.name || 'Creator';
    const email = fbUser.email || `${fbUser.uid}@firebase`;
    const nowIso = new Date().toISOString();
    const existing = usersStore.get(fbUser.uid) ?? usersStore.get(email);
    const entitlement = getActiveEntitlementForUid(fbUser.uid);

    if (existing) {
      if (existing.status === 'suspended') {
        res.status(403).json({ error: 'This account has been suspended by an administrator.' });
        return;
      }
      existing.id = fbUser.uid;
      existing.name = name;
      existing.email = email;
      existing.lastActiveAt = nowIso;
      existing.deviceType = detectDeviceType(req.headers['user-agent']);
      if (entitlement.isPremium && entitlement.plan) {
        existing.subscriptionPlan = entitlement.plan;
        existing.subscriptionStatus = 'active';
      }
      existing.recentActivity.unshift({ action: 'Signed in with Firebase Auth', timestamp: nowIso });
      if (existing.recentActivity.length > 20) existing.recentActivity.length = 20;
      usersStore.set(fbUser.uid, existing);
      res.json({ id: existing.id, status: existing.status, entitlement });
      return;
    }

    const user: AdminUserRecord = {
      id: fbUser.uid,
      name,
      email,
      registeredAt: nowIso,
      lastActiveAt: nowIso,
      subscriptionPlan: entitlement.isPremium && entitlement.plan ? entitlement.plan : 'free',
      subscriptionStatus: entitlement.status,
      status: 'active',
      inspectionCount: 0,
      aiToolRuns: 0,
      deviceType: detectDeviceType(req.headers['user-agent']),
      recentActivity: [{ action: 'Registered with Firebase Auth', timestamp: nowIso }],
    };
    usersStore.set(fbUser.uid, user);
    res.json({ id: user.id, status: user.status, entitlement });
  });

  app.post('/api/video-info', async (req: Request, res: Response) => {
    if (appConfigStore.maintenanceMode) {
      res.status(503).json({
        error: 'ClipLens is temporarily in maintenance mode. Please try again shortly.',
      });
      return;
    }

    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const parsed = parseYouTubeInput(rawUrl);

    if (!parsed) {
      res.status(400).json({
        error:
          'Please enter a valid YouTube video URL (for example, youtube.com/watch?v=..., youtu.be/..., or youtube.com/shorts/...).',
      });
      return;
    }

    try {
      const details = await fetchVideoDetails(parsed.videoId, parsed.isShortsUrl);
      recordFeatureAndDevice(req, 'Video Inspector');
      res.json(details);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch video metadata at this time.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/channel-info', async (req: Request, res: Response) => {
    if (appConfigStore.maintenanceMode) {
      res.status(503).json({
        error: 'ClipLens is temporarily in maintenance mode. Please try again shortly.',
      });
      return;
    }

    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const channelUrl = parseYouTubeChannelInput(rawUrl);
    if (!channelUrl) {
      res.status(400).json({
        error:
          'Please enter a valid YouTube channel URL or @handle (for example, youtube.com/@mkbhd).',
      });
      return;
    }

    try {
      const lookup = await fetchChannelLookup(channelUrl);
      recordFeatureAndDevice(req, 'Channel Analyzer');
      res.json(lookup);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch channel details right now.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/trending', async (req: Request, res: Response) => {
    const category = typeof req.query.category === 'string' ? req.query.category : 'all';
    try {
      const items = await fetchTrendingVideos(category);
      recordFeatureAndDevice(req, 'Trending Feed');
      res.json({ category, items });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to load trending videos right now.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/tools/ai', async (req: Request, res: Response) => {
    if (appConfigStore.maintenanceMode) {
      res.status(503).json({
        error: 'ClipLens is temporarily in maintenance mode. Please try again shortly.',
      });
      return;
    }
    if (!appConfigStore.aiToolsEnabled) {
      res.status(503).json({
        error: 'AI Creator Tools are currently paused by an administrator.',
      });
      return;
    }

    const toolId = typeof req.body?.toolId === 'string' ? (req.body.toolId as CreatorToolId) : null;
    const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';

    if (!toolId || !ALLOWED_AI_TOOLS.has(toolId)) {
      res.status(400).json({ error: 'Unsupported creator tool requested.' });
      return;
    }

    if (!input || input.length > 500) {
      res.status(400).json({ error: 'Please enter a topic, keyword, or YouTube URL (1–500 characters).' });
      return;
    }

    try {
      const result = await runCreatorAiTool(toolId, input);
      const featureLabelMap: Record<Exclude<CreatorToolId, 'tags-extractor'>, string> = {
        'keyword-suggestion': 'Keyword Suggestion',
        'ai-hashtag-generator': 'AI Hashtag Generator',
        'ai-tags-generator': 'AI Tags Generator',
        'ai-channel': 'AI Channel',
        'ai-video': 'AI Video',
      };
      recordFeatureAndDevice(req, featureLabelMap[toolId as Exclude<CreatorToolId, 'tags-extractor'>]);
      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to generate AI recommendations right now.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 502;
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/image-proxy', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl || rawUrl.length > 600) {
      res.status(400).send('Invalid image URL.');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid image URL.');
      return;
    }

    if (parsed.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
      res.status(403).send('Host not permitted.');
      return;
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
        redirect: 'error',
        signal: AbortSignal.timeout(7000),
      });
      if (!upstream.ok) {
        res.status(upstream.status).send('Image unavailable.');
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        res.status(415).send('Unsupported content type.');
        return;
      }
      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(502).send('Failed to fetch image.');
    }
  });

  app.get('/api/download-thumbnail', async (req: Request, res: Response) => {
    const videoId = typeof req.query.videoId === 'string' ? req.query.videoId : '';
    const quality = typeof req.query.quality === 'string' ? req.query.quality : 'hqdefault';

    if (!VIDEO_ID_REGEX.test(videoId) || !ALLOWED_THUMB_QUALITIES.has(quality)) {
      res.status(400).send('Invalid video ID or quality.');
      return;
    }

    const remoteUrl = `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
    try {
      const upstream = await fetch(remoteUrl, {
        headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) {
        res.status(404).send('Thumbnail resolution not available for this video.');
        return;
      }
      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="yt-${videoId}-${quality}.jpg"`);
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(502).send('Could not download thumbnail.');
    }
  });

  app.post('/api/monetization/event', async (req: Request, res: Response) => {
    const rawType = typeof req.body?.type === 'string' ? req.body.type : '';
    if (rawType === 'premium_monthly' || rawType === 'premium_annual') {
      res.status(403).json({
        error: 'Premium activations require server-verified payment confirmation.',
      });
      return;
    }
    if (!ALLOWED_EVENT_TYPES.has(rawType as MonetizationEventType)) {
      res.status(400).json({ error: 'Invalid event type.' });
      return;
    }

    const type = rawType as MonetizationEventType;
    let label = '';

    switch (type) {
      case 'banner_impression':
        monetizationStore.bannerImpressions += 1;
        label = 'Sponsored Banner Impression';
        break;
      case 'rewarded_ad_start':
        monetizationStore.rewardedAdStarts += 1;
        label = 'Rewarded Ad Started';
        break;
      case 'rewarded_ad_complete':
        monetizationStore.rewardedAdCompletes += 1;
        label = 'Rewarded Ad Completed';
        break;
      case 'video_inspect':
        monetizationStore.videoInspections += 1;
        label = 'Video Inspection Completed';
        break;
    }

    const entry: MonetizationLogEntry = {
      id: crypto.randomUUID(),
      type,
      label,
      estimatedUsd: 0,
      timestamp: new Date().toISOString(),
    };

    monetizationStore.recentEvents.unshift(entry);
    if (monetizationStore.recentEvents.length > 50) {
      monetizationStore.recentEvents.length = 50;
    }

    monetizationStore.eventHistory.unshift(entry);
    if (monetizationStore.eventHistory.length > 2000) {
      monetizationStore.eventHistory.length = 2000;
    }

    const fbUser = await verifyFirebaseBearer(req);
    const matchedUser = fbUser ? usersStore.get(fbUser.uid) : undefined;
    if (matchedUser) {
      matchedUser.lastActiveAt = entry.timestamp;
      if (type === 'video_inspect') {
        matchedUser.inspectionCount += 1;
        matchedUser.recentActivity.unshift({
          action: 'Inspected YouTube video',
          timestamp: entry.timestamp,
        });
      }
      if (matchedUser.recentActivity.length > 20) matchedUser.recentActivity.length = 20;
    }

    res.status(204).end();
  });

  app.use('/api/admin', noStoreAdminHeaders);

  app.get('/api/admin/status', (_req: Request, res: Response) => {
    const needsSetup = getEnvAdminPasscode().length === 0 && claimedAdminCredential === null;
    res.json({
      needsSetup,
      firebaseAdminConfigured: Boolean(firebaseAdminAuth),
      authorizedAdminEmailHint: AUTHORIZED_ADMIN_EMAIL.replace(/(.{2}).+(@.+)/, '$1***$2'),
    });
  });

  app.post('/api/admin/firebase-login', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const rate = checkLoginRateLimit(ip);
    if (!rate.allowed) {
      pushAuditLog('Admin Firebase sign-in rate-limited', ip, 'blocked');
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({
        error: `Too many failed sign-in attempts. Locked for ${Math.ceil(rate.retryAfterSec / 60)} minute(s).`,
      });
      return;
    }

    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
    const fbUser = await verifyFirebaseIdTokenString(idToken);
    if (!fbUser) {
      recordFailedLoginAttempt(ip);
      pushAuditLog('Invalid Firebase token at /admin', ip, 'denied');
      res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
      return;
    }

    if (!fbUser.emailVerified || fbUser.email !== AUTHORIZED_ADMIN_EMAIL) {
      recordFailedLoginAttempt(ip);
      pushAuditLog(`Unauthorized Firebase admin login (${fbUser.email || fbUser.uid})`, ip, 'denied', fbUser.email);
      res.status(403).json({
        error: 'Access denied. Only the authorized administrator Google account can access this dashboard.',
      });
      return;
    }

    clearLoginAttempts(ip);
    adminProfileStore.email = fbUser.email;
    if (fbUser.name) {
      adminProfileStore.displayName = fbUser.name;
    }
    const { token, expiresAt } = issueAdminBearerToken(req);
    pushAuditLog('Admin signed in via Firebase Auth', ip, 'success', fbUser.email);
    res.json({ token, role: 'admin', expiresAt });
  });

  app.post('/api/admin/setup', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const rate = checkLoginRateLimit(ip);
    if (!rate.allowed) {
      pushAuditLog('Admin initial setup rate-limited', ip, 'blocked');
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({
        error: `Too many authentication attempts. Try again in ${Math.ceil(rate.retryAfterSec / 60)} minute(s).`,
      });
      return;
    }

    if (getEnvAdminPasscode().length > 0 || claimedAdminCredential !== null) {
      res.status(409).json({ error: 'Administrator credentials are already configured.' });
      return;
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 8 || passcode.length > 128) {
      res
        .status(400)
        .json({ error: 'Administrator passcode must be between 8 and 128 characters.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hashHex = crypto.scryptSync(passcode, salt, 64).toString('hex');
    claimedAdminCredential = { salt, hashHex };
    clearLoginAttempts(ip);

    const { token, expiresAt } = issueAdminBearerToken(req);
    pushAuditLog('Administrator credentials initialized', ip, 'success');
    res.json({ token, role: 'admin', expiresAt });
  });

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const rate = checkLoginRateLimit(ip);
    if (!rate.allowed) {
      pushAuditLog('Admin sign-in rate-limited', ip, 'blocked');
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({
        error: `Too many failed sign-in attempts. Locked for ${Math.ceil(rate.retryAfterSec / 60)} minute(s).`,
      });
      return;
    }

    if (getEnvAdminPasscode().length === 0 && claimedAdminCredential === null) {
      res.status(403).json({ error: 'Administrator access has not been initialized yet.' });
      return;
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (!passcode || passcode.length > 128) {
      res.status(400).json({ error: 'A valid passcode is required.' });
      return;
    }

    if (!verifyAdminPasscode(passcode)) {
      const attempt = recordFailedLoginAttempt(ip);
      pushAuditLog('Failed admin sign-in attempt', ip, attempt.locked ? 'blocked' : 'denied');
      if (attempt.locked) {
        res.setHeader('Retry-After', String(attempt.retryAfterSec));
        res.status(429).json({
          error: `Too many failed sign-in attempts. Locked for ${Math.ceil(attempt.retryAfterSec / 60)} minute(s).`,
        });
        return;
      }
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    clearLoginAttempts(ip);
    const { token, expiresAt } = issueAdminBearerToken(req);
    pushAuditLog('Admin signed in', ip, 'success');
    res.json({ token, role: 'admin', expiresAt });
  });

  app.get(
    '/api/admin/session',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      res.json({
        authenticated: true,
        role: req.auth?.role ?? 'admin',
        expiresAt: req.auth?.expiresAt ?? null,
      });
    }
  );

  app.post(
    '/api/admin/logout',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      if (req.auth?.jti) {
        activeAdminSessions.delete(req.auth.jti);
        pushAuditLog('Admin signed out', getClientIp(req), 'success');
      }
      res.status(204).end();
    }
  );

  app.get(
    '/api/admin/revenue',
    requireAuthenticated,
    requireAdminRole,
    (_req: AuthenticatedRequest, res: Response) => {
      res.json(buildAdminRevenueSummary());
    }
  );

  app.get(
    '/api/admin/overview',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.patch(
    '/api/admin/users/:id/status',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      const targetId = String(req.params.id || '').trim();
      const nextStatus = req.body?.status === 'suspended' ? 'suspended' : req.body?.status === 'active' ? 'active' : null;
      if (!nextStatus) {
        res.status(400).json({ error: 'Status must be "active" or "suspended".' });
        return;
      }

      const found = Array.from(usersStore.values()).find((u) => u.id === targetId);
      if (!found) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      found.status = nextStatus;
      found.recentActivity.unshift({
        action: `Account ${nextStatus} by administrator`,
        timestamp: new Date().toISOString(),
      });
      pushAuditLog(`User ${found.id} marked ${nextStatus}`, getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.put(
    '/api/admin/config',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      const body = req.body ?? {};
      if (typeof body.maintenanceMode === 'boolean') {
        appConfigStore.maintenanceMode = body.maintenanceMode;
      }
      if (
        body.appStatus === 'operational' ||
        body.appStatus === 'degraded' ||
        body.appStatus === 'maintenance'
      ) {
        appConfigStore.appStatus = body.appStatus;
      } else if (appConfigStore.maintenanceMode) {
        appConfigStore.appStatus = 'maintenance';
      }
      if (typeof body.announcementEnabled === 'boolean') {
        appConfigStore.announcementEnabled = body.announcementEnabled;
      }
      if (typeof body.announcementMessage === 'string') {
        appConfigStore.announcementMessage = body.announcementMessage.trim().slice(0, 280);
      }
      if (typeof body.aiToolsEnabled === 'boolean') {
        appConfigStore.aiToolsEnabled = body.aiToolsEnabled;
      }
      if (typeof body.adGateEnabled === 'boolean') {
        appConfigStore.adGateEnabled = body.adGateEnabled;
      }
      if (
        typeof body.dailyFreeInspectLimit === 'number' &&
        Number.isFinite(body.dailyFreeInspectLimit)
      ) {
        appConfigStore.dailyFreeInspectLimit = Math.max(
          1,
          Math.min(500, Math.round(body.dailyFreeInspectLimit))
        );
      }
      appConfigStore.updatedAt = new Date().toISOString();

      pushAuditLog('Updated application configuration', getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.post(
    '/api/admin/notifications',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 100) : '';
      const message =
        typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 280) : '';
      const audience =
        req.body?.audience === 'free' || req.body?.audience === 'premium'
          ? req.body.audience
          : 'all';

      if (!title || !message) {
        res.status(400).json({ error: 'Notification title and message are required.' });
        return;
      }

      notificationsStore.unshift({
        id: `notif_${crypto.randomBytes(4).toString('hex')}`,
        title,
        message,
        audience,
        createdAt: new Date().toISOString(),
        active: true,
      });
      if (notificationsStore.length > 50) notificationsStore.length = 50;

      pushAuditLog(`Published notification "${title}"`, getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.patch(
    '/api/admin/notifications/:id',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '').trim();
      const found = notificationsStore.find((n) => n.id === id);
      if (!found) {
        res.status(404).json({ error: 'Notification not found.' });
        return;
      }
      if (typeof req.body?.active === 'boolean') {
        found.active = req.body.active;
      }
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.delete(
    '/api/admin/notifications/:id',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      const id = String(req.params.id || '').trim();
      const idx = notificationsStore.findIndex((n) => n.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'Notification not found.' });
        return;
      }
      notificationsStore.splice(idx, 1);
      pushAuditLog(`Deleted notification ${id}`, getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.patch(
    '/api/admin/profile',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      const displayName =
        typeof req.body?.displayName === 'string'
          ? req.body.displayName.trim().slice(0, 80)
          : '';
      const email =
        typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 120) : '';
      if (!displayName || !email || !email.includes('@')) {
        res.status(400).json({ error: 'Valid display name and email are required.' });
        return;
      }
      adminProfileStore.displayName = displayName;
      adminProfileStore.email = email;
      pushAuditLog('Updated administrator profile', getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.post(
    '/api/admin/change-password',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      if (getEnvAdminPasscode().length > 0) {
        res.status(409).json({
          error:
            'Passcode is managed via the ADMIN_PASSCODE environment secret. Update it in Settings > Secrets.',
        });
        return;
      }

      const currentPasscode =
        typeof req.body?.currentPasscode === 'string' ? req.body.currentPasscode.trim() : '';
      const newPasscode =
        typeof req.body?.newPasscode === 'string' ? req.body.newPasscode.trim() : '';

      if (!currentPasscode || !verifyAdminPasscode(currentPasscode)) {
        pushAuditLog('Failed passcode rotation (wrong current)', getClientIp(req), 'denied');
        res.status(401).json({ error: 'Current administrator passcode is incorrect.' });
        return;
      }

      if (newPasscode.length < 8 || newPasscode.length > 128) {
        res
          .status(400)
          .json({ error: 'New administrator passcode must be between 8 and 128 characters.' });
        return;
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hashHex = crypto.scryptSync(newPasscode, salt, 64).toString('hex');
      claimedAdminCredential = { salt, hashHex };

      // Revoke all other sessions on password rotation
      for (const jti of activeAdminSessions.keys()) {
        if (jti !== req.auth?.jti) {
          activeAdminSessions.delete(jti);
        }
      }

      pushAuditLog('Administrator passcode rotated', getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.post(
    '/api/admin/sessions/:jti/revoke',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      const targetJti = String(req.params.jti || '').trim();
      if (!activeAdminSessions.has(targetJti)) {
        res.status(404).json({ error: 'Session not found or already expired.' });
        return;
      }
      activeAdminSessions.delete(targetJti);
      pushAuditLog(`Revoked session ${targetJti.slice(0, 8)}`, getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.post(
    '/api/admin/sessions/revoke-others',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      let revoked = 0;
      for (const jti of activeAdminSessions.keys()) {
        if (jti !== req.auth?.jti) {
          activeAdminSessions.delete(jti);
          revoked += 1;
        }
      }
      pushAuditLog(`Revoked ${revoked} other admin session(s)`, getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  app.post(
    '/api/admin/adsense/sync',
    requireAuthenticated,
    requireAdminRole,
    async (req: AuthenticatedRequest, res: Response) => {
      const adsCfg = getAdSenseConfig();
      if (!adsCfg.reportingConfigured || !adsCfg.accountId || !adsCfg.accessToken) {
        res.status(400).json({
          error:
            'AdSense reporting credentials (ADSENSE_ACCOUNT_ID and ADSENSE_ACCESS_TOKEN) are not configured on the server.',
        });
        return;
      }

      try {
        const url = `https://adsense.googleapis.com/v2/accounts/${encodeURIComponent(
          adsCfg.accountId
        )}/reports:generate?dateRange=LAST_30_DAYS&metrics=ESTIMATED_EARNINGS&metrics=IMPRESSIONS&metrics=CLICKS&dimensions=DATE`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${adsCfg.accessToken}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) {
          res.status(502).json({ error: 'Failed to sync Google AdSense reporting API.' });
          return;
        }
        const report = (await resp.json()) as {
          rows?: Array<{ cells?: Array<{ value?: string }> }>;
        };
        const rows = Array.isArray(report.rows) ? report.rows : [];
        const parsedReports: VerifiedAdReportEntry[] = [];
        for (const row of rows) {
          const cells = row.cells ?? [];
          const dateKey = String(cells[0]?.value || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
          parsedReports.push({
            dateKey,
            adRevenueUsd: Number(cells[1]?.value || 0),
            adImpressions: Math.round(Number(cells[2]?.value || 0)),
            adClicks: Math.round(Number(cells[3]?.value || 0)),
          });
        }
        ledgerStore.adReports = parsedReports;
        savePersistentLedger();
        pushAuditLog(`Synced ${parsedReports.length} days of AdSense reports`, getClientIp(req), 'success');
        res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Unable to reach Google AdSense API.',
        });
      }
    }
  );

  app.post(
    '/api/admin/reset-events',
    requireAuthenticated,
    requireAdminRole,
    (req: AuthenticatedRequest, res: Response) => {
      monetizationStore.bannerImpressions = 0;
      monetizationStore.rewardedAdStarts = 0;
      monetizationStore.rewardedAdCompletes = 0;
      monetizationStore.videoInspections = 0;
      monetizationStore.recentEvents = [];
      monetizationStore.eventHistory = [];
      for (const key of Object.keys(featureUsageStore)) {
        featureUsageStore[key] = 0;
      }
      pushAuditLog('Reset telemetry event counters (verified payment ledger preserved)', getClientIp(req), 'success');
      res.json(buildAdminDashboardSnapshot(req.auth?.jti ?? ''));
    }
  );

  // Prevent search engines from indexing private admin routes
  app.use(['/admin', '/admin/*'], (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store, private');
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
