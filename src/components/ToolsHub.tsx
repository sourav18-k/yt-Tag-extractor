import { useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clapperboard,
  Copy,
  Hash,
  Loader2,
  Search,
  Tag,
  Tags,
  Tv,
} from 'lucide-react';
import type { CreatorToolId, CreatorToolResult, VideoDetails } from '../types/video';
import { SponsoredBanner } from './SponsoredBanner';

interface ToolMeta {
  id: CreatorToolId;
  title: string;
  subtitle: string;
  placeholder: string;
  ctaLabel: string;
  icon: ReactNode;
}

const TOOL_CATALOG: Record<CreatorToolId, ToolMeta> = {
  'tags-extractor': {
    id: 'tags-extractor',
    title: 'Video Tags Extractor',
    subtitle: 'Extract embedded creator tags and hashtags from any YouTube video URL.',
    placeholder: 'Paste YouTube video URL (e.g., https://www.youtube.com/watch?v=...)',
    ctaLabel: 'Extract Tags',
    icon: <Tag className="h-6 w-6 text-emerald-400" aria-hidden="true" />,
  },
  'keyword-suggestion': {
    id: 'keyword-suggestion',
    title: 'Keyword Suggestion',
    subtitle: 'Discover high-intent YouTube search queries and long-tail keyword angles.',
    placeholder: 'Enter a topic, niche, or YouTube video URL...',
    ctaLabel: 'Find Keywords',
    icon: <Search className="h-6 w-6 text-emerald-400" aria-hidden="true" />,
  },
  'ai-hashtag-generator': {
    id: 'ai-hashtag-generator',
    title: 'AI Hashtag Generator',
    subtitle: 'Generate discovery-ready #hashtags for Shorts and standard uploads.',
    placeholder: 'Enter a video topic, title, or YouTube URL...',
    ctaLabel: 'Generate Hashtags',
    icon: <Hash className="h-6 w-6 text-emerald-400" aria-hidden="true" />,
  },
  'ai-tags-generator': {
    id: 'ai-tags-generator',
    title: 'AI Tags Generator',
    subtitle: 'Build SEO-balanced metadata tags under YouTube’s 500-character limit.',
    placeholder: 'Describe your video topic or paste a YouTube URL...',
    ctaLabel: 'Generate Tags',
    icon: <Tags className="h-6 w-6 text-emerald-400" aria-hidden="true" />,
  },
  'ai-channel': {
    id: 'ai-channel',
    title: 'AI Channel',
    subtitle: 'Analyze an existing channel URL or craft positioning, pillars, and bio ideas.',
    placeholder: 'Enter channel URL (@handle) or niche idea...',
    ctaLabel: 'Analyze Channel',
    icon: <Tv className="h-6 w-6 text-emerald-400" aria-hidden="true" />,
  },
  'ai-video': {
    id: 'ai-video',
    title: 'AI Video',
    subtitle: 'Create high-CTR titles, 15-second hooks, chapters, and thumbnail concepts.',
    placeholder: 'Enter your video concept, title, or YouTube URL...',
    ctaLabel: 'Generate Video Plan',
    icon: <Clapperboard className="h-6 w-6 text-emerald-400" aria-hidden="true" />,
  },
};

const POPULAR_TOOL_IDS: CreatorToolId[] = [
  'tags-extractor',
  'keyword-suggestion',
  'ai-hashtag-generator',
];

const ALL_TOOL_IDS: CreatorToolId[] = [
  'tags-extractor',
  'keyword-suggestion',
  'ai-tags-generator',
  'ai-hashtag-generator',
  'ai-channel',
  'ai-video',
];

interface ToolsHubProps {
  currentVideo: VideoDetails | null;
  urlInput: string;
  isPremium: boolean;
  selectedTool: CreatorToolId | null;
  adsenseClientId?: string | null;
  adsenseBannerSlot?: string | null;
  onSelectTool: (toolId: CreatorToolId | null) => void;
  onGoPremium: () => void;
  onVideoExtracted?: (video: VideoDetails) => void;
  onAiToolCompleted?: (toolId: CreatorToolId) => void;
}

