import { useState, useEffect, useRef, lazy, Suspense, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Crown,
  History,
  Image as ImageIcon,
  Keyboard,
  LayoutGrid,
  Loader2,
  MoreVertical,
  ScanSearch,
  Tv,
  X,
  Link2,
} from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type {
  ActiveTab,
  ChannelLookupResponse,
  CreatorToolId,
  MonetizationEventType,
  PaymentConfigStatus,
  PublicAppConfig,
  UserProfile,
  VideoDetails,
} from './types/video';
import { auth } from './lib/firebase';
import {
  clearUserSavedVideosFromFirestore,
  deleteUserVideoFromFirestore,
  fetchPublicConfigFromFirestore,
  listUserSavedVideos,
  logUserActivityAndCounter,
  saveUserVideoToFirestore,
  syncAuthenticatedUserToFirestore,
} from './services/firestoreService';
import {
  fetchPaymentConfig,
  fetchVerifiedEntitlement,
  startRazorpayPremiumCheckout,
} from './services/paymentService';
import { VideoOverview } from './components/VideoOverview';
import { ThumbnailsPanel } from './components/ThumbnailsPanel';
import { ChannelPanel } from './components/ChannelPanel';
import { SavedPanel } from './components/SavedPanel';
import { AdGateModal } from './components/AdGateModal';
import { SponsoredBanner } from './components/SponsoredBanner';
import { PremiumPanel } from './components/PremiumPanel';
import { ToolsHub } from './components/ToolsHub';
import { ProfileDrawer } from './components/ProfileDrawer';
import { TrendingModal } from './components/TrendingModal';
import { CreatorGameModal } from './components/CreatorGameModal';

const LazyAdminPanel = lazy(() =>
  import('./components/AdminPanel').then((mod) => ({ default: mod.AdminPanel }))
);

function isAdminPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/admin';
}

const HISTORY_STORAGE_KEY = 'cliplens_history_v1';

interface PremiumState {
  isPremium: boolean;
  plan: 'monthly' | 'annual' | null;
  expiresAt: string | null;
}

function looksLikeChannelInput(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (/^@[A-Za-z0-9._-]{2,60}$/.test(trimmed)) return true;
  if (/^UC[A-Za-z0-9_-]{20,24}$/.test(trimmed)) return true;
  return /youtube\.com\/(?:@[^/\s]+|channel\/UC[A-Za-z0-9_-]+|c\/[^/\s]+|user\/[^/\s]+)/i.test(
    trimmed
  );
}

const SAMPLE_LINKS = [
  {
    label: '3Blue1Brown · Neural Networks',
    url: 'https://www.youtube.com/watch?v=aircAruvnKk',
  },
  {
    label: 'Blender · Big Buck Bunny 4K',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  },
  {
    label: 'YouTube Developers · Player API',
    url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  },
];

