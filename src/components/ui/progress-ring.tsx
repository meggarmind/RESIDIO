'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  duration?: number;
  color?: string;
  gradientColor?: string;
  trackColor?: string;
  showValue?: boolean;
  label?: string;
  className?: string;
  lineCap?: 'butt' | 'round' | 'square';
}

export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 8,
  duration = 1000,
  color = 'hsl(142.1 76.2% 36.3%)',
  gradientColor,
  trackColor = 'hsl(240 5.9% 90%)',
  showValue = true,
  label,
  className,
  lineCap = 'round',
}: ProgressRingProps) {
  const [progress, setProgress] = useState(0);
  const circleRef = useRef<SVGCircleElement>(null);
  const rafRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const gradientIdRef = useRef<string>('');

  const clampedValue = Math.min(Math.max(value, 0), 100);
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    gradientIdRef.current = `progress-gradient-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }, []);

  useEffect(() => {
    startTimeRef.current = undefined;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = clampedValue * easeOutCubic;
      setProgress(currentValue);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [clampedValue, duration]);

  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90" style={{ overflow: 'visible' }}>
        {gradientColor && (
          <defs>
            <linearGradient id={gradientIdRef.current} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: gradientColor, stopOpacity: 1 }} />
            </linearGradient>
          </defs>
        )}
        <circle cx={center} cy={center} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} className="opacity-30" />
        <circle ref={circleRef} cx={center} cy={center} r={radius} fill="none" stroke={gradientColor ? `url(#${gradientIdRef.current})` : color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap={lineCap} className="transition-all duration-300 ease-out" style={{ filter: 'drop-shadow(0 0 4px rgba(0, 0, 0, 0.1))' }} />
      </svg>
      {(showValue || label) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {showValue && <span className="text-2xl font-bold tabular-nums">{Math.round(progress)}%</span>}
          {label && <span className="text-xs text-muted-foreground font-medium mt-0.5">{label}</span>}
        </div>
      )}
    </div>
  );
}
