import { useEffect, useRef } from 'react';
import { Crown, ArrowUpRight } from 'lucide-react';

interface SponsoredBannerProps {
  onGoPremium: () => void;
  adsenseClientId?: string | null;
  adsenseBannerSlot?: string | null;
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

export function SponsoredBanner({
  onGoPremium,
  adsenseClientId,
  adsenseBannerSlot,
}: SponsoredBannerProps) {
  const clientId =
    adsenseClientId ||
    (import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined)?.trim() ||
    '';
  const bannerSlot =
    adsenseBannerSlot ||
    (import.meta.env.VITE_ADSENSE_BANNER_SLOT as string | undefined)?.trim() ||
    '';
  const adsEnabled = Boolean(clientId && bannerSlot);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!adsEnabled || pushedRef.current) return;
    pushedRef.current = true;

    const scriptId = 'cliplens-adsense-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
        clientId
      )}`;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense script blocked or loading asynchronously
    }
  }, [adsEnabled, clientId]);

  if (adsEnabled) {
    return (
      <aside
        aria-label="Sponsored advertisement"
        className="bg-[#0D1310] rounded-2xl border border-white/[0.07] px-4 sm:px-6 py-3 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2 text-xs text-[#7E9288]">
          <span>Advertisement · Google AdSense</span>
          <button
            type="button"
            onClick={onGoPremium}
            className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300"
          >
            <Crown className="h-3 w-3" aria-hidden="true" />
            Remove Ads
          </button>
        </div>
        <ins
          className="adsbygoogle block w-full min-h-[90px]"
          data-ad-client={clientId}
          data-ad-slot={bannerSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </aside>
    );
  }

  return (
    <aside
      aria-label="Sponsored advertisement"
      className="bg-[#0D1310] rounded-2xl border border-white/[0.07] px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2 text-xs text-[#7E9288]">
          <span className="font-semibold text-emerald-400">Sponsored</span>
          <span aria-hidden="true" className="text-white/20">·</span>
          <span>CreatorKit Analytics</span>
        </div>
        <p className="text-xs sm:text-sm font-medium text-[#ECF3EF] truncate">
          Track YouTube retention drops, CTR shifts, and keyword rankings in one workspace.
        </p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onGoPremium}
          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-all duration-200 smooth-ease whitespace-nowrap"
        >
          <Crown className="h-3.5 w-3.5" aria-hidden="true" />
          Remove Ads
        </button>
        <button
          type="button"
          onClick={onGoPremium}
          aria-label="Learn about ad-free options"
          className="min-h-[40px] inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 transition-all duration-200 smooth-ease whitespace-nowrap"
        >
          Learn More
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
