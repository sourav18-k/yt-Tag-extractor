import { useState } from 'react';
import { AlertCircle, Check, Crown, Loader2, ShieldCheck, Zap, Ban } from 'lucide-react';
import type { PaymentConfigStatus } from '../types/video';

interface PremiumPanelProps {
  isPremium: boolean;
  premiumPlan: 'monthly' | 'annual' | null;
  expiresAt?: string | null;
  isSignedIn?: boolean;
  emailVerified?: boolean;
  paymentConfig?: PaymentConfigStatus | null;
  onActivatePremium: (plan: 'monthly' | 'annual') => Promise<void> | void;
  onOpenSignIn?: () => void;
}

export function PremiumPanel({
  isPremium,
  premiumPlan,
  expiresAt = null,
  isSignedIn = false,
  emailVerified = false,
  paymentConfig = null,
  onActivatePremium,
  onOpenSignIn,
}: PremiumPanelProps) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>(premiumPlan ?? 'annual');
  const [processing, setProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const monthlyInr = paymentConfig?.plans.monthly.inr ?? 399;
  const annualInr = paymentConfig?.plans.annual.inr ?? 3299;
  const monthlyUsd = paymentConfig?.plans.monthly.usd ?? 4.99;
  const annualUsd = paymentConfig?.plans.annual.usd ?? 39.99;
  const razorpayReady = Boolean(paymentConfig?.razorpayConfigured);

  const handleCheckoutClick = async () => {
    setCheckoutError(null);
    if (!isSignedIn) {
      if (onOpenSignIn) {
        onOpenSignIn();
      } else {
        setCheckoutError('Please sign in via the top-right menu before upgrading to Premium.');
      }
      return;
    }
    if (!emailVerified) {
      setCheckoutError('Please verify your email address in the profile menu before upgrading.');
      return;
    }
    if (!razorpayReady) {
      setCheckoutError(
        'Online payment checkout is not enabled yet. You can continue using all ClipLens tools for free by watching a short 5-second ad in the inspector.'
      );
      return;
    }

    setProcessing(true);
    try {
      await onActivatePremium(billing);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Unable to complete payment checkout.'
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Plan Status Banner */}
      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div
            className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isPremium
                ? 'bg-emerald-500 text-emerald-950'
                : 'bg-[#141E19] border border-white/[0.08] text-emerald-400'
            }`}
          >
            <Crown className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">
              {isPremium ? 'ClipLens Premium Active' : 'ClipLens Free Plan'}
            </h2>
            <p className="text-xs sm:text-sm text-[#94A69C]">
              {isPremium
                ? `Verified ad-free access (${
                    premiumPlan === 'monthly'
                      ? razorpayReady
                        ? `Monthly ₹${monthlyInr}/mo`
                        : `Monthly $${monthlyUsd}/mo`
                      : razorpayReady
                        ? `Annual ₹${annualInr}/yr`
                        : `Annual $${annualUsd}/yr`
                  })${expiresAt ? ` · Valid until ${new Date(expiresAt).toLocaleDateString()}` : ''}.`
                : 'Currently ad-supported. Watch a 5-second ad per inspection or upgrade to Premium below.'}
            </p>
          </div>
        </div>
      </section>

      {/* Plan Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Free Tier */}
        <section className="lg:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-[#ECF3EF]">Free Tier</h3>
              <span className="font-mono text-xl font-bold text-[#ECF3EF] tabular-nums">
                {razorpayReady ? '₹0' : '$0'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#94A69C]">
              Full video metadata inspection supported by short rewarded ads and inline sponsors.
            </p>
            <ul className="space-y-2.5 pt-2 border-t border-white/[0.06] text-xs sm:text-sm text-[#C7D4CD]">
              <li className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-[#7E9288] shrink-0" aria-hidden="true" />
                Title, description, tags, duration &amp; channel info
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-[#7E9288] shrink-0" aria-hidden="true" />
                Multi-resolution thumbnail downloads
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-[#7E9288] shrink-0" aria-hidden="true" />
                5-second rewarded ad before each inspection
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <span className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/[0.08] bg-[#090E0B] px-4 py-2 text-xs font-semibold text-[#7E9288]">
              {isPremium ? 'Free tier included' : 'Current Active Plan'}
            </span>
          </div>
        </section>

        {/* Premium Tier */}
        <section className="lg:col-span-7 bg-[#0D1310] rounded-2xl border border-emerald-500/30 p-5 sm:p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg sm:text-xl font-bold text-[#ECF3EF]">
                  ClipLens Premium
                </h3>
                <p className="text-xs text-[#7E9288] mt-0.5">
                  Built for creators, editors, and researchers
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#090E0B] border border-white/[0.07] rounded-xl">
                <button
                  type="button"
                  onClick={() => setBilling('monthly')}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 smooth-ease ${
                    billing === 'monthly'
                      ? 'bg-[#16221C] text-emerald-300 border border-emerald-500/30'
                      : 'text-[#899C92] hover:text-[#ECF3EF]'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBilling('annual')}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 smooth-ease ${
                    billing === 'annual'
                      ? 'bg-[#16221C] text-emerald-300 border border-emerald-500/30'
                      : 'text-[#899C92] hover:text-[#ECF3EF]'
                  }`}
                >
                  Annual (Save 33%)
                </button>
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-emerald-400 tabular-nums">
                {razorpayReady
                  ? billing === 'annual'
                    ? `₹${Math.round(annualInr / 12)}`
                    : `₹${monthlyInr}`
                  : billing === 'annual'
                    ? '$3.33'
                    : `$${monthlyUsd}`}
              </span>
              <span className="text-xs sm:text-sm text-[#7E9288]">
                / month{' '}
                {razorpayReady
                  ? billing === 'annual'
                    ? `· billed ₹${annualInr.toLocaleString('en-IN')} yearly`
                    : '· billed monthly'
                  : billing === 'annual'
                    ? `· billed $${annualUsd} yearly`
                    : '· billed monthly'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/[0.06]">
              <div className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-3 space-y-1">
                <Ban className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <p className="text-xs font-semibold text-[#ECF3EF]">Zero Ads</p>
                <p className="text-[11px] text-[#7E9288]">
                  Removes video gates and sponsored banners everywhere.
                </p>
              </div>
              <div className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-3 space-y-1">
                <Zap className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <p className="text-xs font-semibold text-[#ECF3EF]">Instant Inspect</p>
                <p className="text-[11px] text-[#7E9288]">
                  One-tap loading from links, samples, and related videos.
                </p>
              </div>
              <div className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-3 space-y-1">
                <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <p className="text-xs font-semibold text-[#ECF3EF]">Cloud Sync</p>
                <p className="text-[11px] text-[#7E9288]">
                  Sync saved history &amp; verified status across devices.
                </p>
              </div>
            </div>

            {checkoutError && (
              <div
                role="alert"
                className="rounded-xl border border-emerald-500/25 bg-[#090E0B] px-3.5 py-2.5 flex items-start gap-2 text-xs text-[#C7D4CD]"
              >
                <AlertCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{checkoutError}</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => void handleCheckoutClick()}
              disabled={processing || (isPremium && premiumPlan === billing)}
              className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:bg-emerald-500/15 disabled:text-emerald-300 disabled:border disabled:border-emerald-500/30 transition-all duration-200 smooth-ease"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying Checkout...
                </>
              ) : isPremium && premiumPlan === billing ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Current Active Plan
                </>
              ) : !isSignedIn ? (
                'Sign In to Upgrade to Premium'
              ) : !razorpayReady ? (
                'Checkout Coming Soon'
              ) : isPremium ? (
                `Switch to ${billing === 'annual' ? 'Annual' : 'Monthly'} Plan`
              ) : (
                `Pay ₹${billing === 'annual' ? annualInr.toLocaleString('en-IN') : monthlyInr} with Razorpay`
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
