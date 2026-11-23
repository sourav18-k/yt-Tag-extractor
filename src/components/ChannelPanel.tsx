import { useState } from 'react';
import { BadgeCheck, Check, Copy, ExternalLink } from 'lucide-react';
import type { VideoDetails } from '../types/video';
import { SafeImage } from './SafeImage';
import { DescriptionText } from './DescriptionText';

interface ChannelPanelProps {
  video: VideoDetails;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function ChannelPanel({ video }: ChannelPanelProps) {
  const { channel } = video;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] overflow-hidden">
        {channel.bannerUrl && (
          <div className="h-32 sm:h-48 w-full bg-[#070B09] overflow-hidden border-b border-white/[0.06]">
            <SafeImage
              src={channel.bannerUrl}
              alt={`${channel.name} channel banner`}
              className="h-full w-full object-cover"
              fallbackLabel={channel.name}
            />
          </div>
        )}

        <div className="p-5 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <SafeImage
              src={channel.avatarUrl}
              alt={`${channel.name} avatar`}
              initials={getInitials(channel.name)}
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover border border-white/10 shrink-0"
            />
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#ECF3EF] truncate">
                  {channel.name}
                </h2>
                {channel.verified && (
                  <BadgeCheck
                    className="h-5 w-5 text-emerald-400 shrink-0"
                    aria-label="Verified channel"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#94A69C] tabular-nums">
                {channel.handle && (
                  <span className="font-medium text-emerald-400">{channel.handle}</span>
                )}
                {channel.handle && channel.subscriberCount && (
                  <span aria-hidden="true" className="text-white/20">·</span>
                )}
                {channel.subscriberCount && <span>{channel.subscriberCount}</span>}
                {channel.videoCount && (
                  <>
                    <span aria-hidden="true" className="text-white/20">·</span>
                    <span>{channel.videoCount}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {channel.id && (
              <button
                type="button"
                onClick={() => copyText(channel.id, 'channelId')}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#090E0B] px-4 py-2 font-mono text-xs font-medium text-[#C7D4CD] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
              >
                {copiedKey === 'channelId' ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    Copied ID
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-[#6D8076]" aria-hidden="true" />
                    {channel.id}
                  </>
                )}
              </button>
            )}
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 active:scale-[0.98] transition-all duration-200 smooth-ease whitespace-nowrap"
            >
              Open Channel
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold text-[#ECF3EF]">
              Channel Description
            </h3>
            {channel.description && (
              <button
                type="button"
                onClick={() => copyText(channel.description ?? '', 'channelDesc')}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#090E0B] px-3 py-1.5 text-xs font-medium text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease"
              >
                {copiedKey === 'channelDesc' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy Bio
                  </>
                )}
              </button>
            )}
          </div>
          {channel.description ? (
            <DescriptionText text={channel.description} />
          ) : (
            <p className="text-sm text-[#7E9288] italic">
              This channel has no public description on its About page.
            </p>
          )}
        </section>

        <section className="lg:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-3">
          <h3 className="font-display text-base font-semibold text-[#ECF3EF]">
            Channel Metadata
          </h3>
          <dl className="divide-y divide-white/[0.06] text-xs sm:text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Channel Name</dt>
              <dd className="font-medium text-[#ECF3EF] text-right">{channel.name}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Handle</dt>
              <dd className="font-mono text-emerald-400">{channel.handle ?? 'Unavailable'}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Channel ID</dt>
              <dd className="font-mono text-[#ECF3EF] truncate max-w-[200px]">
                {channel.id || 'Unavailable'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Subscribers</dt>
              <dd className="font-mono font-medium text-[#ECF3EF] tabular-nums">
                {channel.subscriberCount ?? 'Hidden or unavailable'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Total Videos</dt>
              <dd className="font-mono font-medium text-[#ECF3EF] tabular-nums">
                {channel.videoCount ?? 'Unavailable'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Lifetime Views</dt>
              <dd className="font-mono font-medium text-[#ECF3EF] tabular-nums">
                {channel.totalViews ?? 'Unavailable'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Joined</dt>
              <dd className="font-medium text-[#ECF3EF] tabular-nums">
                {channel.joinedDate ?? 'Unavailable'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#7E9288]">Country</dt>
              <dd className="font-medium text-[#ECF3EF]">{channel.country ?? 'Not listed'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
