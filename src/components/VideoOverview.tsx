import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Play,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  ArrowRight,
  Search,
} from 'lucide-react';
import type { ActiveTab, VideoDetails } from '../types/video';
import { SafeImage } from './SafeImage';
import { DescriptionText } from './DescriptionText';
import { RelatedVideosSection } from './RelatedVideosSection';

interface VideoOverviewProps {
  video: VideoDetails;
  history: VideoDetails[];
  onNavigateTab: (tab: ActiveTab) => void;
  onInspectVideo: (url: string) => void;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatDate(isoOrDate: string): string {
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function VideoOverview({
  video,
  history,
  onNavigateTab,
  onInspectVideo,
}: VideoOverviewProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState('');

  const bestThumb =
    video.thumbnails.find((t) => t.available) ??
    video.thumbnails[0];

  const fallbackThumb = video.thumbnails.find((t) => t.key === 'hqdefault') ?? bestThumb;

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard API blocked
    }
  };

  const filteredTags = tagFilter.trim()
    ? video.tags.filter((t) => t.toLowerCase().includes(tagFilter.trim().toLowerCase()))
    : video.tags;

  const isLongDesc = video.description.length > 360 || video.description.split('\n').length > 7;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Video Preview, Title, Metadata, Description */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] overflow-hidden">
            {/* Preview Viewport */}
            <div className="relative aspect-video w-full bg-[#050807] overflow-hidden">
              {showPlayer ? (
                <iframe
                  src={`${video.embedUrl}?autoplay=1&rel=0`}
                  title={video.title}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <>
                  <SafeImage
                    src={bestThumb?.proxyUrl ?? bestThumb?.url}
                    fallbackSrc={fallbackThumb?.proxyUrl ?? fallbackThumb?.url}
                    alt={`Thumbnail for ${video.title}`}
                    className="h-full w-full object-cover"
                    fallbackLabel={video.title}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPlayer(true)}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 shadow-sm hover:bg-emerald-400 active:scale-[0.98] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      <Play className="h-4 w-4 fill-emerald-950 text-emerald-950" aria-hidden="true" />
                      Play Video
                    </button>
                    <span className="rounded-md bg-black/80 border border-white/10 px-2.5 py-1 font-mono text-xs font-medium text-[#ECF3EF] tabular-nums">
                      {video.isLiveContent && video.durationSeconds === 0
                        ? 'LIVE'
                        : video.durationFormatted}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Preview Mode Bar + Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.06] bg-[#090E0B]">
              <div className="flex items-center gap-1 p-1 bg-[#060908] border border-white/[0.06] rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowPlayer(false)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 ${
                    !showPlayer
                      ? 'bg-[#16221C] text-emerald-300'
                      : 'text-[#899C92] hover:text-[#ECF3EF]'
                  }`}
                >
                  Thumbnail
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlayer(true)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 ${
                    showPlayer
                      ? 'bg-[#16221C] text-emerald-300'
                      : 'text-[#899C92] hover:text-[#ECF3EF]'
                  }`}
                >
                  Embedded Player
                </button>
              </div>

              <div className="flex items-center gap-2">
                {bestThumb && (
                  <a
                    href={bestThumb.downloadUrl}
                    download
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#0D1310] px-3 py-1.5 text-xs font-medium text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    Save Thumbnail
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onNavigateTab('media')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#0D1310] px-3 py-1.5 text-xs font-medium text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  All Sizes
                </button>
              </div>
            </div>

            {/* Title & Unboxed Metadata */}
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#ECF3EF] leading-snug text-balance">
                  {video.title}
                </h1>
                <button
                  type="button"
                  onClick={() => copyText(video.title, 'title')}
                  aria-label="Copy video title"
                  className="min-h-[44px] min-w-[44px] shrink-0 inline-flex items-center justify-center rounded-xl border border-white/[0.09] bg-[#090E0B] text-[#94A69C] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  {copiedKey === 'title' ? (
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Clean Unboxed Metadata Line */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#94A69C] tabular-nums">
                <span className="font-mono font-medium text-emerald-400">
                  {video.durationFormatted} ({video.durationReadable})
                </span>
                {video.viewCount !== null && (
                  <>
                    <span aria-hidden="true" className="text-white/20">·</span>
                    <span>{formatNumber(video.viewCount)} views</span>
                  </>
                )}
                {video.publishDate && (
                  <>
                    <span aria-hidden="true" className="text-white/20">·</span>
                    <span>Published {formatDate(video.publishDate)}</span>
                  </>
                )}
                {video.category && (
                  <>
                    <span aria-hidden="true" className="text-white/20">·</span>
                    <span>{video.category}</span>
                  </>
                )}
                {video.isShorts && (
                  <>
                    <span aria-hidden="true" className="text-white/20">·</span>
                    <span className="font-medium text-emerald-400">YouTube Shorts</span>
                  </>
                )}
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 active:scale-[0.98] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
                >
                  Open on YouTube
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => copyText(video.url, 'url')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#090E0B] px-4 py-2 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'url' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      Link Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy Clean Link
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Video Description */}
          <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                Description
              </h2>
              <button
                type="button"
                onClick={() => copyText(video.description, 'description')}
                disabled={!video.description}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#090E0B] px-3 py-1.5 text-xs font-medium text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] disabled:opacity-40 transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
              >
                {copiedKey === 'description' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy Description
                  </>
                )}
              </button>
            </div>

            <div
              className={`relative overflow-hidden transition-all duration-300 smooth-ease ${
                !descExpanded && isLongDesc ? 'max-h-56' : ''
              }`}
            >
              <DescriptionText text={video.description} />
              {!descExpanded && isLongDesc && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0D1310] to-transparent" />
              )}
            </div>

            {isLongDesc && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="min-h-[44px] w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#090E0B] px-4 py-2 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease"
              >
                {descExpanded ? (
                  <>
                    Show Less
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Read Full Description
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            )}
          </section>
        </div>

        {/* Right Column: Channel Info, Tags, Duration & Specs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Channel Summary Card */}
          <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                Channel Information
              </h2>
              <button
                type="button"
                onClick={() => onNavigateTab('channel')}
                className="min-h-[40px] inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0"
              >
                Full Profile
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-3.5">
              <SafeImage
                src={video.channel.avatarUrl}
                alt={`${video.channel.name} avatar`}
                initials={getInitials(video.channel.name)}
                className="h-14 w-14 rounded-full object-cover border border-white/10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-display text-base font-bold text-[#ECF3EF] truncate">
                    {video.channel.name}
                  </p>
                  {video.channel.verified && (
                    <BadgeCheck
                      className="h-4 w-4 text-emerald-400 shrink-0"
                      aria-label="Verified channel"
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#94A69C] mt-0.5 tabular-nums">
                  {video.channel.handle && <span>{video.channel.handle}</span>}
                  {video.channel.handle && video.channel.subscriberCount && (
                    <span aria-hidden="true" className="text-white/20">·</span>
                  )}
                  {video.channel.subscriberCount && <span>{video.channel.subscriberCount}</span>}
                </div>
              </div>
            </div>

            {video.channel.description && (
              <p className="text-xs leading-relaxed text-[#9EB0A6] line-clamp-3">
                {video.channel.description}
              </p>
            )}

            <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
              {video.channel.id && (
                <button
                  type="button"
                  onClick={() => copyText(video.channel.id, 'channelId')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#090E0B] px-3 py-1.5 font-mono text-xs text-[#C7D4CD] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
                >
                  {copiedKey === 'channelId' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      ID Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[#6D8076]" aria-hidden="true" />
                      {video.channel.id}
                    </>
                  )}
                </button>
              )}
              <a
                href={video.channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#090E0B] px-3 py-1.5 text-xs font-semibold text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
              >
                Visit Channel
                <ExternalLink className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              </a>
            </div>
          </section>

          {/* Video Tags & Hashtags */}
          <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
                  Video Tags
                </h2>
                <p className="text-xs text-[#7E9288] tabular-nums">
                  {video.tags.length} {video.tags.length === 1 ? 'tag' : 'tags'} embedded
                  {video.hashtags.length > 0 ? ` · ${video.hashtags.length} hashtags` : ''}
                </p>
              </div>
              {video.tags.length > 0 && (
                <button
                  type="button"
                  onClick={() => copyText(video.tags.join(', '), 'allTags')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#090E0B] px-3 py-1.5 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'allTags' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      Copied All
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy All
                    </>
                  )}
                </button>
              )}
            </div>

            {video.tags.length > 6 && (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7D74]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  placeholder="Filter tags..."
                  aria-label="Filter video tags"
                  className="w-full min-h-[42px] rounded-xl border border-white/[0.08] bg-[#070B09] pl-9 pr-3 text-xs text-[#ECF3EF] placeholder:text-[#6B7D74] focus:bg-[#0A100D] focus:border-emerald-500/50 focus:outline-none transition-all duration-200"
                />
              </div>
            )}

            {video.tags.length === 0 ? (
              <p className="text-xs text-[#7E9288]">
                This video creator did not include hidden keyword tags.
              </p>
            ) : filteredTags.length === 0 ? (
              <p className="text-xs text-[#7E9288]">No tags match "{tagFilter}".</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredTags.map((tag, index) => {
                  const key = `tag-${index}`;
                  const isCopied = copiedKey === key;
                  return (
                    <button
                      key={`${tag}-${index}`}
                      type="button"
                      onClick={() => copyText(tag, key)}
                      title="Tap to copy tag"
                      className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#090E0B] px-3 py-1.5 text-xs font-medium text-[#C7D4CD] hover:bg-[#131C17] hover:border-emerald-500/40 hover:text-[#ECF3EF] active:scale-[0.98] transition-all duration-200 smooth-ease text-left"
                    >
                      <span>{tag}</span>
                      {isCopied && (
                        <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {video.hashtags.length > 0 && (
              <div className="pt-3 border-t border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#C7D4CD]">
                    Description Hashtags
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText(video.hashtags.join(' '), 'hashtags')}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {copiedKey === 'hashtags' ? 'Copied' : 'Copy Hashtags'}
                  </button>
                </div>
                <p className="text-xs text-[#94A69C] leading-relaxed">
                  {video.hashtags.join(' · ')}
                </p>
              </div>
            )}
          </section>

          {/* Duration & Video Specifications */}
          <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-3">
            <h2 className="font-display text-base font-semibold text-[#ECF3EF]">
              Duration &amp; Specifications
            </h2>

            <dl className="divide-y divide-white/[0.06] text-xs sm:text-sm">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-[#7E9288]">Video ID</dt>
                <dd className="font-mono font-medium text-[#ECF3EF] tabular-nums">{video.videoId}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-[#7E9288]">Duration</dt>
                <dd className="font-mono font-medium text-emerald-400 tabular-nums">
                  {video.durationFormatted} ({video.durationReadable})
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-[#7E9288]">Exact Seconds</dt>
                <dd className="font-mono font-medium text-[#ECF3EF] tabular-nums">
                  {formatNumber(video.durationSeconds)}s
                </dd>
              </div>
              {video.likeCount && (
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <dt className="text-[#7E9288]">Likes</dt>
                  <dd className="font-mono font-medium text-[#ECF3EF] tabular-nums">
                    {video.likeCount}
                  </dd>
                </div>
              )}
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-[#7E9288]">Category</dt>
                <dd className="font-medium text-[#ECF3EF]">{video.category ?? 'Uncategorized'}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-[#7E9288]">Format</dt>
                <dd className="font-medium text-[#ECF3EF]">
                  {video.isLiveContent
                    ? 'Live Stream'
                    : video.isShorts
                      ? 'YouTube Shorts'
                      : 'Standard Video'}
                </dd>
              </div>
              {video.familySafe !== null && (
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <dt className="text-[#7E9288]">Family Safe</dt>
                  <dd className="font-medium text-[#ECF3EF]">{video.familySafe ? 'Yes' : 'Restricted'}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>

      <RelatedVideosSection
        video={video}
        history={history}
        onInspectVideo={onInspectVideo}
      />
    </div>
  );
}
