/**
 * Shared look and motion for every Recharts chart, so all graphs animate and read the same.
 */

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Slow, eased entrance for a chart series. `order` staggers multiple series in one chart
 * (0 = first) so they draw one after another instead of all at once.
 */
export const chartAnimation = (order = 0) => ({
  isAnimationActive: !reducedMotion(),
  animationBegin: 350 + order * 300, // let the card fade in first
  animationDuration: 1800,
  animationEasing: 'ease-out' as const,
});

/**
 * Bars read best when they rise quickly: a shorter duration and a tighter stagger
 * than lines and the donut.
 */
export const barAnimation = (order = 0) => ({
  isAnimationActive: !reducedMotion(),
  animationBegin: 300 + order * 150,
  animationDuration: 900,
  animationEasing: 'ease-out' as const,
});

/** Donut / pie: one continuous, even sweep (ease-in-out avoids a fast start and a crawl at the end). */
export const pieAnimation = {
  isAnimationActive: !reducedMotion(),
  animationBegin: 300,
  animationDuration: 1300,
  animationEasing: 'ease-in-out' as const,
};

/** Tooltip styling that works in light and dark mode. */
export const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'rgba(23, 23, 23, 0.95)',
    border: '1px solid rgba(64, 64, 64, 0.5)',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '12px',
    padding: '8px 12px',
    boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.45)',
  },
  itemStyle: { color: '#fff', padding: '1px 0' },
  labelStyle: { color: '#a3a3a3', fontWeight: 600, marginBottom: 4 },
  animationDuration: 200,
};

/** Soft column highlight behind hovered bars. */
export const barCursor = { fill: 'rgba(99, 102, 241, 0.08)' };

/** Dashed guide line for hovered points on line charts. */
export const lineCursor = { stroke: 'rgba(99, 102, 241, 0.35)', strokeWidth: 1, strokeDasharray: '4 4' };

/** Clean axes: no axis or tick lines, muted labels. */
export const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: '#8a8f98' },
};
