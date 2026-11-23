import { useEffect, useState } from 'react';
import { Gamepad2, Loader2, RotateCcw, Trophy, X } from 'lucide-react';
import type { TrendingVideoItem, VideoDetails } from '../types/video';
import { SafeImage } from './SafeImage';

interface CreatorGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: VideoDetails[];
  onInspectVideo: (url: string) => void;
}

interface GameCard {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  viewCount: number;
  viewCountText: string;
  thumbnailUrl: string;
}

const BEST_SCORE_KEY = 'cliplens_game_best_v1';

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
  return `${count.toLocaleString()} views`;
}

export function CreatorGameModal({
  isOpen,
  onClose,
  history,
  onInspectVideo,
}: CreatorGameModalProps) {
  const [deck, setDeck] = useState<GameCard[]>([]);
  const [pairIndices, setPairIndices] = useState<[number, number]>([0, 1]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_SCORE_KEY) || 0) || 0;
    } catch {
      return 0;
    }
  });
  const [revealed, setRevealed] = useState<'correct' | 'wrong' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildDeckAndStart = async () => {
    setLoading(true);
    setError(null);
    setScore(0);
    setRevealed(null);

    try {
      const resp = await fetch('/api/trending?category=all');
      const data = (await resp.json()) as { items?: TrendingVideoItem[]; error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Could not load game deck.');
      }

      const pool = new Map<string, GameCard>();
      for (const h of history) {
        if (typeof h.viewCount === 'number' && h.viewCount > 0) {
          pool.set(h.videoId, {
            videoId: h.videoId,
            url: h.url,
            title: h.title,
            channelName: h.channel.name,
            viewCount: h.viewCount,
            viewCountText: formatViews(h.viewCount),
            thumbnailUrl:
              h.thumbnails[2]?.proxyUrl ??
              `/api/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${h.videoId}/hqdefault.jpg`)}`,
          });
        }
      }
      for (const t of data.items ?? []) {
        if (typeof t.viewCount === 'number' && t.viewCount > 0 && !pool.has(t.videoId)) {
          pool.set(t.videoId, {
            videoId: t.videoId,
            url: t.url,
            title: t.title,
            channelName: t.channelName,
            viewCount: t.viewCount,
            viewCountText: t.viewCountText || formatViews(t.viewCount),
            thumbnailUrl: t.thumbnailUrl,
          });
        }
      }

      const cards = Array.from(pool.values()).sort(() => Math.random() - 0.5);
      if (cards.length < 2) {
        throw new Error('Need at least two videos with view counts to start.');
      }
      setDeck(cards);
      setPairIndices([0, 1]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start game.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void buildDeckAndStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const left = deck[pairIndices[0]];
  const right = deck[pairIndices[1]];

  const handleGuess = (picked: 'left' | 'right') => {
    if (!left || !right || revealed !== null) return;
    const isCorrect =
      picked === 'left'
        ? left.viewCount >= right.viewCount
        : right.viewCount >= left.viewCount;

    if (isCorrect) {
      const nextScore = score + 1;
      setScore(nextScore);
      if (nextScore > bestScore) {
        setBestScore(nextScore);
        try {
          localStorage.setItem(BEST_SCORE_KEY, String(nextScore));
        } catch {
          // ignore
        }
      }
      setRevealed('correct');
    } else {
      setRevealed('wrong');
    }
  };

  const handleNextRound = () => {
    if (deck.length < 2) return;
    if (revealed === 'wrong') {
      void buildDeckAndStart();
      return;
    }
    const nextB = (Math.max(pairIndices[0], pairIndices[1]) + 1) % deck.length;
    const keepIdx = pairIndices[1];
    const safeNextB = nextB === keepIdx ? (nextB + 1) % deck.length : nextB;
    setPairIndices([keepIdx, safeNextB]);
    setRevealed(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-game-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0D1310] rounded-t-3xl sm:rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Gamepad2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <div>
              <h2 id="creator-game-title" className="font-display text-base font-bold text-[#ECF3EF]">
                View Count Duel
              </h2>
              <p className="text-xs text-[#7E9288]">
                Pick which YouTube video has more views
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
              <span className="text-[#94A69C]">
                Streak: <strong className="text-emerald-400">{score}</strong>
              </span>
              <span className="inline-flex items-center gap-1 text-[#94A69C]">
                <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                {bestScore}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close game"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[#899C92] hover:text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#7E9288]">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
              <span>Preparing live YouTube matchup...</span>
            </div>
          )}

          {!loading && error && (
            <div className="space-y-3 text-center py-8">
              <p className="text-sm text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => void buildDeckAndStart()}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {!loading && !error && left && right && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { side: 'left' as const, card: left },
                  { side: 'right' as const, card: right },
                ].map(({ side, card }) => {
                  const isWinner =
                    revealed !== null &&
                    (side === 'left'
                      ? left.viewCount >= right.viewCount
                      : right.viewCount >= left.viewCount);

                  return (
                    <div
                      key={`${side}-${card.videoId}`}
                      className={`rounded-xl border p-3 flex flex-col justify-between gap-3 transition-all duration-200 smooth-ease ${
                        revealed === null
                          ? 'bg-[#090E0B] border-white/[0.08]'
                          : isWinner
                            ? 'bg-emerald-500/[0.09] border-emerald-500/45'
                            : 'bg-[#090E0B] border-white/[0.06] opacity-80'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="aspect-video w-full rounded-lg overflow-hidden bg-[#060908] border border-white/[0.08]">
                          <SafeImage
                            src={card.thumbnailUrl}
                            fallbackSrc={`https://i.ytimg.com/vi/${card.videoId}/hqdefault.jpg`}
                            alt={card.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <p className="font-display text-sm font-semibold text-[#ECF3EF] line-clamp-2 leading-snug">
                          {card.title}
                        </p>
                        <p className="text-xs text-[#7E9288] truncate">{card.channelName}</p>
                      </div>

                      {revealed !== null ? (
                        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                            {card.viewCountText}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onInspectVideo(card.url);
                            }}
                            className="text-xs font-semibold text-[#C7D4CD] underline underline-offset-4 hover:text-emerald-300"
                          >
                            Inspect
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleGuess(side)}
                          className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 transition-all duration-200 smooth-ease"
                        >
                          More Views
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {revealed !== null && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#090E0B] border border-white/[0.08] px-4 py-3">
                  <p className="text-xs sm:text-sm font-semibold text-[#ECF3EF]">
                    {revealed === 'correct'
                      ? `Correct! Streak is now ${score}.`
                      : `Round over — final streak: ${score}.`}
                  </p>
                  <button
                    type="button"
                    onClick={handleNextRound}
                    className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 transition-all duration-200 smooth-ease"
                  >
                    {revealed === 'correct' ? 'Next Matchup' : 'Play Again'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
