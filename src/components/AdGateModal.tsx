import { useState, useEffect } from 'react';
import { AlertCircle, Crown, Loader2, Play, X, Check, ArrowRight, Volume2, VolumeX, Sparkles } from 'lucide-react';
import type { PaymentConfigStatus } from '../types/video';

interface AdGateModalProps {
  isOpen: boolean;
  pendingUrl: string;
  isSignedIn?: boolean;
  emailVerified?: boolean;
  paymentConfig?: PaymentConfigStatus | null;
  onClose: () => void;
  onAdStarted?: () => void;
  onAdCompleted: () => void;
  onActivatePremium: (plan: 'monthly' | 'annual') => Promise<void> | void;
  onOpenSignIn?: () => void;
}

type GateStage = 'choose' | 'watching-ad' | 'upgrade';

const SPONSOR_ADS = [
  {
    advertiser: 'FrameCraft Studio',
    headline: 'Batch-resize YouTube thumbnails & chapter cards in one click.',
    ctaText: 'Explore Studio Tools',
    tagline: 'Creator Workflow Suite · Free 14-day trial',
  },
  {
    advertiser: 'AudioPulse Mastering',
    headline: 'Broadcast-loudness (-14 LUFS) voice mastering built for video creators.',
    ctaText: 'Try Audio Mastering',
    tagline: 'Clean vocal clarity for Shorts & long-form uploads',
  },
];

