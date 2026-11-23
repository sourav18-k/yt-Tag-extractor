import { Fragment } from 'react';

interface DescriptionTextProps {
  text: string;
}

const TOKEN_REGEX = /(https?:\/\/[^\s<>()]+|\b\d{1,2}:\d{2}(?::\d{2})?\b)/g;

function isSafeHttpUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function DescriptionText({ text }: DescriptionTextProps) {
  if (!text.trim()) {
    return (
      <p className="text-sm text-[#7E9288] italic">
        No description was provided for this video.
      </p>
    );
  }

  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-[#C7D4CD] break-words">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="h-2" aria-hidden="true" />;
        }

        const parts = line.split(TOKEN_REGEX);
        return (
          <p key={lineIdx}>
            {parts.map((part, partIdx) => {
              if (!part) return null;

              if (/^https?:\/\//i.test(part)) {
                const cleaned = part.replace(/[.,;!?)]+$/, '');
                const trailing = part.slice(cleaned.length);
                if (isSafeHttpUrl(cleaned)) {
                  return (
                    <Fragment key={partIdx}>
                      <a
                        href={cleaned}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 underline decoration-emerald-500/35 underline-offset-2 hover:text-emerald-300 hover:decoration-emerald-400 break-all transition-colors"
                      >
                        {cleaned}
                      </a>
                      {trailing}
                    </Fragment>
                  );
                }
              }

              if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(part)) {
                return (
                  <span
                    key={partIdx}
                    className="font-mono text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded tabular-nums"
                  >
                    {part}
                  </span>
                );
              }

              return <Fragment key={partIdx}>{part}</Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}
