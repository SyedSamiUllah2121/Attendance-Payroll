import React, { useLayoutEffect, useRef, useState } from 'react';

interface FitToScreenProps {
  children: React.ReactNode;
  className?: string;
  /** Classes for the scaled content box (it is at least as tall as the container). */
  innerClassName?: string;
  /** Only scale at or above this window width; smaller screens scroll normally. */
  minWidth?: number;
}

/**
 * Scales its content down (never up) so it always fits the container without scrolling.
 * The content keeps at least the container's height, so on tall screens it can spread out
 * (e.g. justify-between) and on short screens it shrinks uniformly instead of overflowing.
 */
export const FitToScreen: React.FC<FitToScreenProps> = ({
  children,
  className = '',
  innerClassName = '',
  minWidth = 1024,
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [boxHeight, setBoxHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const measure = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      if (window.innerWidth < minWidth) {
        setScale(1);
        setBoxHeight(undefined);
        return;
      }
      const available = outer.clientHeight;
      setBoxHeight(available);
      // scrollHeight is the unscaled height (transforms don't affect layout)
      const needed = Math.max(inner.scrollHeight, 1);
      setScale(Math.min(1, available / needed));
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (outerRef.current) observer.observe(outerRef.current);
    if (innerRef.current) observer.observe(innerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [minWidth]);

  return (
    <div ref={outerRef} className={`relative overflow-hidden flex items-center justify-center ${className}`}>
      <div
        ref={innerRef}
        className={`w-full shrink-0 ${innerClassName}`}
        style={{
          minHeight: boxHeight,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
};
