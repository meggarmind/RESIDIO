'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PropertyHeroCard } from './property-hero-card';
import type { ResidentSummary } from '@/actions/houses/get-house-residents';
import type { ResidentRole, HouseWithStreet } from '@/types/database';

interface PropertyData {
  house: HouseWithStreet;
  residentRole: ResidentRole;
  isPrimary: boolean;
  residents: ResidentSummary[];
}

interface PropertyCarouselProps {
  properties: PropertyData[];
  onPropertyClick?: (houseId: string) => void;
  className?: string;
}

export function PropertyCarousel({
  properties,
  onPropertyClick,
  className,
}: PropertyCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const scrollToIndex = useCallback((index: number) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const cards = container.querySelectorAll('[data-property-card]');
    if (cards[index]) {
      cards[index].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, []);

  const goToNext = useCallback(() => {
    if (activeIndex < properties.length - 1) {
      const newIndex = activeIndex + 1;
      setActiveIndex(newIndex);
      scrollToIndex(newIndex);
    }
  }, [activeIndex, properties.length, scrollToIndex]);

  const goToPrev = useCallback(() => {
    if (activeIndex > 0) {
      const newIndex = activeIndex - 1;
      setActiveIndex(newIndex);
      scrollToIndex(newIndex);
    }
  }, [activeIndex, scrollToIndex]);

  // Handle touch events for swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      goToNext();
    } else if (isRightSwipe) {
      goToPrev();
    }
  };

  // Handle scroll snap detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerWidth = container.offsetWidth;
      const scrollLeft = container.scrollLeft;
      const newIndex = Math.round(scrollLeft / containerWidth);
      if (newIndex !== activeIndex && newIndex >= 0 && newIndex < properties.length) {
        setActiveIndex(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeIndex, properties.length]);

  if (properties.length === 0) {
    return null;
  }

  // Single property - no carousel needed
  if (properties.length === 1) {
    const prop = properties[0];
    return (
      <div className={className}>
        <PropertyHeroCard
          house={prop.house}
          residentRole={prop.residentRole}
          currentResidents={prop.residents}
          isPrimary={prop.isPrimary}
          onClick={() => onPropertyClick?.(prop.house.id)}
        />
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Carousel Container */}
      <div
        ref={containerRef}
        className={cn(
          'flex gap-4 overflow-x-auto snap-x snap-mandatory',
          'scrollbar-hide scroll-smooth',
          '-mx-4 px-4 pb-2' // Negative margin for edge-to-edge scroll, padding for content
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {properties.map((prop, index) => (
          <div
            key={prop.house.id}
            data-property-card
            className="snap-center shrink-0 w-[calc(100%-2rem)] md:w-[calc(50%-1rem)]"
          >
            <PropertyHeroCard
              house={prop.house}
              residentRole={prop.residentRole}
              currentResidents={prop.residents}
              isPrimary={prop.isPrimary}
              onClick={() => onPropertyClick?.(prop.house.id)}
            />
          </div>
        ))}
      </div>

      {/* Navigation Arrows (Desktop) */}
      <div className="hidden md:flex items-center justify-between absolute inset-y-0 -left-2 -right-2 pointer-events-none">
        <Button
          variant="outline"
          size="icon"
          className={cn(
            'rounded-full shadow-md pointer-events-auto bg-background/80 backdrop-blur-sm',
            activeIndex === 0 && 'opacity-0 pointer-events-none'
          )}
          onClick={goToPrev}
          disabled={activeIndex === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            'rounded-full shadow-md pointer-events-auto bg-background/80 backdrop-blur-sm',
            activeIndex === properties.length - 1 && 'opacity-0 pointer-events-none'
          )}
          onClick={goToNext}
          disabled={activeIndex === properties.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Dot Indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {properties.map((prop, index) => (
          <button
            key={prop.house.id}
            className={cn(
              'h-1.5 rounded-full transition-all duration-200',
              index === activeIndex
                ? 'w-4 bg-primary'
                : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            )}
            onClick={() => {
              setActiveIndex(index);
              scrollToIndex(index);
            }}
            aria-label={`Go to property ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
