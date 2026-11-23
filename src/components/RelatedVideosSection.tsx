import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { ExternalLink, ScanSearch } from 'lucide-react';
import type { VideoDetails } from '../types/video';
import { SafeImage } from './SafeImage';

interface RelatedVideosSectionProps {
  video: VideoDetails;
  history: VideoDetails[];
  onInspectVideo: (url: string) => void;
}

interface ChartPoint {
  shortLabel: string;
  fullTitle: string;
  channelName: string;
  views: number;
  duration: string | null;
  isCurrent: boolean;
}

function formatCompactViews(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

function formatExactViews(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function truncateLabel(text: string, maxLen = 14): string {
  const clean = text.trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}

function ViewChartTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="max-w-xs rounded-xl border border-white/15 bg-[#0A100D] px-3.5 py-2.5 shadow-xl space-y-1">
      <p className="font-display text-xs font-semibold text-[#ECF3EF] line-clamp-2">
        {item.fullTitle}
      </p>
      <p className="text-[11px] text-[#8FA399] truncate">
        {item.channelName}
        {item.duration ? ` · ${item.duration}` : ''}
      </p>
      <p className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
        {formatExactViews(item.views)} views
      </p>
    </div>
  );
}

export function RelatedVideosSection({
  video,
  history,
  onInspectVideo,
}: RelatedVideosSectionProps) {
  const [chartMode, setChartMode] = useState<'related' | 'history'>('related');

  const relatedChartData = useMemo<ChartPoint[]>(() => {
    const items: ChartPoint[] = [];
    if (video.viewCount !== null) {
      items.push({
        shortLabel: 'Current',
        fullTitle: video.title,
        channelName: video.channel.name,
        views: video.viewCount,
        duration: video.durationFormatted,
        isCurrent: true,
      });
    }
    for (const rel of video.relatedVideos.slice(0, 7)) {
      if (rel.viewCount !== null) {
        items.push({
          shortLabel: truncateLabel(rel.title, 12),
          fullTitle: rel.title,
          channelName: rel.channelName,
          views: rel.viewCount,
          duration: rel.duration,
          isCurrent: false,
        });
      }
    }
    return items;
  }, [video]);

  const historyChartData = useMemo<ChartPoint[]>(() => {
    return [...history]
      .reverse()
      .filter((item) => item.viewCount !== null)
      .slice(-8)
      .map((item) => ({
        shortLabel: truncateLabel(item.title, 12),
        fullTitle: item.title,
        channelName: item.channel.name,
        views: item.viewCount ?? 0,
        duration: item.durationFormatted,
        isCurrent: item.videoId === video.videoId,
      }));
  }, [history, video.videoId]);

  const canShowHistory = historyChartData.length >= 2;
  const activeMode = chartMode === 'history' && canShowHistory ? 'history' : 'related';
  const activeData = activeMode === 'history' ? historyChartData : relatedChartData;

  return (
    <section className="bg-[#0D1310] rounded-2xl border border-white/[0.07] p-5 sm:p-6 space-y-6">
      {/* Header + Segmented View Mode */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-[#ECF3EF]">
            View Count Reach &amp; Related Videos
          </h2>
          <p className="text-xs text-[#7E9288] mt-0.5">
            {activeMode === 'history'
              ? 'View count trend across your recently inspected videos'
              : 'Compares this video against related recommendations returned by YouTube'}
          </p>
        </div>

        {canShowHistory && (
          <div className="flex items-center gap-1 p-1 bg-[#070B09] border border-white/[0.06] rounded-lg">
            <button
              type="button"
              onClick={() => setChartMode('related')}
              className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 ${
                activeMode === 'related'
                  ? 'bg-[#16221C] text-emerald-300'
                  : 'text-[#899C92] hover:text-[#ECF3EF]'
              }`}
            >
              Related Videos
            </button>
            <button
              type="button"
              onClick={() => setChartMode('history')}
              className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 smooth-ease whitespace-nowrap shrink-0 ${
                activeMode === 'history'
                  ? 'bg-[#16221C] text-emerald-300'
                  : 'text-[#899C92] hover:text-[#ECF3EF]'
              }`}
            >
              Inspected History
            </button>
          </div>
        )}
      </div>

      {/* Recharts Small Chart */}
      {activeData.length >= 2 ? (
        <div className="space-y-2">
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              {activeMode === 'history' ? (
                <AreaChart data={activeData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="viewsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 11, fill: '#7E9288' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatCompactViews}
                    tick={{ fontSize: 11, fill: '#7E9288' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip content={<ViewChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#viewsAreaGrad)"
                    activeDot={{ r: 5, fill: '#34D399', stroke: '#060908', strokeWidth: 2 }}
                  />
                </AreaChart>
              ) : (
                <BarChart data={activeData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 11, fill: '#7E9288' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatCompactViews}
                    tick={{ fontSize: 11, fill: '#7E9288' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip content={<ViewChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="views" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {activeData.map((entry, idx) => (
                      <Cell
                        key={`bar-${idx}`}
                        fill={entry.isCurrent ? '#10B981' : '#24342D'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7E9288]">
            <span>
              {activeMode === 'history'
                ? `Showing ${activeData.length} inspected videos in sequence`
                : 'Current video highlighted in emerald · Related videos in deep pine'}
            </span>
            {video.viewCount !== null && (
              <span className="font-mono font-medium text-[#C7D4CD] tabular-nums">
                Current: {formatExactViews(video.viewCount)} views
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#7E9288] py-4 border-t border-white/[0.06]">
          View count comparison chart appears when related videos report public view counts.
        </p>
      )}

      {/* Related Videos Summary List */}
      <div className="pt-4 border-t border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-[#ECF3EF]">
            Related Videos Summary
          </h3>
          <span className="font-mono text-xs text-[#7E9288] tabular-nums">
            {video.relatedVideos.length} videos
          </span>
        </div>

        {video.relatedVideos.length === 0 ? (
          <p className="text-xs text-[#7E9288]">
            No related video recommendations were returned for this video.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {video.relatedVideos.slice(0, 8).map((rel) => (
              <div
                key={rel.videoId}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#090E0B] p-2.5 hover:bg-[#111A15] hover:border-emerald-500/35 transition-all duration-200 smooth-ease"
              >
                <button
                  type="button"
                  onClick={() => onInspectVideo(rel.url)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left group min-h-[56px]"
                >
                  <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-[#131C17] shrink-0">
                    <SafeImage
                      src={rel.thumbnailUrl}
                      alt={rel.title}
                      className="h-full w-full object-cover"
                    />
                    {rel.duration && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#ECF3EF] tabular-nums">
                        {rel.duration}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-display text-xs sm:text-sm font-semibold text-[#ECF3EF] group-hover:text-emerald-400 line-clamp-2 leading-snug transition-colors">
                      {rel.title}
                    </p>
                    <p className="text-[11px] sm:text-xs text-[#899C92] truncate tabular-nums">
                      {rel.channelName}
                      {rel.viewCountText ? ` · ${rel.viewCountText}` : ''}
                      {rel.publishedTimeText ? ` · ${rel.publishedTimeText}` : ''}
                    </p>
                  </div>
                </button>

                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onInspectVideo(rel.url)}
                    title="Inspect this video"
                    aria-label={`Inspect ${rel.title}`}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#899C92] hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    <ScanSearch className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <a
                    href={rel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open on YouTube"
                    aria-label={`Open ${rel.title} on YouTube`}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#6D8076] hover:text-[#ECF3EF] hover:bg-white/[0.06] transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
