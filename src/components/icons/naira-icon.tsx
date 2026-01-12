/**
 * Naira Currency Icon Component
 *
 * Simple SVG icon representing the Nigerian Naira (₦) symbol
 * Designed to match lucide-react icon sizing and styling
 */

interface NairaIconProps {
  className?: string;
  size?: number;
}

export function NairaIcon({ className, size = 24 }: NairaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Vertical line on left */}
      <line x1="8" y1="4" x2="8" y2="20" />

      {/* Vertical line on right */}
      <line x1="16" y1="4" x2="16" y2="20" />

      {/* Diagonal line connecting them */}
      <line x1="8" y1="4" x2="16" y2="20" />

      {/* Top horizontal line */}
      <line x1="5" y1="9" x2="19" y2="9" />

      {/* Bottom horizontal line */}
      <line x1="5" y1="15" x2="19" y2="15" />
    </svg>
  );
}