export function ToolsHub({
  currentVideo,
  urlInput,
  isPremium,
  selectedTool,
  adsenseClientId = null,
  adsenseBannerSlot = null,
  onSelectTool,
  onGoPremium,
  onVideoExtracted,
  onAiToolCompleted,
}: ToolsHubProps) {
  const [toolInput, setToolInput] = useState('');
  const [running, setRunning] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatorToolResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const openTool = (toolId: CreatorToolId) => {
    setToolError(null);
    setResult(null);

    if (toolId === 'tags-extractor' && currentVideo) {
      setToolInput(currentVideo.url);
      setResult({
        toolId: 'tags-extractor',
        query: currentVideo.url,
        summary: `Extracted ${currentVideo.tags.length} video tags and ${currentVideo.hashtags.length} hashtags from "${currentVideo.title}".`,
        items: currentVideo.tags,
        sections: [
          {
            title: 'Description Hashtags',
            items:
              currentVideo.hashtags.length > 0
                ? currentVideo.hashtags
                : ['No #hashtags found in video description'],
          },
        ],
        sourceVideoTitle: currentVideo.title,
        generatedAt: currentVideo.fetchedAt,
      });
    } else if (urlInput.trim()) {
      setToolInput(urlInput.trim());
    } else if (currentVideo) {
      setToolInput(toolId === 'ai-channel' ? currentVideo.channel.url : currentVideo.title);
    } else {
      setToolInput('');
    }

    onSelectTool(toolId);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const executeTool = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTool) return;

    const trimmed = toolInput.trim();
    if (!trimmed) {
      setToolError('Please enter a topic, keyword, or YouTube URL first.');
      return;
    }

    setRunning(true);
    setToolError(null);

    try {
      if (selectedTool === 'tags-extractor') {
        const resp = await fetch('/api/video-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        });
        const data = (await resp.json()) as VideoDetails & { error?: string };
        if (!resp.ok) {
          throw new Error(data.error || 'Could not extract tags from this YouTube URL.');
        }

        onVideoExtracted?.(data);
        setResult({
          toolId: 'tags-extractor',
          query: data.url,
          summary: `Extracted ${data.tags.length} embedded tags and ${data.hashtags.length} hashtags from "${data.title}".`,
          items: data.tags,
          sections: [
            {
              title: 'Description Hashtags',
              items:
                data.hashtags.length > 0
                  ? data.hashtags
                  : ['No #hashtags found in video description'],
            },
          ],
          sourceVideoTitle: data.title,
          generatedAt: data.fetchedAt,
        });
      } else {
        const resp = await fetch('/api/tools/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolId: selectedTool, input: trimmed }),
        });
        const data = (await resp.json()) as CreatorToolResult & { error?: string };
        if (!resp.ok) {
          throw new Error(data.error || 'Unable to generate creator suggestions.');
        }
        setResult(data);
        onAiToolCompleted?.(selectedTool);
      }
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Request failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  if (selectedTool) {
    const meta = TOOL_CATALOG[selectedTool];
    const isTagsLike =
      selectedTool === 'tags-extractor' || selectedTool === 'ai-tags-generator';
    const joinedAll = isTagsLike
      ? result?.items.join(', ') ?? ''
      : result?.items.join('\n') ?? '';

    return (
      <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                onSelectTool(null);
                setToolError(null);
              }}
              aria-label="Back to all creator tools"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#090E0B] text-[#C7D4CD] hover:bg-[#141E19] hover:text-[#ECF3EF] transition-all duration-200 smooth-ease shrink-0"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#ECF3EF] truncate">
                {meta.title}
              </h2>
              <p className="text-xs sm:text-sm text-[#899C92]">{meta.subtitle}</p>
            </div>
          </div>

          {currentVideo && (
            <button
              type="button"
              onClick={() =>
                setToolInput(
                  selectedTool === 'tags-extractor'
                    ? currentVideo.url
                    : selectedTool === 'ai-channel'
                      ? currentVideo.channel.url
                      : currentVideo.title
                )
              }
              className="min-h-[40px] inline-flex items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-all duration-200 smooth-ease whitespace-nowrap"
            >
              Use Loaded Video
            </button>
          )}
        </div>

        <form onSubmit={executeTool} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={toolInput}
            onChange={(e) => setToolInput(e.target.value)}
            placeholder={meta.placeholder}
            aria-label={`${meta.title} input`}
            className="flex-1 min-h-[46px] rounded-xl border border-white/[0.09] bg-[#070B09] px-4 text-sm text-[#ECF3EF] placeholder:text-[#7E9288] focus:bg-[#090E0B] focus:border-emerald-500/50 focus:outline-none transition-all duration-200 smooth-ease"
          />
          <button
            type="submit"
            disabled={running}
            className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60 transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Processing...
              </>
            ) : (
              meta.ctaLabel
            )}
          </button>
        </form>

        {toolError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm text-rose-200"
          >
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{toolError}</span>
          </div>
        )}

        {result && (
          <div className="space-y-5 pt-3 border-t border-white/[0.07]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 max-w-2xl">
                {result.sourceVideoTitle && (
                  <p className="text-xs font-medium text-emerald-400">
                    Context: {result.sourceVideoTitle}
                  </p>
                )}
                <p className="text-xs sm:text-sm text-[#C7D4CD] leading-relaxed">
                  {result.summary}
                </p>
              </div>

              {result.items.length > 0 && (
                <button
                  type="button"
                  onClick={() => copyText(joinedAll, 'copy-all')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#090E0B] px-3.5 py-2 text-xs font-semibold text-[#ECF3EF] hover:bg-[#141E19] transition-all duration-200 smooth-ease whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'copy-all' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      Copied All
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      Copy All ({result.items.length})
                    </>
                  )}
                </button>
              )}
            </div>

            {result.items.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#7E9288]">
                  <span>Tap any item to copy</span>
                  {isTagsLike && (
                    <span className="font-mono tabular-nums">
                      {joinedAll.length} / 500 chars
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.items.map((item, idx) => {
                    const key = `item-${idx}`;
                    const isCopied = copiedKey === key;
                    return (
                      <button
                        key={`${item}-${idx}`}
                        type="button"
                        onClick={() => copyText(item, key)}
                        className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-200 smooth-ease ${
                          isCopied
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : 'border-white/[0.08] bg-[#090E0B] text-[#ECF3EF] hover:border-emerald-500/35 hover:bg-[#121B16]'
                        }`}
                      >
                        <span>{item}</span>
                        {isCopied ? (
                          <Check className="h-3 w-3 text-emerald-400 shrink-0" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3 text-[#7E9288] shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#7E9288]">
                No tags were embedded on this video by the creator.
              </p>
            )}

            {result.sections && result.sections.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {result.sections.map((section) => (
                  <div
                    key={section.title}
                    className="rounded-xl bg-[#090E0B] border border-white/[0.06] p-4 space-y-2.5"
                  >
                    <h3 className="font-display text-sm font-semibold text-emerald-400">
                      {section.title}
                    </h3>
                    <ul className="space-y-1.5 text-xs sm:text-sm text-[#C7D4CD]">
                      {section.items.map((line, i) => (
                        <li key={i} className="leading-relaxed">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Popular Tool Grid */}
      <section className="space-y-3">
        <h2 className="font-display text-base sm:text-lg font-bold text-[#ECF3EF]">
          Popular Tool
        </h2>
        <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {POPULAR_TOOL_IDS.map((id) => {
              const tool = TOOL_CATALOG[id];
              return (
                <button
                  key={`pop-${id}`}
                  type="button"
                  onClick={() => openTool(id)}
                  className="group min-h-[104px] flex flex-col items-center justify-center gap-2.5 rounded-xl bg-[#090E0B] border border-white/[0.06] p-3 text-center hover:bg-[#111A15] hover:border-emerald-500/35 active:scale-[0.98] transition-all duration-200 smooth-ease"
                >
                  <div className="h-12 w-12 rounded-xl bg-[#0D1611] border border-emerald-500/20 flex items-center justify-center group-hover:border-emerald-500/45 transition-colors duration-200 smooth-ease">
                    {tool.icon}
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-[#ECF3EF] group-hover:text-emerald-300 leading-tight transition-colors duration-200 smooth-ease">
                    {tool.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sponsored Banner between Popular Tool and All Tool */}
      {!isPremium && (
        <SponsoredBanner
          onGoPremium={onGoPremium}
          adsenseClientId={adsenseClientId}
          adsenseBannerSlot={adsenseBannerSlot}
        />
      )}

      {/* All Tool Grid */}
      <section className="space-y-3">
        <h2 className="font-display text-base sm:text-lg font-bold text-[#ECF3EF]">
          All Tool
        </h2>
        <div className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {ALL_TOOL_IDS.map((id) => {
              const tool = TOOL_CATALOG[id];
              return (
                <button
                  key={`all-${id}`}
                  type="button"
                  onClick={() => openTool(id)}
                  className="group min-h-[104px] flex flex-col items-center justify-center gap-2.5 rounded-xl bg-[#090E0B] border border-white/[0.06] p-3 text-center hover:bg-[#111A15] hover:border-emerald-500/35 active:scale-[0.98] transition-all duration-200 smooth-ease"
                >
                  <div className="h-12 w-12 rounded-xl bg-[#0D1611] border border-emerald-500/20 flex items-center justify-center group-hover:border-emerald-500/45 transition-colors duration-200 smooth-ease">
                    {tool.icon}
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-[#ECF3EF] group-hover:text-emerald-300 leading-tight transition-colors duration-200 smooth-ease">
                    {tool.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
