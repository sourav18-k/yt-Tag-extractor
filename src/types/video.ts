export interface ThumbnailVariant {
  key: 'maxresdefault' | 'sddefault' | 'hqdefault' | 'mqdefault' | 'default';
  label: string;
  width: number;
  height: number;
  url: string;
  proxyUrl: string;
  downloadUrl: string;
  available: boolean;
}

export interface ChannelDetails {
  id: string;
  name: string;
  handle: string | null;
  url: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: string | null;
  videoCount: string | null;
  totalViews: string | null;
  country: string | null;
  joinedDate: string | null;
  description: string | null;
  verified: boolean;
}

export interface RelatedVideo {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  viewCountText: string | null;
  viewCount: number | null;
  publishedTimeText: string | null;
  duration: string | null;
  thumbnailUrl: string;
}

export interface VideoDetails {
  videoId: string;
  url: string;
  embedUrl: string;
  title: string;
  description: string;
  durationSeconds: number;
  durationFormatted: string;
  durationReadable: string;
  tags: string[];
  hashtags: string[];
  category: string | null;
  publishDate: string | null;
  viewCount: number | null;
  likeCount: string | null;
  isLiveContent: boolean;
  isShorts: boolean;
  familySafe: boolean | null;
  thumbnails: ThumbnailVariant[];
  channel: ChannelDetails;
  relatedVideos: RelatedVideo[];
  fetchedAt: string;
}

export type ActiveTab = 'tools' | 'inspect' | 'media' | 'channel' | 'saved' | 'premium';

export type CreatorToolId =
  | 'tags-extractor'
  | 'keyword-suggestion'
  | 'ai-hashtag-generator'
  | 'ai-tags-generator'
  | 'ai-channel'
  | 'ai-video';

export interface CreatorToolSection {
  title: string;
  items: string[];
}

export interface CreatorToolResult {
  toolId: CreatorToolId;
  query: string;
  summary: string;
  items: string[];
  sections: CreatorToolSection[];
  sourceVideoTitle?: string | null;
  generatedAt: string;
}

export interface TrendingVideoItem {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  viewCountText: string | null;
  viewCount: number | null;
  publishedTimeText: string | null;
  duration: string | null;
  thumbnailUrl: string;
}

export interface ChannelLookupResponse {
  channel: ChannelDetails;
  latestVideoUrl: string | null;
  videos: TrendingVideoItem[];
}

export interface UserProfile {
  name: string;
  email: string;
  signedIn: boolean;
}

export type MonetizationEventType =
  | 'banner_impression'
  | 'rewarded_ad_start'
  | 'rewarded_ad_complete'
  | 'premium_monthly'
  | 'premium_annual'
  | 'video_inspect';

export interface MonetizationLogEntry {
  id: string;
  type: MonetizationEventType;
  label: string;
  estimatedUsd: number;
  timestamp: string;
}

export interface AdminRevenueSummary {
  counts: {
    bannerImpressions: number;
    rewardedAdStarts: number;
    rewardedAdCompletes: number;
    premiumMonthlySignups: number;
    premiumAnnualSignups: number;
    videoInspections: number;
  };
  rates: {
    rewardedEcpmUsd: number;
    bannerEcpmUsd: number;
    monthlyPriceUsd: number;
    annualPriceUsd: number;
  };
  revenue: {
    rewardedAdUsd: number;
    bannerAdUsd: number;
    advertisingTotalUsd: number;
    subscriptionUsd: number;
    monthlyRecurringRunRateUsd: number;
    totalUsd: number;
  };
  userStats: {
    videoInspections: number;
    adCompletionRatePct: number;
    premiumSubscribers: number;
    monthlySubscribers: number;
    annualSubscribers: number;
  };
  paymentStats: {
    totalTransactions: number;
    monthlyPlanRevenueUsd: number;
    annualPlanRevenueUsd: number;
    averageOrderValueUsd: number;
  };
  recentEvents: MonetizationLogEntry[];
  serverStartedAt: string;
}

export type AdminSectionId =
  | 'dashboard'
  | 'analytics'
  | 'users'
  | 'revenue'
  | 'subscriptions'
  | 'transactions'
  | 'advertisements'
  | 'app-management'
  | 'notifications'
  | 'settings'
  | 'security';

export interface AdminUserActivityItem {
  action: string;
  timestamp: string;
}

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
  lastActiveAt: string;
  subscriptionPlan: 'free' | 'monthly' | 'annual';
  subscriptionStatus: 'none' | 'active' | 'expired' | 'cancelled';
  status: 'active' | 'suspended';
  inspectionCount: number;
  aiToolRuns: number;
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown';
  recentActivity: AdminUserActivityItem[];
}

export interface AdminTransactionRecord {
  id: string;
  userId: string;
  userName: string;
  amountUsd: number;
  paymentMethod: string;
  plan: 'monthly' | 'annual';
  date: string;
  status: 'completed' | 'refunded' | 'failed';
  source: 'in_app_session' | 'gateway';
}

export interface AdminNotificationRecord {
  id: string;
  title: string;
  message: string;
  audience: 'all' | 'free' | 'premium';
  createdAt: string;
  active: boolean;
}

