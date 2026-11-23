import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, TrendingUp, X } from 'lucide-react';
import type { TrendingVideoItem } from '../types/video';
import { SafeImage } from './SafeImage';

interface TrendingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInspectVideo: (url: string) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'Trending Now' },
  { id: 'tech', label: 'Tech' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'music', label: 'Music' },
] as const;

export function TrendingModal({ isOpen, onClose, onInspectVideo }: TrendingModalProps) {
  const [category, setCategory] = useState<string>('all');
  const [items, setItems] = useState<TrendingVideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrending = async (targetCategory: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/trending?category=${encodeURIComponent(targetCategory)}`);
      const data = (await resp.json()) as { items?: TrendingVideoItem[]; error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Could not load trending videos.');
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach trending feed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadTrending(category);
    }
  }, [isOpen, category]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trending-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4"
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-[#0D1310] rounded-t-3xl sm:rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <div>
              <h2 id="trending-modal-title" className="font-display text-base font-bold text-[#ECF3EF]">
                Trending Videos
              </h2>
              <p className="text-xs text-[#7E9288]">
                Tap any trending upload to inspect its tags, thumbnails, and metadata
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void loadTrending(category)}
              disabled={loading}
              aria-label="Refresh trending videos"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[#899C92] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close trending videos"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[#899C92] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2 overflow-x-auto shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 ${
                category === cat.id
                  ? 'bg-emerald-500 text-emerald-950'
                  : 'bg-[#090E0B] border border-white/[0.08] text-[#94A69C] hover:text-[#ECF3EF]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#7E9288]">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
              <span>Loading trending YouTube videos...</span>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 flex items-start gap-2.5 text-xs sm:text-sm text-rose-200">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {!loading &&
            !error &&
            items.map((item) => (
              <button
                key={item.videoId}
                type="button"
                onClick={() => {
                  onClose();
                  onInspectVideo(item.url);
                }}
                className="w-full rounded-xl border border-white/[0.06] bg-[#090E0B] p-2.5 flex items-center gap-3.5 text-left hover:bg-[#111A15] hover:border-emerald-500/35 transition-all duration-200 smooth-ease group"
              >
                <div className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden bg-[#060908] border border-white/[0.08] shrink-0">
                  <SafeImage
                    src={item.thumbnailUrl}
                    fallbackSrc={`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`}
                    alt={item.title}
                    className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300 smooth-ease"
                  />
                  {item.duration && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#ECF3EF] tabular-nums">
                      {item.duration}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-display text-xs sm:text-sm font-semibold text-[#ECF3EF] group-hover:text-emerald-300 line-clamp-2 leading-snug transition-colors duration-200 smooth-ease">
                    {item.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#7E9288] tabular-nums">
                    <span className="truncate text-[#94A69C] font-medium">{item.channelName}</span>
                    {item.viewCountText && (
                      <>
                        <span aria-hidden="true" className="text-white/20">·</span>
                        <span>{item.viewCountText}</span>
                      </>
                    )}
                    {item.publishedTimeText && (
                      <>
                        <span aria-hidden="true" className="text-white/20">·</span>
                        <span>{item.publishedTimeText}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
