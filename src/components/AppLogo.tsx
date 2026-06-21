interface AppLogoProps {
  className?: string;
  size?: number;
}

/** iHost app icon — Aurora redesign: rounded squircle, blue→violet gradient, refined iH mark. */
export function AppLogo({ className = "", size = 48 }: AppLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="logo-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F8EF7" />
          <stop offset="100%" stopColor="#6B5CE7" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-bg)" />
      <g transform="translate(16, 16) scale(1.15) translate(-13.25, -14.75)">
        <circle cx="11" cy="10" r="2.1" fill="white" />
        <path
          d="M11 14v8 M14 14v5 M14 17h4 M18 14v8"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