export function AdGateModal({
  isOpen,
  pendingUrl,
  isSignedIn = false,
  emailVerified = false,
  paymentConfig = null,
  onClose,
  onAdStarted,
  onAdCompleted,
  onActivatePremium,
  onOpenSignIn,
}: AdGateModalProps) {
  const [stage, setStage] = useState<GateStage>('choose');
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [muted, setMuted] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [adIndex, setAdIndex] = useState(0);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage('choose');
      setSecondsLeft(5);
      setUpgradeError(null);
      setUpgrading(false);
      setAdIndex((prev) => (prev + 1) % SPONSOR_ADS.length);
    }
  }, [isOpen, pendingUrl]);

  useEffect(() => {
    if (!isOpen || stage !== 'watching-ad') return;
    if (secondsLeft <= 0) return;

    const timer = window.setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isOpen, stage, secondsLeft]);

  if (!isOpen) return null;

  const monthlyInr = paymentConfig?.plans.monthly.inr ?? 399;
  const annualInr = paymentConfig?.plans.annual.inr ?? 3299;

  const handlePayAndInspect = async () => {
    setUpgradeError(null);
    if (!isSignedIn) {
      onClose();
      onOpenSignIn?.();
      return;
    }
    if (!emailVerified) {
      setUpgradeError('Verify your email address in the profile drawer before purchasing Premium.');
      return;
    }

    setUpgrading(true);
    try {
      await onActivatePremium(selectedPlan);
    } catch (err) {
      setUpgradeError(
        err instanceof Error ? err.message : 'Unable to verify payment. Please try again.'
      );
    } finally {
      setUpgrading(false);
    }
  };

  const activeAd = SPONSOR_ADS[adIndex];
  const progressPercent = Math.round(((5 - secondsLeft) / 5) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-gate-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg bg-[#0D1310] rounded-t-3xl sm:rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/[0.07]">
          <div>
            <h2
              id="ad-gate-title"
              className="font-display text-base sm:text-lg font-bold text-[#ECF3EF]"
            >
              {stage === 'choose' && 'Choose How to Inspect'}
              {stage === 'watching-ad' && 'Sponsored Video Ad'}
              {stage === 'upgrade' && 'Upgrade to ClipLens Premium'}
            </h2>
            {stage === 'choose' && (
              <p className="text-xs text-[#7E9288] mt-0.5 truncate max-w-[260px] sm:max-w-sm">
                Target: {pendingUrl}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#7E9288] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Stage 1: Two Options (1. Watch Ad, 2. Upgrade to Premium) */}
        {stage === 'choose' && (
          <div className="p-5 sm:p-6 space-y-4">
            <p className="text-sm text-[#94A69C] leading-relaxed">
              Watch a short 5-second sponsored message to inspect this video for free, or upgrade to
              Premium for instant ad-free inspections.
            </p>

            <div className="space-y-3">
              {/* Option 1: Watch Ad */}
              <button
                type="button"
                onClick={() => {
                  setSecondsLeft(5);
                  setStage('watching-ad');
                  onAdStarted?.();
                }}
                className="w-full min-h-[72px] flex items-center justify-between gap-4 rounded-2xl border border-white/[0.09] bg-[#090E0B] px-4 sm:px-5 py-4 text-left hover:bg-[#141E19] hover:border-white/[0.16] transition-all duration-200 smooth-ease group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-11 w-11 rounded-xl bg-[#16221C] border border-white/[0.08] text-emerald-400 flex items-center justify-center shrink-0">
                    <Play className="h-5 w-5 fill-emerald-400" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm sm:text-base font-semibold text-[#ECF3EF]">
                      1. Watch Ad
                    </p>
                    <p className="text-xs text-[#7E9288] mt-0.5">
                      Free · 5-second sponsored preview unlocks full details
                    </p>
                  </div>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-[#7E9288] group-hover:text-emerald-400 shrink-0 transition-colors duration-200 smooth-ease"
                  aria-hidden="true"
                />
              </button>

              {/* Option 2: Upgrade to Premium */}
              <button
                type="button"
                onClick={() => setStage('upgrade')}
                className="w-full min-h-[72px] flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 sm:px-5 py-4 text-left hover:bg-emerald-500/[0.12] hover:border-emerald-500/50 transition-all duration-200 smooth-ease group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-11 w-11 rounded-xl bg-emerald-500 text-emerald-950 flex items-center justify-center shrink-0">
                    <Crown className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm sm:text-base font-semibold text-[#ECF3EF]">
                      2. Upgrade to Premium
                    </p>
                    <p className="text-xs text-[#94A69C] mt-0.5">
                      Zero ads · Instant unlimited inspections from $3.33/mo
                    </p>
                  </div>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-emerald-400 group-hover:text-emerald-300 shrink-0 transition-colors duration-200 smooth-ease"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: Rewarded Ad Playback */}
        {stage === 'watching-ad' && (
          <div className="p-5 sm:p-6 space-y-5">
            <div className="relative rounded-2xl overflow-hidden bg-[#060908] border border-emerald-500/20 text-[#ECF3EF] p-5 sm:p-6 space-y-5">
              {/* Top Ad Meta Row */}
              <div className="flex items-center justify-between gap-3 text-xs text-[#94A69C]">
                <span>
                  Sponsored · {activeAd.advertiser}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? 'Unmute ad audio' : 'Mute ad audio'}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-[#141E19] hover:bg-[#1B2922] text-[#ECF3EF] transition-colors duration-200 smooth-ease"
                  >
                    {muted ? (
                      <VolumeX className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    )}
                  </button>
                  <span className="font-mono font-medium bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 px-2.5 py-1 rounded-lg tabular-nums">
                    {secondsLeft > 0 ? `Reward in ${secondsLeft}s` : 'Reward ready'}
                  </span>
                </div>
              </div>

              {/* Ad Creative Content */}
              <div className="space-y-2 py-2">
                <p className="font-display text-lg sm:text-xl font-bold leading-snug text-[#ECF3EF]">
                  {activeAd.headline}
                </p>
                <p className="text-xs sm:text-sm text-[#94A69C]">
                  {activeAd.tagline}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-1.5 w-full rounded-full bg-white/[0.1] overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500 smooth-ease"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStage('upgrade')}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#090E0B] px-4 py-2 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease"
              >
                <Crown className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                Skip Ads with Premium
              </button>

              <button
                type="button"
                disabled={secondsLeft > 0}
                onClick={onAdCompleted}
                className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:bg-[#141E19] disabled:text-[#7E9288] transition-all duration-200 smooth-ease"
              >
                {secondsLeft > 0 ? (
                  <span className="font-mono tabular-nums">
                    Unlocking in {secondsLeft}s...
                  </span>
                ) : (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Continue to Video Details
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Stage 3: Upgrade to Premium */}
        {stage === 'upgrade' && (
          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-1 p-1 bg-[#090E0B] border border-white/[0.07] rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedPlan('monthly')}
                className={`flex-1 min-h-[40px] rounded-lg text-xs font-semibold transition-all duration-200 smooth-ease ${
                  selectedPlan === 'monthly'
                    ? 'bg-[#16221C] text-emerald-300 border border-emerald-500/30'
                    : 'text-[#899C92] hover:text-[#ECF3EF]'
                }`}
              >
                {paymentConfig?.razorpayConfigured
                  ? `Monthly · ₹${monthlyInr}/mo`
                  : 'Monthly · $4.99/mo'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlan('annual')}
                className={`flex-1 min-h-[40px] rounded-lg text-xs font-semibold transition-all duration-200 smooth-ease ${
                  selectedPlan === 'annual'
                    ? 'bg-[#16221C] text-emerald-300 border border-emerald-500/30'
                    : 'text-[#899C92] hover:text-[#ECF3EF]'
                }`}
              >
                {paymentConfig?.razorpayConfigured
                  ? `Annual · ₹${annualInr.toLocaleString('en-IN')}/yr (Save 31%)`
                  : 'Annual · $39.99/yr (Save 33%)'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#090E0B] p-4 sm:p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-base font-bold text-[#ECF3EF]">
                  ClipLens Premium
                </span>
                <span className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
                  {paymentConfig?.razorpayConfigured
                    ? selectedPlan === 'annual'
                      ? `₹${annualInr.toLocaleString('en-IN')}/yr`
                      : `₹${monthlyInr}/mo`
                    : selectedPlan === 'annual'
                      ? '$3.33/mo'
                      : '$4.99/mo'}
                </span>
              </div>

              <ul className="space-y-2 text-xs sm:text-sm text-[#C7D4CD]">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  Instant video inspections with zero ad breaks
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  Removes all sponsored banners across the workspace
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  Full JSON &amp; Markdown report exports enabled
                </li>
              </ul>
            </div>

            {upgradeError && (
              <div
                role="alert"
                className="rounded-xl border border-emerald-500/25 bg-[#090E0B] px-3.5 py-2.5 flex items-start gap-2 text-xs text-[#C7D4CD]"
              >
                <AlertCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{upgradeError}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={upgrading}
                onClick={() => {
                  if (paymentConfig && !paymentConfig.razorpayConfigured) {
                    setUpgradeError(
                      'Paid checkout is not enabled yet. Watch the 5-second ad below to inspect this video for free.'
                    );
                    return;
                  }
                  void handlePayAndInspect();
                }}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 transition-all duration-200 smooth-ease"
              >
                {upgrading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Verifying Payment...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    {!isSignedIn
                      ? 'Sign In & Upgrade to Premium'
                      : paymentConfig && !paymentConfig.razorpayConfigured
                        ? 'Checkout Coming Soon'
                        : 'Upgrade & Inspect Now'}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setUpgradeError(null);
                  setSecondsLeft(5);
                  setStage('watching-ad');
                }}
                className="w-full min-h-[42px] text-xs font-medium text-[#7E9288] hover:text-[#ECF3EF] transition-colors duration-200 smooth-ease"
              >
                Or watch a 5-second ad instead
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
