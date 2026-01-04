import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const avatarVariants = cva(
  'inline-flex items-center justify-center font-medium text-white rounded-full select-none shrink-0',
  {
    variants: {
      size: {
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-sm',
        lg: 'h-12 w-12 text-base',
        xl: 'h-16 w-16 text-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

// Color palette from Nahid design guide
const AVATAR_COLORS = [
  '#86EFAC', // Mint
  '#C4B5FD', // Lavender
  '#FDA4AF', // Coral
  '#5EEAD4', // Teal
  '#FDBA74', // Orange
  '#FDE047', // Yellow
  '#93C5FD', // Blue
  '#22C55E', // Green
  '#EF4444', // Red
  '#A78BFA', // Purple
];

/**
 * Generates a consistent color for a given string
 * Uses simple hash function to ensure same input always gives same color
 */
function getColorForString(str: string): string {
  if (!str) return AVATAR_COLORS[0];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Extracts initials from a name
 * Examples: "John Doe" -> "JD", "Jane" -> "J", "Mary Jane Smith" -> "MS"
 */
function getInitials(name: string): string {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  // Take first letter of first name and first letter of last name
  const firstInitial = parts[0].charAt(0);
  const lastInitial = parts[parts.length - 1].charAt(0);

  return (firstInitial + lastInitial).toUpperCase();
}

export interface AvatarCircleProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  /**
   * The full name to display initials for
   */
  name: string;
  /**
   * Optional image URL to display instead of initials
   */
  src?: string;
  /**
   * Optional alt text for the image
   */
  alt?: string;
  /**
   * Custom background color (hex code)
   * If not provided, color is auto-generated from name
   */
  backgroundColor?: string;
}

export function AvatarCircle({
  name,
  src,
  alt,
  backgroundColor,
  size,
  className,
  ...props
}: AvatarCircleProps) {
  const initials = getInitials(name);
  const bgColor = backgroundColor || getColorForString(name);

  if (src) {
    return (
      <div
        className={cn(avatarVariants({ size }), 'overflow-hidden', className)}
        {...props}
      >
        <img
          src={src}
          alt={alt || name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(avatarVariants({ size }), className)}
      style={{ backgroundColor: bgColor }}
      title={name}
      {...props}
    >
      {initials}
    </div>
  );
}
