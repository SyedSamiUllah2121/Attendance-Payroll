import React from 'react';
import { AttendanceStatus, LeaveStatus, PayrollStatus } from '../../types';

interface BadgeProps {
  status: AttendanceStatus | LeaveStatus | PayrollStatus | 'Active' | 'Inactive' | 'High' | 'Moderate' | 'Low' | string;
  className?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '', size = 'sm' }) => {
  let colorStyles = 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700';

  switch (status) {
    case 'Present':
    case 'Approved':
    case 'Paid':
    case 'Active':
    case 'Low':
      colorStyles = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/80';
      break;

    case 'Late':
    case 'Half Day':
    case 'Pending':
    case 'Processed':
    case 'Moderate':
      colorStyles = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/80';
      break;

    case 'Absent':
    case 'Rejected':
    case 'Inactive':
    case 'High':
      colorStyles = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/80';
      break;

    case 'On Leave':
    case 'Draft':
      colorStyles = 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/80';
      break;

    case 'Holiday':
    case 'Weekend':
      colorStyles = 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/80';
      break;
  }

  const sizeStyles = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded border whitespace-nowrap tabular-nums ${sizeStyles} ${colorStyles} ${className}`}
    >
      {status}
    </span>
  );
};
