import React, { useId } from 'react';

interface PostmarkProps {
  /** Text running around the ring. */
  ring: string;
  /** Centre word. */
  centre: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Dashed outer ring (rubber-stamp look). */
  dashed?: boolean;
}

/** Rubber-stamp postmark in navy ink. Decorative. */
export function Postmark({ ring, centre, size = 110, className = '', style, dashed = true }: PostmarkProps) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 114 114"
      className={`pointer-events-none mix-blend-multiply ${className}`}
      style={style}
    >
      <circle cx="57" cy="57" r="51" fill="none" stroke="#14213D" strokeWidth="3" strokeDasharray={dashed ? '10 3' : undefined} />
      <circle cx="57" cy="57" r="36" fill="none" stroke="#14213D" strokeWidth="1.5" />
      <path id={`pm-${id}`} d="M 18,57 A 39,39 0 1,1 96,57 A 39,39 0 1,1 18,57" fill="none" />
      <text fontSize="9.5" fontWeight="700" letterSpacing="2.2" fill="#14213D" fontFamily="Source Sans 3, sans-serif">
        <textPath href={`#pm-${id}`} startOffset="6%">
          {ring}
        </textPath>
      </text>
      <text
        x="57"
        y="62"
        textAnchor="middle"
        fontSize="16"
        fontWeight="900"
        fill="#14213D"
        fontFamily="Big Shoulders Display, sans-serif"
      >
        {centre}
      </text>
    </svg>
  );
}
