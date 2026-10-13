import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRightLeft,
  Ban,
  Briefcase,
  ChevronDown,
  Home,
  LogOut,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { Employee } from '../../types';

/** Which Employee Action dialog to open. */
export type EmployeeActionKind = 'transfer' | 'revision' | 'Field Duty' | 'WFH' | 'Suspension' | 'exit';

const ITEMS: { kind: EmployeeActionKind; label: string; hint: string; icon: React.ElementType; danger?: boolean }[] = [
  { kind: 'transfer', label: 'Transfer', hint: 'Department, shift or designation', icon: ArrowRightLeft },
  { kind: 'revision', label: 'Promotion / Salary', hint: 'New designation or basic salary', icon: TrendingUp },
  { kind: 'Field Duty', label: 'Field Duty', hint: 'Out of office on duty', icon: MapPin },
  { kind: 'WFH', label: 'Work From Home', hint: 'Working remotely', icon: Home },
  { kind: 'Suspension', label: 'Suspension', hint: 'Unpaid until it ends', icon: Ban, danger: true },
  { kind: 'exit', label: 'Exit', hint: 'Resigned or terminated', icon: LogOut, danger: true },
];

const MENU_WIDTH = 232;
const MENU_HEIGHT = 330;

interface Props {
  employee: Employee;
  onSelect: (kind: EmployeeActionKind, employee: Employee) => void;
  /** Compact icon-style trigger for table rows. */
  compact?: boolean;
}

/** "Actions" dropdown on an employee row and the profile. Rendered in a portal so tables don't clip it. */
export const EmployeeActionsMenu: React.FC<Props> = ({ employee, onSelect, compact }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inactive = employee.status !== 'Active';

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const top = below < MENU_HEIGHT + 8 && r.top > MENU_HEIGHT + 8 ? r.top - MENU_HEIGHT - 6 : r.bottom + 6;
    const left = Math.min(Math.max(8, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          compact
            ? 'px-2 py-1 inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer'
            : 'px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer'
        }
        aria-haspopup="menu"
        aria-expanded={open}
        title="Employee actions"
      >
        <Briefcase className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        Actions
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="fixed z-[100] origin-top-right animate-pop rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl ring-1 ring-black/5 py-1.5"
          >
            <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {employee.name}
            </p>
            {ITEMS.map((item) => {
              const Icon = item.icon;
              // Former staff can still get transfer / salary corrections, but no new duty period or exit.
              const disabled =
                (inactive && item.kind !== 'transfer' && item.kind !== 'revision') ||
                (item.kind === 'exit' && Boolean(employee.lastWorkingDay));
              return (
                <button
                  key={item.kind}
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    setOpen(false);
                    onSelect(item.kind, employee);
                  }}
                  className="w-full px-3 py-1.5 flex items-start gap-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      item.danger ? 'text-rose-500' : 'text-indigo-500 dark:text-indigo-400'
                    }`}
                  />
                  <span>
                    <span className="block text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                      {item.label}
                    </span>
                    <span className="block text-[11px] text-neutral-400">{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};
