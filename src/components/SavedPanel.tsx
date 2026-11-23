import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Search,
  Trash2,
  Clock,
  FileJson,
  FileText,
} from 'lucide-react';
import type { VideoDetails } from '../types/video';
import { SafeImage } from './SafeImage';

interface SavedPanelProps {
  currentVideo: VideoDetails | null;
  history: VideoDetails[];
  onSelectVideo: (video: VideoDetails) => void;
  onRemoveVideo: (videoId: string) => void;
  onClearHistory: () => void;
}

export function SavedPanel({
  currentVideo,
  history,
  onSelectVideo,
  onRemoveVideo,
  onClearHistory,
}: SavedPanelProps) {
  const [query, setQuery] = useState('');
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

  const downloadJson = (video: VideoDetails) => {
    const blob = new Blob([JSON.stringify(video, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-${video.videoId}-details.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildMarkdown = (video: VideoDetails): string => {
    return [
      `# ${video.title}`,
      '',
      `- **URL:** ${video.url}`,
      `- **Video ID:** ${video.videoId}`,
      `- **Duration:** ${video.durationFormatted} (${video.durationReadable})`,
      `- **Channel:** ${video.channel.name} (${video.channel.url})`,
      video.channel.subscriberCount ? `- **Subscribers:** ${video.channel.subscriberCount}` : null,
      video.publishDate ? `- **Published:** ${video.publishDate}` : null,
      video.category ? `- **Category:** ${video.category}` : null,
      '',
      '## Tags',
      video.tags.length > 0 ? video.tags.join(', ') : '_None_',
      '',
      '## Description',
      video.description || '_No description_',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  };

  const formatCompactViews = (views: number | null | undefined): string | null => {
    if (typeof views !== 'number' || Number.isNaN(views)) return null;
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
    return `${views} views`;
  };

  const formatSavedDate = (iso: string): string => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
  };

  const getPreviewThumb = (item: VideoDetails) => {
    const chosen =
      item.thumbnails.find((t) => t.key === 'mqdefault') ??
      item.thumbnails.find((t) => t.key === 'hqdefault') ??
      item.thumbnails[0];
    const directFallback = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
    return {
      src: chosen?.proxyUrl ?? chosen?.url ?? directFallback,
      fallbackSrc: chosen?.url ?? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
    };
  };

  const filtered = query.trim()
    ? history.filter((item) => {
        const q = query.trim().toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.channel.name.toLowerCase().includes(q) ||
          item.videoId.toLowerCase().includes(q)
        );
      })
    : history;

  const currentPreview = currentVideo ? getPreviewThumb(currentVideo) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Saved Inspection History */}
      <section className="lg:col-span-7 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#ECF3EF]">
              Recent Inspections
            </h2>
            <p className="text-xs text-[#7E9288] tabular-nums">
              {history.length} {history.length === 1 ? 'video' : 'videos'} saved locally on this device
            </p>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#090E0B] px-3 py-1.5 text-xs font-medium text-[#C7D4CD] hover:bg-rose-950/50 hover:text-rose-300 hover:border-rose-500/30 transition-all duration-200 smooth-ease"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear All
            </button>
          )}
        </div>

        {history.length > 3 && (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7E9288]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved videos by title, channel, or ID..."
              aria-label="Search saved inspections"
              className="w-full min-h-[44px] rounded-xl border border-white/[0.09] bg-[#070B09] pl-9 pr-3 text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:bg-[#090E0B] focus:border-emerald-500/50 focus:outline-none transition-all duration-200 smooth-ease"
            />
          </div>
        )}

        {history.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Clock className="h-8 w-8 text-[#4F6358] mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-[#ECF3EF]">No saved videos yet</p>
            <p className="text-xs text-[#7E9288]">
              Inspected YouTube links appear here automatically for quick access.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#7E9288]">
            No saved videos match "{query}".
          </p>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((item) => {
              const preview = getPreviewThumb(item);
              const isActive = currentVideo?.videoId === item.videoId;
              const compactViews = formatCompactViews(item.viewCount);
              const savedDate = formatSavedDate(item.fetchedAt);

              return (
                <li
                  key={item.videoId}
                  className={`rounded-xl border p-2.5 sm:p-3 flex items-center gap-3 transition-all duration-200 smooth-ease ${
                    isActive
                      ? 'bg-emerald-500/[0.07] border-emerald-500/35'
                      : 'bg-[#090E0B] border-white/[0.06] hover:bg-[#111915] hover:border-white/[0.12]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectVideo(item)}
                    className="flex-1 min-w-0 flex items-center gap-3.5 text-left group min-h-[64px]"
                  >
                    {/* Small Video Thumbnail Preview */}
                    <div className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden bg-[#060908] border border-white/[0.1] group-hover:border-emerald-500/40 shrink-0 transition-colors duration-200 smooth-ease">
                      <SafeImage
                        src={preview.src}
                        fallbackSrc={preview.fallbackSrc}
                        alt={`Thumbnail preview for ${item.title}`}
                        className="h-full w-full object-cover transition-transform duration-300 smooth-ease group-hover:scale-[1.04]"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent" />
                      <span className="absolute bottom-1 right-1 rounded bg-black/85 border border-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#ECF3EF] tabular-nums">
                        {item.isLiveContent && item.durationSeconds === 0
                          ? 'LIVE'
                          : item.durationFormatted}
                      </span>
                    </div>

                    {/* Scannable Metadata */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-display text-sm font-semibold text-[#ECF3EF] group-hover:text-emerald-400 line-clamp-2 leading-snug transition-colors duration-200 smooth-ease">
                        {item.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#7E9288] tabular-nums">
                        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                          {item.channel.avatarUrl && (
                            <SafeImage
                              src={item.channel.avatarUrl}
                              alt=""
                              className="h-4 w-4 rounded-full object-cover border border-white/10 shrink-0"
                            />
                          )}
                          <span className="truncate text-[#94A69C] font-medium">
                            {item.channel.name}
                          </span>
                        </span>
                        {compactViews && (
                          <>
                            <span aria-hidden="true" className="text-white/20">·</span>
                            <span>{compactViews}</span>
                          </>
                        )}
                        <span aria-hidden="true" className="text-white/20">·</span>
                        <span>{item.tags.length} tags</span>
                        {savedDate && (
                          <>
                            <span aria-hidden="true" className="text-white/20">·</span>
                            <span>{savedDate}</span>
                          </>
                        )}
                        {isActive && (
                          <>
                            <span aria-hidden="true" className="text-white/20">·</span>
                            <span className="text-emerald-400 font-semibold">Active</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveVideo(item.videoId)}
                    aria-label={`Remove ${item.title} from history`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#7E9288] hover:text-rose-300 hover:bg-rose-950/50 transition-all duration-200 smooth-ease shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Right: Export Current Metadata */}
      <section className="lg:col-span-5 bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[#ECF3EF]">
            Export Details
          </h2>
          <p className="text-xs text-[#7E9288]">
            Copy or download structured metadata for the currently loaded video.
          </p>
        </div>

        {!currentVideo ? (
          <p className="py-8 text-sm text-[#7E9288] text-center">
            Inspect a video first to export its JSON or Markdown report.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#090E0B] border border-white/[0.07] flex items-center gap-3">
              {currentPreview && (
                <div className="w-20 aspect-video rounded-md overflow-hidden bg-[#060908] border border-white/[0.09] shrink-0">
                  <SafeImage
                    src={currentPreview.src}
                    fallbackSrc={currentPreview.fallbackSrc}
                    alt={`Thumbnail preview for ${currentVideo.title}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-semibold text-[#ECF3EF] line-clamp-1">
                  {currentVideo.title}
                </p>
                <p className="font-mono text-xs text-[#7E9288] tabular-nums">
                  ID: {currentVideo.videoId} · {currentVideo.durationFormatted}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => downloadJson(currentVideo)}
              className="min-h-[46px] w-full flex items-center justify-between rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 transition-all duration-200 smooth-ease"
            >
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                Download JSON Report
              </span>
              <span className="font-mono text-[11px] text-emerald-950/80">.json</span>
            </button>

            <button
              type="button"
              onClick={() => copyText(JSON.stringify(currentVideo, null, 2), 'json')}
              className="min-h-[46px] w-full flex items-center justify-between rounded-xl border border-white/[0.09] bg-[#090E0B] px-4 py-2.5 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease"
            >
              <span className="inline-flex items-center gap-2">
                <FileJson className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                Copy Raw JSON
              </span>
              {copiedKey === 'json' ? (
                <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => copyText(buildMarkdown(currentVideo), 'markdown')}
              className="min-h-[46px] w-full flex items-center justify-between rounded-xl border border-white/[0.09] bg-[#090E0B] px-4 py-2.5 text-xs font-semibold text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease"
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                Copy Markdown Summary
              </span>
              {copiedKey === 'markdown' ? (
                <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4 text-[#7E9288]" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
