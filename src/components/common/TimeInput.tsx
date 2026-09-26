import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';

interface TimeInputProps {
  value: string; // 24-hour "HH:mm", or '' when empty
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const PANEL_WIDTH = 232;
const PANEL_HEIGHT = 292;
const ROW_HEIGHT = 32;

const parse = (value: string) => {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h12: h % 12 || 12, m, pm: h >= 12 };
};

const to24 = (h12: number, m: number, pm: boolean) => `${pad((h12 % 12) + (pm ? 12 : 0))}:${pad(m)}`;

export const formatTime12 = (value: string) => {
  const t = parse(value);
  return t ? `${pad(t.h12)}:${pad(t.m)} ${t.pm ? 'PM' : 'AM'}` : '';
};

const Column: React.FC<{
  label: string;
  items: { key: string; label: string; selected: boolean; onSelect: () => void }[];
  open: boolean;
}> = ({ label, items, open }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Bring the selected value into view when the panel opens.
  useEffect(() => {
    if (!open || !ref.current) return;
    const idx = items.findIndex((i) => i.selected);
    if (idx >= 0) ref.current.scrollTop = Math.max(0, idx * ROW_HEIGHT - ROW_HEIGHT * 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 text-center">
        {label}
      </div>
      <div ref={ref} className="h-[208px] overflow-y-auto px-1 space-y-0.5 [scrollbar-width:thin]">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.onSelect}
            style={{ height: ROW_HEIGHT - 2 }}
            className={`w-full rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
              it.selected
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/** Professional 12-hour time picker: one popover with Hours, Minutes and AM/PM columns. */
export const TimeInput: React.FC<TimeInputProps> = ({
  value,
  onChange,
  disabled,
  placeholder = '--:-- --',
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const t = parse(value);

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const top = below < PANEL_HEIGHT + 8 && r.top > PANEL_HEIGHT + 8 ? r.top - PANEL_HEIGHT - 6 : r.bottom + 6;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - PANEL_WIDTH - 8);
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Picking from an empty field fills the rest with office-hours guesses (8–11 AM, 12–7 PM).
  const setHour = (h12: number) => onChange(to24(h12, t?.m ?? 0, t ? t.pm : h12 === 12 || h12 < 8));
  const setMinute = (m: number) => onChange(to24(t?.h12 ?? 9, m, t?.pm ?? false));
  const setPeriod = (pm: boolean) => onChange(to24(t?.h12 ?? (pm ? 6 : 9), t?.m ?? 0, pm));

  const setNow = () => {
    const d = new Date();
    onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          className="fixed z-[100] origin-top animate-pop rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl ring-1 ring-black/5"
        >
          <div className="px-3 pt-3 pb-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-500">Select time</span>
            <span className="text-sm font-bold font-mono text-neutral-900 dark:text-neutral-100">
              {t ? formatTime12(value) : '--:-- --'}
            </span>
          </div>

          <div className="flex gap-1 px-1.5 pt-2 divide-x divide-neutral-100 dark:divide-neutral-800">
            <Column
              label="Hour"
              open={open}
              items={HOURS.map((h) => ({
                key: `h${h}`,
                label: pad(h),
                selected: t?.h12 === h,
                onSelect: () => setHour(h),
              }))}
            />
            <Column
              label="Min"
              open={open}
              items={MINUTES.map((m) => ({
                key: `m${m}`,
                label: pad(m),
                selected: t?.m === m,
                onSelect: () => setMinute(m),
              }))}
            />
            <Column
              label="Period"
              open={open}
              items={[false, true].map((pm) => ({
                key: pm ? 'pm' : 'am',
                label: pm ? 'PM' : 'AM',
                selected: !!t && t.pm === pm,
                onSelect: () => setPeriod(pm),
              }))}
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2 mt-1 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={setNow}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 cursor-pointer"
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Clear
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 w-[118px] px-2.5 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
          open
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-neutral-900'
            : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600'
        } ${t ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400'}`}
      >
        <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="flex-1 text-left">{t ? formatTime12(value) : placeholder}</span>
      </button>
      {panel}
    </>
  );
};
