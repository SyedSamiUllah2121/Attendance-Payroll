import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** How to display the in-between values (defaults to the target's decimal places). */
  format?: (n: number) => string;
  duration?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const decimalsOf = (n: number) => (Number.isInteger(n) ? 0 : String(n).split('.')[1]?.length || 0);

/** Counts up from the previous value (0 on first render) to `value` with an ease-out curve. */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, format, duration = 800 }) => {
  const [display, setDisplay] = useState(prefersReducedMotion() ? value : 0);
  const fromRef = useRef(prefersReducedMotion() ? value : 0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = value;
    };
  }, [value, duration]);

  const decimals = decimalsOf(value);
  return <>{format ? format(display) : display.toFixed(decimals)}</>;
};
