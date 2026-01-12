/**
 * Portal Animation Variants Library - Modern Design System
 *
 * Centralized animation definitions using Framer Motion for consistent
 * animations across the resident portal. All animations use spring physics
 * for natural, smooth motion.
 *
 * Usage:
 * import { fadeInUp, staggerChildren, cardHover } from '@/lib/animations/portal-animations';
 *
 * <motion.div variants={fadeInUp} initial="hidden" animate="visible">
 *   Content
 * </motion.div>
 */

import type { Variants, Transition } from 'framer-motion';

// ============================================================================
// SPRING PHYSICS CONFIGURATIONS
// ============================================================================

/**
 * Default spring physics for natural, smooth animations
 */
export const spring: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 1,
};

/**
 * Gentle spring for subtle animations
 */
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
  mass: 1,
};

/**
 * Bouncy spring for playful animations
 */
export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 20,
  mass: 1,
};

/**
 * Fast spring for quick transitions
 */
export const springFast: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
  mass: 0.8,
};

// ============================================================================
// ENTRANCE ANIMATIONS
// ============================================================================

/**
 * Fade in from below with upward motion
 * Perfect for page sections and cards
 */
export const fadeInUp: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring,
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
};

/**
 * Fade in from above
 * Good for headers and navigation
 */
export const fadeInDown: Variants = {
  hidden: {
    opacity: 0,
    y: -20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring,
  },
};

/**
 * Fade in from left
 * Good for sidebar content
 */
export const fadeInLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: spring,
  },
};

/**
 * Fade in from right
 * Good for side panels and drawers
 */
export const fadeInRight: Variants = {
  hidden: {
    opacity: 0,
    x: 20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: spring,
  },
};

/**
 * Scale in from center
 * Perfect for modals and dialogs
 */
export const scaleIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: spring,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

/**
 * Scale in with bounce
 * Good for success notifications and badges
 */
export const scaleInBounce: Variants = {
  hidden: {
    opacity: 0,
    scale: 0,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springBouncy,
  },
};

// ============================================================================
// STAGGER ANIMATIONS
// ============================================================================

/**
 * Stagger container for child animations
 * Animates children with 100ms delay between each
 */
export const staggerChildren: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

/**
 * Fast stagger for lists and tables
 * 50ms delay between children
 */
export const staggerChildrenFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

/**
 * Slow stagger for emphasis
 * 150ms delay between children
 */
export const staggerChildrenSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

/**
 * Child item for stagger containers
 * Use with staggerChildren parent
 */
export const staggerItem: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring,
  },
};

// ============================================================================
// HOVER & INTERACTION ANIMATIONS
// ============================================================================

/**
 * Card lift effect on hover
 * Raises card and enhances shadow
 */
export const cardHover = {
  rest: {
    y: 0,
    scale: 1,
  },
  hover: {
    y: -4,
    scale: 1.02,
    transition: springGentle,
  },
  tap: {
    scale: 0.98,
    transition: springFast,
  },
};

/**
 * Subtle scale on hover
 * For buttons and interactive elements
 */
export const scaleHover = {
  rest: {
    scale: 1,
  },
  hover: {
    scale: 1.05,
    transition: springGentle,
  },
  tap: {
    scale: 0.95,
    transition: springFast,
  },
};

/**
 * Icon rotation on hover
 * For arrows and expandable elements
 */
export const rotateHover = {
  rest: {
    rotate: 0,
  },
  hover: {
    rotate: 90,
    transition: springGentle,
  },
};

// ============================================================================
// LIST & TABLE ANIMATIONS
// ============================================================================

/**
 * Row slide in from left
 * For table rows and list items
 */
export const rowSlideIn: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  visible: (custom: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      ...spring,
      delay: custom * 0.05, // 50ms stagger per row
    },
  }),
};

/**
 * Row fade in
 * Simpler alternative for dense lists
 */
export const rowFadeIn: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: (custom: number) => ({
    opacity: 1,
    transition: {
      duration: 0.2,
      delay: custom * 0.03, // 30ms stagger per row
    },
  }),
};

// ============================================================================
// LOADING ANIMATIONS
// ============================================================================

/**
 * Pulse animation for loading states
 */
export const pulse: Variants = {
  initial: {
    opacity: 1,
  },
  animate: {
    opacity: [1, 0.6, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Spin animation for loading spinners
 */
export const spin = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Shimmer effect for skeleton loaders
 */
export const shimmer: Variants = {
  initial: {
    backgroundPosition: '-200% 0',
  },
  animate: {
    backgroundPosition: '200% 0',
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// ============================================================================
// NOTIFICATION ANIMATIONS
// ============================================================================

/**
 * Toast notification slide in from top
 */
export const toastSlideIn: Variants = {
  hidden: {
    opacity: 0,
    y: -100,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springBouncy,
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

/**
 * Banner slide down from top
 */
export const bannerSlideDown: Variants = {
  hidden: {
    height: 0,
    opacity: 0,
  },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: springGentle,
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

// ============================================================================
// PAGE TRANSITION ANIMATIONS
// ============================================================================

/**
 * Page fade transition
 * Smooth fade between pages
 */
export const pageTransition: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

/**
 * Page slide transition
 * Slide between pages
 */
export const pageSlideTransition: Variants = {
  initial: {
    opacity: 0,
    x: 20,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: spring,
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.2 },
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a custom stagger delay function
 * @param index - Item index
 * @param delayPerItem - Delay in seconds per item
 * @returns Delay in seconds
 */
export function getStaggerDelay(index: number, delayPerItem: number = 0.1): number {
  return index * delayPerItem;
}

/**
 * Create custom variants with delay
 * @param variants - Base variants
 * @param delay - Delay in seconds
 * @returns Variants with delay applied
 */
export function withDelay(variants: Variants, delay: number): Variants {
  const delayed: Variants = {};
  Object.keys(variants).forEach((key) => {
    const variant = variants[key];
    if (typeof variant === 'object' && variant !== null) {
      delayed[key] = {
        ...variant,
        transition: {
          ...(typeof variant.transition === 'object' ? variant.transition : {}),
          delay,
        },
      };
    } else {
      delayed[key] = variant;
    }
  });
  return delayed;
}

/**
 * Combine multiple variants
 * Later variants override earlier ones
 */
export function combineVariants(...variantsList: Variants[]): Variants {
  return variantsList.reduce((acc, variants) => ({ ...acc, ...variants }), {});
}