export interface AdminAppConfig {
  maintenanceMode: boolean;
  appStatus: 'operational' | 'degraded' | 'maintenance';
  announcementEnabled: boolean;
  announcementMessage: string;
  aiToolsEnabled: boolean;
  adGateEnabled: boolean;
  dailyFreeInspectLimit: number;
  updatedAt: string;
}

export interface AdminSessionInfo {
  jti: string;
  jtiPrefix: string;
  issuedAt: number;
  expiresAt: number;
  ip: string;
  userAgent: string;
  isCurrent: boolean;
}

export interface AdminSecurityAuditEntry {
  id: string;
  action: string;
  actor: string;
  ip: string;
  timestamp: string;
  outcome: 'success' | 'blocked' | 'denied';
}

export interface AdminTimeSeriesPoint {
  label: string;
  revenueUsd: number;
  adRevenueUsd: number;
  subscriptionRevenueUsd: number;
  newUsers: number;
  inspections: number;
}

export interface AdminIntegrationsStatus {
  databaseConnected: boolean;
  paymentGatewayConnected: boolean;
  adNetworkConnected: boolean;
  geoAnalyticsConnected: boolean;
  authMethod: 'env_secret' | 'claimed_hash';
}

export interface AdminDashboardSnapshot {
  summary: AdminRevenueSummary;
  integrations: AdminIntegrationsStatus;
  kpis: {
    totalUsers: number;
    activeUsersToday: number;
    activeUsersMonth: number;
    newUsersToday: number;
    returningUsers: number;
    totalRevenueUsd: number;
    todayRevenueUsd: number;
    weekRevenueUsd: number;
    monthRevenueUsd: number;
    yearRevenueUsd: number;
    otherRevenueUsd: number;
    premiumSubscribers: number;
    activeSubscriptions: number;
    expiredSubscriptions: number;
    cancelledSubscriptions: number;
    totalTransactions: number;
    adImpressions: number;
    adClicks: number | null;
    adCtrPct: number | null;
    deltas: {
      totalUsersPct: number | null;
      activeUsersPct: number | null;
      totalRevenuePct: number | null;
      todayRevenuePct: number | null;
      premiumSubscribersPct: number | null;
      totalTransactionsPct: number | null;
    };
  };
  series: {
    daily7: AdminTimeSeriesPoint[];
    daily30: AdminTimeSeriesPoint[];
    daily90: AdminTimeSeriesPoint[];
    monthly12: AdminTimeSeriesPoint[];
  };
  featureUsage: Array<{ feature: string; count: number }>;
  deviceBreakdown: Array<{ device: string; count: number }>;
  users: AdminUserRecord[];
  transactions: AdminTransactionRecord[];
  notifications: AdminNotificationRecord[];
  appConfig: AdminAppConfig;
  adminProfile: {
    displayName: string;
    email: string;
    role: 'admin';
    lastLoginAt: string | null;
  };
  security: {
    authMethod: 'env_secret' | 'claimed_hash';
    activeSessions: AdminSessionInfo[];
    recentAudit: AdminSecurityAuditEntry[];
    lockedIpsCount: number;
  };
  verifiedLedger?: {
    transactions: VerifiedTransactionEntry[];
    subscriptions: VerifiedSubscriptionEntry[];
  };
}

export interface PublicAppConfig {
  maintenanceMode: boolean;
  appStatus: 'operational' | 'degraded' | 'maintenance';
  announcementEnabled: boolean;
  announcementMessage: string;
  aiToolsEnabled: boolean;
  adGateEnabled: boolean;
  notifications: AdminNotificationRecord[];
}

export interface AuthUserState {
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  photoURL: string | null;
  isAdmin: boolean;
  subscriptionPlan: 'free' | 'monthly' | 'annual';
  subscriptionStatus: 'none' | 'active' | 'expired' | 'cancelled';
  status: 'active' | 'suspended';
}

export interface PaymentConfigStatus {
  razorpayConfigured: boolean;
  keyId: string | null;
  adsenseConfigured: boolean;
  adsenseClientId: string | null;
  adsenseBannerSlot: string | null;
  plans: {
    monthly: { inr: number; usd: number };
    annual: { inr: number; usd: number };
  };
}

export interface RazorpayCreateOrderResponse {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  keyId: string;
  plan: 'monthly' | 'annual';
  displayAmountInr: number;
}

export interface VerifiedEntitlementResponse {
  isPremium: boolean;
  plan: 'monthly' | 'annual' | null;
  status: 'none' | 'active' | 'expired' | 'cancelled';
  provider: 'razorpay' | null;
  expiresAt: string | null;
}

export interface VerifiedTransactionEntry {
  id: string;
  uid: string;
  userName: string;
  userEmail: string;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  amountUsdEquivalent: number;
  paymentMethod: string;
  subscriptionType: 'monthly' | 'annual';
  paymentStatus: 'captured' | 'authorized' | 'failed';
  refundStatus: 'none' | 'partial' | 'full';
  createdAt: string;
  updatedAt: string;
}

export interface VerifiedSubscriptionEntry {
  id: string;
  uid: string;
  plan: 'monthly' | 'annual';
  status: 'active' | 'expired' | 'cancelled';
  provider: 'razorpay';
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  startedAt: string;
  expiresAt: string;
  updatedAt: string;
}

