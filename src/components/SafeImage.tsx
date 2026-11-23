import { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';

interface SafeImageProps {
  src: string | null | undefined;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  initials?: string;
}

export function SafeImage({
  src,
  fallbackSrc,
  alt,
  className = '',
  fallbackLabel,
  initials,
}: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(src ?? fallbackSrc ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(src ?? fallbackSrc ?? null);
    setFailed(false);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    } else {
      setFailed(true);
    }
  };

  if (!currentSrc || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0F1713] to-[#16221C] text-[#7E9288] select-none ${className}`}
      >
        {initials ? (
          <span className="font-display text-lg font-semibold tracking-tight text-emerald-300">
            {initials}
          </span>
        ) : (
          <>
            <ImageOff className="h-6 w-6 text-[#5A6E64]" aria-hidden="true" />
            {fallbackLabel && (
              <span className="mt-1.5 px-3 text-center text-xs font-medium text-[#8FA399]">
                {fallbackLabel}
              </span>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
      loading="lazy"
    />
  );
}
