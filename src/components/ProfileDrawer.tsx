import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  Gamepad2,
  Gem,
  HelpCircle,
  LayoutGrid,
  Loader2,
  LogOut,
  MailCheck,
  Share2,
  Star,
  ThumbsUp,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import type { ActiveTab, CreatorToolId, UserProfile } from '../types/video';

type DrawerSubView = 'main' | 'rate' | 'more-apps' | 'help';
type AuthMode = 'signin' | 'signup' | 'reset';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  emailVerified?: boolean;
  photoURL?: string | null;
  onAuthSynced?: (message?: string) => void;
  onSignOut: () => void;
  isPremium: boolean;
  historyCount: number;
  onOpenPremium: () => void;
  onOpenTrending: () => void;
  onOpenGames: () => void;
  onShareApp: () => void;
  onLaunchTool: (toolId: CreatorToolId) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onOpenShortcuts: () => void;
}

const RATING_STORAGE_KEY = 'cliplens_user_rating_v1';

function mapFirebaseAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment before trying again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Popup blocked by browser. Allow popups or use email sign-in.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Email/Password sign-in is not enabled yet in Firebase Console (Authentication → Sign-in method). Use Continue with Google above.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}

export function ProfileDrawer({
  isOpen,
  onClose,
  profile,
  emailVerified = true,
  photoURL = null,
  onAuthSynced,
  onSignOut,
  isPremium,
  historyCount,
  onOpenPremium,
  onOpenTrending,
  onOpenGames,
  onShareApp,
  onLaunchTool,
  onNavigateTab,
  onOpenShortcuts,
}: ProfileDrawerProps) {
  const [subView, setSubView] = useState<DrawerSubView>('main');
  const [signInExpanded, setSignInExpanded] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [rating, setRating] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(RATING_STORAGE_KEY) || 0) || 0;
    } catch {
      return 0;
    }
  });
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  if (!isOpen) return null;

  const closeAndReset = () => {
    setSubView('main');
    setSignInExpanded(false);
    setRatingSubmitted(false);
    setAuthError(null);
    setAuthNotice(null);
    onClose();
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setSignInExpanded(false);
      onAuthSynced?.(`Signed in as ${cred.user.displayName || cred.user.email || 'Creator'}`);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);

    const cleanEmail = emailInput.trim();
    const cleanName = nameInput.trim();

    try {
      if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, cleanEmail);
        setAuthNotice(`Password reset link sent to ${cleanEmail}. Check your inbox.`);
        setAuthMode('signin');
        return;
      }

      if (authMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordInput);
        if (cleanName) {
          await updateProfile(cred.user, { displayName: cleanName });
        }
        await sendEmailVerification(cred.user).catch(() => {});
        setPasswordInput('');
        setAuthNotice(
          `Account created! We sent a verification link to ${cleanEmail}. Verify your email to sync saved videos.`
        );
        setSignInExpanded(false);
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, cleanEmail, passwordInput);
      setPasswordInput('');
      setSignInExpanded(false);
      onAuthSynced?.(`Signed in as ${cred.user.displayName || cred.user.email || 'Creator'}`);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResendVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      await sendEmailVerification(user);
      setAuthNotice(`Verification email sent to ${user.email}.`);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        setAuthNotice('Email verified! Your cloud sync is now active.');
        onAuthSynced?.('Email verified & synced');
      } else {
        setAuthError('Email is still unverified. Click the link in your inbox, then tap Refresh.');
      }
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOutClick = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      await signOut(auth);
      onSignOut();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRateSelect = (stars: number) => {
    setRating(stars);
    setRatingSubmitted(true);
    try {
      localStorage.setItem(RATING_STORAGE_KEY, String(stars));
    } catch {
      // ignore
    }
  };

  const initials = profile.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profile and creator menu"
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
    >
      {/* Backdrop tap to close */}
      <button
        type="button"
        aria-label="Close profile menu"
        onClick={closeAndReset}
        className="flex-1 cursor-default"
      />

      {/* Drawer Panel */}
      <aside className="w-full max-w-sm h-full bg-[#060908] border-l border-white/[0.08] flex flex-col shadow-2xl overflow-hidden">
        {/* Emerald Profile Banner */}
        <div className="bg-gradient-to-br from-[#0F3D2E] via-[#0B291F] to-[#081611] border-b border-white/[0.08] px-5 pt-5 pb-6 space-y-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="h-16 w-16 rounded-full bg-[#060908]/60 border-2 border-emerald-400/50 flex items-center justify-center overflow-hidden shrink-0">
              {profile.signedIn && photoURL ? (
                <img
                  src={photoURL}
                  alt={profile.name || 'Account avatar'}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : profile.signedIn && initials ? (
                <span className="font-display text-xl font-bold text-emerald-300">
                  {initials}
                </span>
              ) : (
                <User className="h-8 w-8 text-emerald-300/80" aria-hidden="true" />
              )}
            </div>

            <button
              type="button"
              onClick={closeAndReset}
              aria-label="Close profile section"
              className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 inline-flex items-center justify-center rounded-xl text-emerald-100/80 hover:text-white hover:bg-white/10 transition-colors duration-200 smooth-ease"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <h2 className="font-display text-xl font-bold text-white truncate">
                {profile.signedIn ? `Hello, ${profile.name}` : 'Hello User'}
              </h2>
              <p className="text-xs text-emerald-100/80 truncate tabular-nums">
                {profile.signedIn
                  ? `${profile.email} · ${historyCount} saved`
                  : 'Login to save your data.'}
              </p>
            </div>

            {profile.signedIn ? (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void handleSignOutClick()}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/30 px-3.5 py-2 text-xs font-semibold text-emerald-100 hover:bg-black/50 disabled:opacity-60 transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setAuthNotice(null);
                  setSignInExpanded((prev) => !prev);
                }}
                className="min-h-[40px] inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>

          {profile.signedIn && !emailVerified && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-950/50 p-3 space-y-2 text-[11px] text-amber-100">
              <p className="flex items-center gap-1.5 font-semibold">
                <MailCheck className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                Verify your email to enable cloud sync &amp; upgrades
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleResendVerification()}
                  className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-60"
                >
                  Resend Link
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleCheckVerification()}
                  className="rounded-lg border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  Refresh Status
                </button>
              </div>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/30 bg-rose-950/60 px-3 py-2 flex items-start gap-2 text-[11px] text-rose-100"
            >
              <AlertCircle className="h-3.5 w-3.5 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{authError}</span>
            </div>
          )}

          {authNotice && (
            <div
              role="status"
              className="rounded-xl border border-emerald-400/30 bg-emerald-950/60 px-3 py-2 flex items-start gap-2 text-[11px] text-emerald-100"
            >
              <Check className="h-3.5 w-3.5 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{authNotice}</span>
            </div>
          )}

          {!profile.signedIn && signInExpanded && (
            <div className="pt-3 border-t border-white/15 space-y-3">
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void handleGoogleSignIn()}
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-[#0A0F0D] hover:bg-emerald-50 disabled:opacity-60 transition-colors"
              >
                {authBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
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
                Continue with Google
              </button>

              <div className="flex items-center gap-2 text-[11px] text-emerald-100/60">
                <span className="h-px flex-1 bg-white/15" />
                <span>or email</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#060908]/70 border border-white/10">
                {(
                  [
                    ['signin', 'Sign In'],
                    ['signup', 'Create'],
                    ['reset', 'Reset'],
                  ] as Array<[AuthMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAuthMode(mode);
                      setAuthError(null);
                      setAuthNotice(null);
                    }}
                    className={`flex-1 min-h-[32px] rounded-lg text-[11px] font-semibold transition-colors ${
                      authMode === mode
                        ? 'bg-emerald-500 text-emerald-950'
                        : 'text-emerald-100/75 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={(e) => void handleEmailAuthSubmit(e)} className="space-y-2">
                {authMode === 'signup' && (
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Full name"
                    aria-label="Full name"
                    required
                    className="w-full min-h-[40px] rounded-xl border border-white/15 bg-[#060908]/80 px-3 text-xs text-white placeholder:text-emerald-200/50 focus:border-emerald-400 focus:outline-none"
                  />
                )}
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Email address"
                  aria-label="Email address"
                  required
                  className="w-full min-h-[40px] rounded-xl border border-white/15 bg-[#060908]/80 px-3 text-xs text-white placeholder:text-emerald-200/50 focus:border-emerald-400 focus:outline-none"
                />
                {authMode !== 'reset' && (
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={authMode === 'signup' ? 'Create password (min 6 chars)' : 'Password'}
                    aria-label="Password"
                    minLength={6}
                    required
                    className="w-full min-h-[40px] rounded-xl border border-white/15 bg-[#060908]/80 px-3 text-xs text-white placeholder:text-emerald-200/50 focus:border-emerald-400 focus:outline-none"
                  />
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="flex-1 min-h-[40px] rounded-xl bg-emerald-500 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 transition-colors"
                  >
                    {authBusy
                      ? 'Please wait...'
                      : authMode === 'signup'
                        ? 'Create Account'
                        : authMode === 'reset'
                          ? 'Send Reset Link'
                          : 'Sign In'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignInExpanded(false)}
                    className="min-h-[40px] px-3 rounded-xl border border-white/15 text-xs font-medium text-emerald-100 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Scrollable Menu Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {subView === 'main' && (
            <>
              {/* Premium Section */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-[#7E9288] tracking-wide">Premium</p>
                <button
                  type="button"
                  onClick={() => {
                    closeAndReset();
                    onOpenPremium();
                  }}
                  className="w-full min-h-[68px] rounded-2xl bg-[#0D1310] border border-emerald-500/25 px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#121B16] hover:border-emerald-500/45 transition-all duration-200 smooth-ease"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center shrink-0">
                      {isPremium ? (
                        <Crown className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                      ) : (
                        <Gem className="h-5 w-5 text-amber-400" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-emerald-400 truncate">
                        {isPremium ? 'Premium Active' : 'Get Premium'}
                      </p>
                      <p className="text-xs text-[#899C92] truncate">
                        {isPremium
                          ? 'Ad-free tools and instant inspect enabled'
                          : 'Remove ads & unlock features'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold shrink-0 ${
                      isPremium
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500 text-amber-950'
                    }`}
                  >
                    {isPremium ? 'ACTIVE' : 'PRO'}
                  </span>
                </button>
              </div>

              {/* Tools & Features */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#7E9288] tracking-wide">
                  Tools &amp; Features
                </p>
                <div className="rounded-2xl bg-[#0D1310] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      closeAndReset();
                      onOpenTrending();
                    }}
                    className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#121B16] transition-colors duration-200 smooth-ease"
                  >
                    <span className="inline-flex items-center gap-3 text-sm font-semibold text-[#ECF3EF]">
                      <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      Trending Videos
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      closeAndReset();
                      onOpenGames();
                    }}
                    className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#121B16] transition-colors duration-200 smooth-ease"
                  >
                    <span className="inline-flex items-center gap-3 text-sm font-semibold text-[#ECF3EF]">
                      <Gamepad2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      Play Games
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Community */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#7E9288] tracking-wide">Community</p>
                <div className="rounded-2xl bg-[#0D1310] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      onShareApp();
                    }}
                    className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#121B16] transition-colors duration-200 smooth-ease"
                  >
                    <span className="inline-flex items-center gap-3 text-sm font-semibold text-[#ECF3EF]">
                      <Share2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      Share to Friends
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubView('rate')}
                    className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#121B16] transition-colors duration-200 smooth-ease"
                  >
                    <span className="inline-flex items-center gap-3 text-sm font-semibold text-[#ECF3EF]">
                      <ThumbsUp className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      Rate ClipLens
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubView('more-apps')}
                    className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#121B16] transition-colors duration-200 smooth-ease"
                  >
                    <span className="inline-flex items-center gap-3 text-sm font-semibold text-[#ECF3EF]">
                      <LayoutGrid className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      More Apps
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Support */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#7E9288] tracking-wide">Support</p>
                <div className="rounded-2xl bg-[#0D1310] border border-white/[0.07] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSubView('help')}
                    className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#121B16] transition-colors duration-200 smooth-ease"
                  >
                    <span className="inline-flex items-center gap-3 text-sm font-semibold text-[#ECF3EF]">
                      <HelpCircle className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      Help &amp; Support
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}

          {subView === 'rate' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="min-h-[40px] inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Menu
              </button>

              <div className="rounded-2xl bg-[#0D1310] border border-white/[0.07] p-5 space-y-4 text-center">
                <ThumbsUp className="h-8 w-8 text-emerald-400 mx-auto" aria-hidden="true" />
                <div className="space-y-1">
                  <h3 className="font-display text-base font-bold text-[#ECF3EF]">
                    Enjoying ClipLens?
                  </h3>
                  <p className="text-xs text-[#899C92]">
                    Tap a star rating below to record your feedback.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRateSelect(star)}
                      aria-label={`Rate ${star} out of 5 stars`}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-[#090E0B] border border-white/[0.08] hover:border-emerald-500/40 transition-colors"
                    >
                      <Star
                        className={`h-5 w-5 ${
                          star <= rating ? 'text-amber-400 fill-amber-400' : 'text-[#4F6358]'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>

                {ratingSubmitted && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Thank you for rating ClipLens {rating}/5!
                  </p>
                )}
              </div>
            </div>
          )}

          {subView === 'more-apps' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="min-h-[40px] inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Menu
              </button>

              <div className="space-y-2">
                <h3 className="font-display text-base font-bold text-[#ECF3EF]">
                  Creator Modules
                </h3>
                <p className="text-xs text-[#899C92]">
                  Jump directly to any built-in ClipLens tool.
                </p>
              </div>

              <div className="rounded-2xl bg-[#0D1310] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
                {(
                  [
                    ['Video Tags Extractor', () => onLaunchTool('tags-extractor')],
                    ['Keyword Suggestion', () => onLaunchTool('keyword-suggestion')],
                    ['AI Hashtag Generator', () => onLaunchTool('ai-hashtag-generator')],
                    ['AI Tags Generator', () => onLaunchTool('ai-tags-generator')],
                    ['AI Channel', () => onLaunchTool('ai-channel')],
                    ['AI Video', () => onLaunchTool('ai-video')],
                    ['HD Thumbnails Downloader', () => onNavigateTab('media')],
                    ['Saved History & JSON Export', () => onNavigateTab('saved')],
                  ] as Array<[string, () => void]>
                ).map(([label, action]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      closeAndReset();
                      action();
                    }}
                    className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left text-xs sm:text-sm font-semibold text-[#ECF3EF] hover:bg-[#121B16] transition-colors"
                  >
                    <span>{label}</span>
                    <ChevronRight className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {subView === 'help' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="min-h-[40px] inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Menu
              </button>

              <div className="rounded-2xl bg-[#0D1310] border border-white/[0.07] p-4 space-y-3 text-xs text-[#C7D4CD]">
                <h3 className="font-display text-sm font-bold text-[#ECF3EF]">
                  Quick Guide
                </h3>
                <p className="leading-relaxed text-[#94A69C]">
                  Paste any YouTube video link (<code className="font-mono text-emerald-300">watch?v=</code>,{' '}
                  <code className="font-mono text-emerald-300">youtu.be/</code>,{' '}
                  <code className="font-mono text-emerald-300">/shorts/</code>) or channel{' '}
                  <code className="font-mono text-emerald-300">@handle</code> into the search bar to extract details.
                </p>
                <p className="leading-relaxed text-[#94A69C]">
                  Use the Creator Tools grid for Keyword Suggestions, AI Hashtags, AI Tags, Channel Strategy, and Video Ideas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closeAndReset();
                    onOpenShortcuts();
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-white/[0.09] bg-[#090E0B] px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-[#141E19] transition-colors"
                >
                  View Keyboard Shortcuts
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] text-center text-xs text-[#7E9288] shrink-0">
          Version 1.10.0
        </div>
      </aside>
    </div>
  );
}
