"use client";

/**
 * The Resona mark, taken from the website: five rounded bars drawn as a
 * stroke, so it takes the colour of the text around it.
 */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4" />
    </svg>
  );
}

/** mark + wordmark lock-up, the website's nav brand */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`logo${className ? ` ${className}` : ""}`}>
      <LogoMark size={24} />
      <span className="logo-word">Resona</span>
    </span>
  );
}
