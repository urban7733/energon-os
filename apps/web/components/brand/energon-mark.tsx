import { useId } from "react";

/** Vector Energon emblem: glass disc, ice rim light and the three-bar "E". */
export function EnergonMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`ex-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-disc`} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#1a2430" />
          <stop offset="0.7" stopColor="#07090c" />
          <stop offset="1" stopColor="#050607" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#9bdcff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#9bdcff" />
        </linearGradient>
        <linearGradient id={`${id}-bar`} x1="8" y1="9" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c7ecff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${id}-disc)`} stroke={`url(#${id}-rim)`} strokeWidth="1.1" />
      <g fill={`url(#${id}-bar)`} fillOpacity="0.14" stroke={`url(#${id}-bar)`} strokeWidth="0.9" strokeLinejoin="round">
        <path d="M11.3 9h13.3l-2.6 3.1H8.5z" />
        <path d="M8.5 16.2l2.6-1.6H20l-2.6 3.2h-6.3z" />
        <path d="M8.5 20.5h13.3l2.5 3.1h-13z" />
      </g>
    </svg>
  );
}

export function EnergonWordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="ex-wordmark">
      <EnergonMark size={size} />
      <span>
        Energon<em>OS</em>
      </span>
    </span>
  );
}