function loadHistory(): VideoDetails[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VideoDetails[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [urlInput, setUrlInput] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('tools');
  const [selectedTool, setSelectedTool] = useState<CreatorToolId | null>(null);
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [history, setHistory] = useState<VideoDetails[]>(() => loadHistory());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumState, setPremiumState] = useState<PremiumState>({
    isPremium: false,
    plan: null,
    expiresAt: null,
  });
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: '',
    email: '',
    signedIn: false,
  });
  const [emailVerified, setEmailVerified] = useState(false);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigStatus | null>(null);
  const [pendingInspectUrl, setPendingInspectUrl] = useState<string | null>(null);
  const [adGateOpen, setAdGateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [trendingOpen, setTrendingOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicAppConfig | null>(null);
  const bannerReportedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const inAdminRoute = isAdminPath(pathname);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (inAdminRoute) return;
    let cancelled = false;

    void Promise.allSettled([
      fetch('/api/public-config', { cache: 'no-store' }).then((res) =>
        res.ok ? (res.json() as Promise<PublicAppConfig>) : null
      ),
      fetchPublicConfigFromFirestore(),
      fetchPaymentConfig().catch(() => null),
    ]).then(([serverCfgRes, firestoreCfgRes, paymentCfgRes]) => {
      if (cancelled) return;
      const serverCfg = serverCfgRes.status === 'fulfilled' ? serverCfgRes.value : null;
      const cloudCfg = firestoreCfgRes.status === 'fulfilled' ? firestoreCfgRes.value : null;
      const payCfg = paymentCfgRes.status === 'fulfilled' ? paymentCfgRes.value : null;

      if (payCfg) {
        setPaymentConfig(payCfg);
      }

      if (cloudCfg || serverCfg) {
        const mergedNotifs =
          cloudCfg && cloudCfg.notifications.length > 0
            ? cloudCfg.notifications
            : serverCfg?.notifications ?? [];
        setPublicConfig({
          maintenanceMode: Boolean(cloudCfg?.maintenanceMode ?? serverCfg?.maintenanceMode),
          appStatus: cloudCfg?.appStatus ?? serverCfg?.appStatus ?? 'operational',
          announcementEnabled: Boolean(
            cloudCfg?.announcementEnabled ?? serverCfg?.announcementEnabled
          ),
          announcementMessage:
            cloudCfg?.announcementMessage || serverCfg?.announcementMessage || '',
          aiToolsEnabled: cloudCfg?.aiToolsEnabled ?? serverCfg?.aiToolsEnabled ?? true,
          adGateEnabled: cloudCfg?.adGateEnabled ?? serverCfg?.adGateEnabled ?? true,
          notifications: mergedNotifs,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [inAdminRoute]);

  useEffect(() => {
    if (inAdminRoute) return;
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (!active) return;

      if (!fbUser) {
        setUserProfile({ name: '', email: '', signedIn: false });
        setEmailVerified(false);
        setPhotoURL(null);
        setPremiumState({ isPremium: false, plan: null, expiresAt: null });
        return;
      }

      const fallbackName = fbUser.displayName || fbUser.email?.split('@')[0] || 'Creator';
      const cleanEmail = (fbUser.email || '').trim().toLowerCase();
      setUserProfile({ name: fallbackName, email: cleanEmail, signedIn: true });
      setEmailVerified(Boolean(fbUser.emailVerified));
      setPhotoURL(fbUser.photoURL ?? null);

      void (async () => {
        try {
          const synced = await syncAuthenticatedUserToFirestore(fbUser);
          if (!active) return;

          if (synced.status === 'suspended') {
            await signOut(auth);
            if (active) {
              setError('This account has been suspended by an administrator.');
            }
            return;
          }

          setUserProfile({
            name: synced.displayName,
            email: synced.email,
            signedIn: true,
          });
          setEmailVerified(synced.emailVerified);
          setPhotoURL(synced.photoURL);

          const idToken = await fbUser.getIdToken();
          const syncRes = await fetch('/api/profile/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ name: synced.displayName, email: synced.email }),
          });

          if (syncRes.status === 403) {
            const payload = (await syncRes.json().catch(() => ({}))) as { error?: string };
            await signOut(auth);
            if (active) {
              setError(payload.error || 'This account has been suspended by an administrator.');
            }
            return;
          }

          const entitlement = await fetchVerifiedEntitlement();
          if (active) {
            setPremiumState({
              isPremium: entitlement.isPremium,
              plan: entitlement.isPremium ? entitlement.plan : null,
              expiresAt: entitlement.expiresAt,
            });
          }

          if (fbUser.emailVerified) {
            const cloudVideos = await listUserSavedVideos(fbUser.uid);
            if (!active) return;

            setHistory((prevLocal) => {
              const cloudIds = new Set(cloudVideos.map((v) => v.videoId));
              const localOnly = prevLocal.filter((v) => !cloudIds.has(v.videoId));
              for (const item of localOnly.slice(0, 10)) {
                void saveUserVideoToFirestore(fbUser.uid, item).catch(() => {});
              }
              return [...cloudVideos, ...localOnly].slice(0, 25);
            });
          }
        } catch {
          // Keep current session responsive even if background cloud sync hits a transient error
        }
      })();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [inAdminRoute]);

  const navigateToPublicRoot = () => {
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
      setPathname('/');
    }
  };

  const reportEvent = (type: MonetizationEventType) => {
    void (async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          headers.Authorization = `Bearer ${await currentUser.getIdToken()}`;
        } catch {
          // Proceed without auth header
        }
      }
      await fetch('/api/monetization/event', {
        method: 'POST',
        headers,
        body: JSON.stringify({ type }),
      });
    })().catch(() => {});
  };

  const persistVideoInspection = (item: VideoDetails) => {
    setHistory((prev) => [item, ...prev.filter((h) => h.videoId !== item.videoId)].slice(0, 25));
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.emailVerified) {
      void saveUserVideoToFirestore(currentUser.uid, item).catch(() => {});
      void logUserActivityAndCounter(
        currentUser.uid,
        'Inspected YouTube video',
        'inspectionCount',
        item.videoId
      ).catch(() => {});
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 25)));
    } catch {
      // Storage quota exceeded or unavailable
    }
  }, [history]);

  useEffect(() => {
    if (!inAdminRoute && !premiumState.isPremium && activeTab !== 'premium') {
      if (!bannerReportedRef.current) {
        bannerReportedRef.current = true;
        reportEvent('banner_impression');
      }
    } else {
      bannerReportedRef.current = false;
    }
  }, [inAdminRoute, premiumState.isPremium, activeTab]);

  const inspectUrl = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError('Enter or paste a YouTube video or channel URL to inspect its details.');
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (looksLikeChannelInput(trimmed)) {
        const chResp = await fetch('/api/channel-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        });
        const chData = (await chResp.json()) as ChannelLookupResponse & { error?: string };
        if (!chResp.ok) {
          throw new Error(chData.error || 'Could not retrieve channel details.');
        }

        if (chData.latestVideoUrl) {
          const vidResp = await fetch('/api/video-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: chData.latestVideoUrl }),
          });
          if (vidResp.ok) {
            const vidData = (await vidResp.json()) as VideoDetails;
            const merged: VideoDetails = {
              ...vidData,
              channel: {
                ...vidData.channel,
                ...chData.channel,
                avatarUrl: chData.channel.avatarUrl ?? vidData.channel.avatarUrl,
                bannerUrl: chData.channel.bannerUrl ?? vidData.channel.bannerUrl,
              },
            };
            setVideo(merged);
            setUrlInput(chData.channel.url);
            persistVideoInspection(merged);
            reportEvent('video_inspect');
            setActiveTab('channel');
            return;
          }
        }

        throw new Error('Channel found, but no public uploads are available to inspect.');
      }

      const response = await fetch('/api/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = (await response.json()) as VideoDetails & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Could not retrieve video details.');
      }

      setVideo(data);
      setUrlInput(data.url);
      persistVideoInspection(data);
      reportEvent('video_inspect');

      if (activeTab === 'saved' || activeTab === 'premium' || activeTab === 'tools') {
        setActiveTab('inspect');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong while fetching video details.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const requestInspect = (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError('Enter or paste a YouTube video URL to inspect its details.');
      inputRef.current?.focus();
      return;
    }

    setError(null);
    if (premiumState.isPremium || publicConfig?.adGateEnabled === false) {
      void inspectUrl(trimmed);
      return;
    }

    setPendingInspectUrl(trimmed);
    setAdGateOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    requestInspect(urlInput);
  };

  const handlePasteAction = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setUrlInput(text.trim());
        requestInspect(text.trim());
        return;
      }
    } catch {
      // Clipboard permission denied or unsupported in preview frame
    }
    inputRef.current?.focus();
  };

  const handleSelectSample = (sampleUrl: string) => {
    setUrlInput(sampleUrl);
    requestInspect(sampleUrl);
  };

  const handleAdCompleted = () => {
    const target = pendingInspectUrl;
    setAdGateOpen(false);
    setPendingInspectUrl(null);
    reportEvent('rewarded_ad_complete');
    if (target) {
      void inspectUrl(target);
    }
  };

  const handleActivatePremium = async (plan: 'monthly' | 'annual') => {
    const entitlement = await startRazorpayPremiumCheckout(plan);
    setPremiumState({
      isPremium: entitlement.isPremium,
      plan: entitlement.isPremium ? entitlement.plan : null,
      expiresAt: entitlement.expiresAt,
    });
    if (entitlement.isPremium) {
      showToast(`ClipLens Premium (${plan}) verified & activated!`);
      if (adGateOpen) {
        const target = pendingInspectUrl;
        setAdGateOpen(false);
        setPendingInspectUrl(null);
        if (target) {
          void inspectUrl(target);
        }
      }
    }
  };

  const handleSelectSaved = (saved: VideoDetails) => {
    setVideo(saved);
    setUrlInput(saved.url);
    setError(null);
    setActiveTab('inspect');
  };

  const handleRemoveSaved = (videoId: string) => {
    setHistory((prev) => prev.filter((item) => item.videoId !== videoId));
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.emailVerified) {
      void deleteUserVideoFromFirestore(currentUser.uid, videoId).catch(() => {});
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.emailVerified) {
      void clearUserSavedVideosFromFirestore(currentUser.uid).catch(() => {});
    }
  };

  const showToast = (message: string) => {
    setShortcutToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setShortcutToast(null);
      toastTimerRef.current = null;
    }, 2400);
  };

  const handleSaveShortcut = () => {
    if (!video) {
      setActiveTab('saved');
      showToast('Opened Saved History');
      return;
    }

    persistVideoInspection(video);

    try {
      const blob = new Blob([JSON.stringify(video, null, 2)], { type: 'application/json' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `youtube-${video.videoId}-details.json`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Download blocked
    }

    showToast(`Saved to History & exported youtube-${video.videoId}-details.json`);
  };

  const handleShareApp = async () => {
    const shareUrl = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'ClipLens — YouTube Creator Tools & Video Inspector',
          text: 'Inspect YouTube video details, tags, thumbnails, and AI creator tools with ClipLens.',
          url: shareUrl,
        });
        showToast('Shared ClipLens link');
        return;
      }
    } catch {
      // User dismissed native share or unsupported
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('App link copied to clipboard');
    } catch {
      showToast('Share URL: ' + shareUrl);
    }
  };

  const navItems: Array<{ id: ActiveTab; label: string; mobileLabel: string }> = [
    { id: 'tools', label: 'Tools', mobileLabel: 'Tools' },
    { id: 'inspect', label: 'Inspector', mobileLabel: 'Inspect' },
    { id: 'media', label: 'Thumbnails', mobileLabel: 'Media' },
    { id: 'channel', label: 'Channel', mobileLabel: 'Channel' },
    { id: 'saved', label: 'History', mobileLabel: 'Saved' },
  ];

  const shortcutHandlersRef = useRef({
    onInspect: () => {},
    onSave: () => {},
    onFocusUrl: () => {},
    onSelectTab: (_tab: ActiveTab) => {},
    onEscape: () => {},
    onToggleHelp: () => {},
  });

  shortcutHandlersRef.current = {
    onInspect: () => {
      if (inAdminRoute || adGateOpen || loading) return;
      requestInspect(urlInput);
    },
    onSave: () => {
      if (inAdminRoute) return;
      handleSaveShortcut();
    },
    onFocusUrl: () => {
      if (inAdminRoute) return;
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    },
    onSelectTab: (tab: ActiveTab) => {
      if (inAdminRoute) return;
      setActiveTab(tab);
    },
    onEscape: () => {
      if (profileOpen) {
        setProfileOpen(false);
      } else if (trendingOpen) {
        setTrendingOpen(false);
      } else if (gameOpen) {
        setGameOpen(false);
      } else if (shortcutsOpen) {
        setShortcutsOpen(false);
      } else if (adGateOpen) {
        setAdGateOpen(false);
        setPendingInspectUrl(null);
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    onToggleHelp: () => {
      if (inAdminRoute) return;
      setShortcutsOpen((prev) => !prev);
    },
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isAdminPath(window.location.pathname)) return;

      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'Enter') {
        e.preventDefault();
        shortcutHandlersRef.current.onInspect();
        return;
      }

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        shortcutHandlersRef.current.onSave();
        return;
      }

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        shortcutHandlersRef.current.onFocusUrl();
        return;
      }

      if (e.key === 'Escape') {
        shortcutHandlersRef.current.onEscape();
        return;
      }

      if (isEditable || mod || e.altKey) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        shortcutHandlersRef.current.onFocusUrl();
      } else if (e.key === '?') {
        e.preventDefault();
        shortcutHandlersRef.current.onToggleHelp();
      } else if (e.key === '1') {
        shortcutHandlersRef.current.onSelectTab('tools');
      } else if (e.key === '2') {
        shortcutHandlersRef.current.onSelectTab('inspect');
      } else if (e.key === '3') {
        shortcutHandlersRef.current.onSelectTab('media');
      } else if (e.key === '4') {
        shortcutHandlersRef.current.onSelectTab('channel');
      } else if (e.key === '5') {
        shortcutHandlersRef.current.onSelectTab('saved');
      } else if (e.key === '6') {
        shortcutHandlersRef.current.onSelectTab('premium');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  if (inAdminRoute) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#060908] text-[#ECF3EF] flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-[#7E9288]">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" aria-hidden="true" />
              Loading portal...
            </div>
          </div>
        }
      >
        <LazyAdminPanel onExitToApp={navigateToPublicRoot} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#060908] text-[#ECF3EF]">
      {/* Desktop Top Bar (3-zone contract) */}
      <header className="hidden md:block bg-[#0A0F0D]/90 backdrop-blur-md border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setSelectedTool(null);
              setActiveTab('tools');
            }}
            className="font-display text-xl font-bold tracking-tight text-[#ECF3EF] hover:text-emerald-400 transition-colors duration-200 smooth-ease whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md"
          >
            ClipLens
          </button>

          <nav aria-label="Primary navigation" className="flex items-center gap-7">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'tools') setSelectedTool(null);
                    setActiveTab(item.id);
                  }}
                  className={`relative py-5 text-sm font-medium transition-colors duration-200 smooth-ease whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActive
                      ? 'text-[#ECF3EF] font-semibold'
                      : 'text-[#899C92] hover:text-[#ECF3EF]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-500"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('premium')}
              className={`min-h-[40px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060908] ${
                premiumState.isPremium
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
              }`}
            >
              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
              {premiumState.isPremium ? 'Premium Active' : 'Go Premium'}
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label="Open profile and tools menu"
              className="min-h-[42px] min-w-[42px] inline-flex items-center justify-center rounded-xl border border-white/[0.09] bg-[#0D1310] text-[#C7D4CD] hover:text-emerald-300 hover:bg-[#141E19] transition-all duration-200 smooth-ease shrink-0"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Top Bar (Non-sticky to preserve scroll space & keep sticky elements <= 15%) */}
      <header className="md:hidden bg-[#0A0F0D]/90 backdrop-blur-md border-b border-white/[0.07] px-4 h-14 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedTool(null);
            setActiveTab('tools');
          }}
          className="font-display text-lg font-bold tracking-tight text-[#ECF3EF] whitespace-nowrap shrink-0"
        >
          ClipLens
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('premium')}
            className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 ${
              premiumState.isPremium
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-emerald-500 text-emerald-950'
            }`}
          >
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            {premiumState.isPremium ? 'Premium' : 'Ad-Free'}
          </button>
          <button
            type="button"
            onClick={handlePasteAction}
            className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-white/[0.09] bg-[#0D1310] px-2.5 py-1.5 text-xs font-semibold text-[#C7D4CD] active:bg-[#141E19] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Paste
          </button>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-label="Open profile menu"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-white/[0.09] bg-[#0D1310] text-[#ECF3EF] active:bg-[#141E19] transition-all duration-200 smooth-ease shrink-0"
          >
            <MoreVertical className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 pb-24 md:pb-12 space-y-6">
        {publicConfig?.maintenanceMode && (
          <div
            role="status"
            className="rounded-2xl border border-amber-500/30 bg-amber-950/35 px-4 py-3 text-xs sm:text-sm text-amber-100"
          >
            ClipLens is currently in scheduled maintenance mode. Some live lookups may be temporarily paused.
          </div>
        )}
        {!publicConfig?.maintenanceMode &&
          publicConfig?.announcementEnabled &&
          publicConfig.announcementMessage && (
            <div
              role="status"
              className="rounded-2xl border border-emerald-500/25 bg-[#0D1310] px-4 py-3 text-xs sm:text-sm text-[#ECF3EF]"
            >
              {publicConfig.announcementMessage}
            </div>
          )}

        {/* Upload / YouTube Video or Channel Link Bar */}
        <section
          aria-label="YouTube video or channel link input"
          className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-4 sm:p-6 space-y-4"
        >
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 flex items-center">
              <Link2
                className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#7E9288]"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                inputMode="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter video/channel url (youtube.com/watch?v=..., youtu.be/..., or @handle)"
                aria-label="YouTube video or channel URL"
                className="w-full min-h-[48px] rounded-xl border border-white/[0.09] bg-[#070B09] pl-10 pr-24 text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:bg-[#090E0B] focus:border-emerald-500/50 focus:outline-none transition-all duration-200 smooth-ease"
              />

              <div className="absolute right-1.5 flex items-center gap-1">
                {urlInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput('');
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear URL input"
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-[#7E9288] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePasteAction}
                  aria-label="Paste link from clipboard"
                  className="hidden sm:inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-[#94A69C] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
                >
                  Paste
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 active:scale-[0.99] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1310]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Inspecting...
                </>
              ) : (
                <>
                  <ScanSearch className="h-4 w-4" aria-hidden="true" />
                  Inspect Video
                </>
              )}
            </button>
          </form>

          {/* Sample quick-fill options & desktop keyboard shortcut hint */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#7E9288]">
              <span className="font-medium text-[#94A69C]">Try a sample:</span>
              {SAMPLE_LINKS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => handleSelectSample(sample.url)}
                  disabled={loading}
                  className="min-h-[36px] text-left font-medium text-[#94A69C] underline decoration-white/15 underline-offset-4 hover:text-emerald-400 hover:decoration-emerald-400/50 transition-colors duration-200 smooth-ease whitespace-nowrap"
                >
                  {sample.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="hidden md:inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#090E0B] px-2.5 py-1 text-[11px] font-medium text-[#94A69C] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
            >
              <Keyboard className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Ctrl+Enter Inspect · Ctrl+S Save · ?</span>
            </button>
          </div>
        </section>

        {/* Inline Sponsored Banner for Free Users (ToolsHub renders it between Popular Tool & All Tool) */}
        {!premiumState.isPremium &&
          activeTab !== 'premium' &&
          !(activeTab === 'tools' && !selectedTool) && (
            <SponsoredBanner
              onGoPremium={() => setActiveTab('premium')}
              adsenseClientId={paymentConfig?.adsenseClientId}
              adsenseBannerSlot={paymentConfig?.adsenseBannerSlot}
            />
          )}

        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 px-4 py-3.5 flex items-start justify-between gap-3 text-rose-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-rose-100">Unable to load video</p>
                <p className="text-xs sm:text-sm text-rose-200/90">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-rose-300 hover:bg-rose-500/15 transition-colors duration-200 smooth-ease shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div
            aria-busy="true"
            aria-label="Loading video details"
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <div className="lg:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] overflow-hidden p-5 sm:p-6 space-y-5 animate-pulse">
              <div className="aspect-video w-full rounded-xl bg-[#141E19]" />
              <div className="h-7 w-4/5 rounded-lg bg-[#141E19]" />
              <div className="h-4 w-2/3 rounded bg-[#141E19]" />
              <div className="space-y-2 pt-2">
                <div className="h-3.5 w-full rounded bg-[#090E0B]" />
                <div className="h-3.5 w-11/12 rounded bg-[#090E0B]" />
                <div className="h-3.5 w-3/4 rounded bg-[#090E0B]" />
              </div>
            </div>
            <div className="lg:col-span-5 space-y-6 animate-pulse">
              <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-3.5">
                  <div className="h-14 w-14 rounded-full bg-[#141E19]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 rounded bg-[#141E19]" />
                    <div className="h-3 w-1/3 rounded bg-[#090E0B]" />
                  </div>
                </div>
              </div>
              <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-3">
                <div className="h-4 w-1/3 rounded bg-[#141E19]" />
                <div className="flex flex-wrap gap-2">
                  <div className="h-9 w-20 rounded-lg bg-[#090E0B]" />
                  <div className="h-9 w-28 rounded-lg bg-[#090E0B]" />
                  <div className="h-9 w-24 rounded-lg bg-[#090E0B]" />
                  <div className="h-9 w-16 rounded-lg bg-[#090E0B]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Tab Views */}
        {!loading && activeTab === 'tools' && (
          <ToolsHub
            currentVideo={video}
            urlInput={urlInput}
            isPremium={premiumState.isPremium}
            selectedTool={selectedTool}
            adsenseClientId={paymentConfig?.adsenseClientId}
            adsenseBannerSlot={paymentConfig?.adsenseBannerSlot}
            onSelectTool={setSelectedTool}
            onGoPremium={() => setActiveTab('premium')}
            onVideoExtracted={(extracted) => {
              setVideo(extracted);
              setUrlInput(extracted.url);
              persistVideoInspection(extracted);
              reportEvent('video_inspect');
            }}
            onAiToolCompleted={(toolId) => {
              const currentUser = auth.currentUser;
              if (currentUser && currentUser.emailVerified) {
                void logUserActivityAndCounter(
                  currentUser.uid,
                  `Ran ${toolId}`,
                  'aiToolRuns',
                  toolId
                ).catch(() => {});
              }
            }}
          />
        )}

        {!loading && activeTab === 'premium' && (
          <PremiumPanel
            isPremium={premiumState.isPremium}
            premiumPlan={premiumState.plan}
            expiresAt={premiumState.expiresAt}
            isSignedIn={userProfile.signedIn}
            emailVerified={emailVerified}
            paymentConfig={paymentConfig}
            onActivatePremium={handleActivatePremium}
            onOpenSignIn={() => setProfileOpen(true)}
          />
        )}

        {!loading && activeTab === 'saved' && (
          <SavedPanel
            currentVideo={video}
            history={history}
            onSelectVideo={handleSelectSaved}
            onRemoveVideo={handleRemoveSaved}
            onClearHistory={handleClearHistory}
          />
        )}

        {!loading &&
          activeTab !== 'tools' &&
          activeTab !== 'saved' &&
          activeTab !== 'premium' &&
          !video && (
            <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-6 sm:p-10 space-y-6">
              <div className="max-w-2xl space-y-3">
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#ECF3EF] text-balance">
                  Extract every detail from any YouTube video link
                </h1>
                <p className="text-sm sm:text-base text-[#94A69C] leading-relaxed">
                  Paste a standard YouTube URL, short link, Shorts URL, or channel handle above to
                  inspect its full metadata, download high-resolution thumbnails, copy embedded
                  tags, and view channel details.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-6 border-t border-white/[0.06]">
                <div className="space-y-1">
                  <h2 className="font-display text-sm font-semibold text-emerald-400">
                    01. Title &amp; Description
                  </h2>
                  <p className="text-xs leading-relaxed text-[#94A69C]">
                    Reads full video titles, complete descriptions with clickable links and
                    timestamps, and publish dates.
                  </p>
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-sm font-semibold text-emerald-400">
                    02. Multi-Size Thumbnails
                  </h2>
                  <p className="text-xs leading-relaxed text-[#94A69C]">
                    Checks availability across 1280×720 HD down to 120×90 preview sizes with one-tap
                    JPG downloads.
                  </p>
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-sm font-semibold text-emerald-400">
                    03. Tags, Duration &amp; Channel
                  </h2>
                  <p className="text-xs leading-relaxed text-[#94A69C]">
                    Surfaces hidden creator tags, exact video duration, subscriber count, handle,
                    and channel bio.
                  </p>
                </div>
              </div>
            </section>
          )}

        {!loading && video && activeTab === 'inspect' && (
          <VideoOverview
            video={video}
            history={history}
            onNavigateTab={setActiveTab}
            onInspectVideo={(targetUrl) => {
              setUrlInput(targetUrl);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              requestInspect(targetUrl);
            }}
          />
        )}

        {!loading && video && activeTab === 'media' && <ThumbnailsPanel video={video} />}

        {!loading && video && activeTab === 'channel' && <ChannelPanel video={video} />}
      </main>

      {/* Shortcut Toast Notification */}
      {shortcutToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-2 rounded-xl bg-[#101814] border border-emerald-500/30 px-4 py-2.5 text-xs font-medium text-[#ECF3EF] shadow-xl"
        >
          <Check className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{shortcutToast}</span>
        </div>
      )}

      {/* Keyboard Shortcuts Reference Modal */}
      {shortcutsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md bg-[#0D1310] rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <h2 id="shortcuts-title" className="font-display text-base font-bold text-[#ECF3EF]">
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                aria-label="Close shortcuts dialog"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[#7E9288] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <dl className="divide-y divide-white/[0.06] px-5 py-2 text-xs sm:text-sm">
              {[
                ['Ctrl / Cmd + Enter', 'Inspect current YouTube URL'],
                ['Ctrl / Cmd + S', 'Save to History & export JSON'],
                ['Ctrl / Cmd + K  or  /', 'Focus & select URL input'],
                ['1 – 5', 'Tools, Inspector, Thumbnails, Channel, History'],
                ['6', 'Premium Plans'],
                ['?', 'Toggle this shortcuts dialog'],
                ['Esc', 'Close active drawer or dialog'],
              ].map(([keys, desc]) => (
                <div key={keys} className="py-3 flex items-center justify-between gap-4">
                  <dt className="text-[#94A69C]">{desc}</dt>
                  <dd className="shrink-0">
                    <kbd className="rounded-lg border border-white/[0.1] bg-[#070B09] px-2 py-1 font-mono text-[11px] font-medium text-emerald-300">
                      {keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* Profile Drawer triggered by Three Dots button */}
      <ProfileDrawer
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={userProfile}
        emailVerified={emailVerified}
        photoURL={photoURL}
        onAuthSynced={(message) => {
          if (message) showToast(message);
        }}
        onSignOut={() => {
          showToast('Signed out');
        }}
        isPremium={premiumState.isPremium}
        historyCount={history.length}
        onOpenPremium={() => setActiveTab('premium')}
        onOpenTrending={() => setTrendingOpen(true)}
        onOpenGames={() => setGameOpen(true)}
        onShareApp={() => void handleShareApp()}
        onLaunchTool={(toolId) => {
          setSelectedTool(toolId);
          setActiveTab('tools');
        }}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      {/* Trending Videos Modal */}
      <TrendingModal
        isOpen={trendingOpen}
        onClose={() => setTrendingOpen(false)}
        onInspectVideo={(targetUrl) => {
          setUrlInput(targetUrl);
          requestInspect(targetUrl);
        }}
      />

      {/* Creator View Count Duel Mini-Game */}
      <CreatorGameModal
        isOpen={gameOpen}
        onClose={() => setGameOpen(false)}
        history={history}
        onInspectVideo={(targetUrl) => {
          setUrlInput(targetUrl);
          requestInspect(targetUrl);
        }}
      />

      {/* Rewarded Ad / Premium Upgrade Gate Modal */}
      <AdGateModal
        isOpen={adGateOpen}
        pendingUrl={pendingInspectUrl ?? ''}
        isSignedIn={userProfile.signedIn}
        emailVerified={emailVerified}
        paymentConfig={paymentConfig}
        onClose={() => {
          setAdGateOpen(false);
          setPendingInspectUrl(null);
        }}
        onAdStarted={() => reportEvent('rewarded_ad_start')}
        onAdCompleted={handleAdCompleted}
        onActivatePremium={handleActivatePremium}
        onOpenSignIn={() => setProfileOpen(true)}
      />

      {/* Mobile Fixed Bottom Tab Bar (Thumb-Zone Navigation) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0A0F0D]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe"
      >
        <div className="grid grid-cols-5 h-14 items-center">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const IconComponent =
              item.id === 'tools'
                ? LayoutGrid
                : item.id === 'inspect'
                  ? ScanSearch
                  : item.id === 'media'
                    ? ImageIcon
                    : item.id === 'channel'
                      ? Tv
                      : History;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'tools') setSelectedTool(null);
                  setActiveTab(item.id);
                }}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 smooth-ease whitespace-nowrap ${
                  isActive ? 'text-emerald-400' : 'text-[#7E9288] active:text-[#ECF3EF]'
                }`}
              >
                <IconComponent className="h-5 w-5" aria-hidden="true" />
                <span className="text-[11px] font-medium tracking-tight">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
