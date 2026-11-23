import { useState } from 'react';
import { Check, Copy, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import type { VideoDetails } from '../types/video';
import { SafeImage } from './SafeImage';

interface ThumbnailsPanelProps {
  video: VideoDetails;
}

export function ThumbnailsPanel({ video }: ThumbnailsPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyUrl = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF]">
            Video Thumbnails
          </h2>
          <p className="mt-1 text-sm text-[#94A69C]">
            Preview, copy direct CDN links, or download JPG files across all YouTube resolution tiers.
          </p>
        </div>
        <span className="font-mono text-xs text-[#7E9288] tabular-nums">
          {video.thumbnails.filter((t) => t.available).length} of {video.thumbnails.length} resolutions available
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {video.thumbnails.map((thumb) => (
          <article
            key={thumb.key}
            className="bg-[#0D1310] rounded-2xl border border-white/[0.07] overflow-hidden flex flex-col"
          >
            <div className="relative aspect-video w-full bg-[#070B09] overflow-hidden border-b border-white/[0.06]">
              <SafeImage
                src={thumb.proxyUrl}
                fallbackSrc={thumb.url}
                alt={`${thumb.label} thumbnail (${thumb.width}x${thumb.height})`}
                className="h-full w-full object-cover"
                fallbackLabel={`${thumb.width} × ${thumb.height} unavailable`}
              />
            </div>

            <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-[#ECF3EF]">
                    {thumb.label}
                  </h3>
                  <span className="font-mono text-xs font-medium text-[#C7D4CD] tabular-nums">
                    {thumb.width} × {thumb.height}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  {thumb.available ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                      <span className="text-emerald-400 font-medium">Available</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                      <span className="text-amber-400 font-medium">Not uploaded by creator</span>
                    </>
                  )}
                  <span aria-hidden="true" className="text-white/20">·</span>
                  <span className="font-mono text-[#7E9288]">{thumb.key}.jpg</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href={thumb.downloadUrl}
                  download
                  className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 smooth-ease whitespace-nowrap ${
                    thumb.available
                      ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                      : 'bg-[#141E19] text-[#899C92] hover:bg-[#1A2821]'
                  }`}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </a>

                <button
                  type="button"
                  onClick={() => copyUrl(thumb.url, thumb.key)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#090E0B] px-3 py-2 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease whitespace-nowrap"
                >
                  {copiedKey === thumb.key ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      Copied URL
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy URL
                    </>
                  )}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
