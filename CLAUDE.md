# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run build` / `npm start` — production build / serve
- `npm run lint` — type check only (`tsc --noEmit`); there is no ESLint and no test suite

**Windows path gotcha:** the repo lives under `D:\Attendance&Payroll\`. The `&` breaks npm's `.cmd` shims, so `npm run dev` fails with `'Payroll\AP-Code\node_modules\.bin\' is not recognized`. Invoke the binaries through node instead:

```
node node_modules/next/dist/bin/next dev
node node_modules/typescript/bin/tsc --noEmit
```

`GEMINI_API_KEY` in `.env.local` is only needed for the AI summary on the Analytics page (`app/api/ai-summary/route.ts`); everything else works without it.

## Architecture

**A client-only SPA inside Next.js.** `app/page.tsx` loads `src/App.tsx` with `next/dynamic(..., { ssr: false })` because all state lives in `localStorage` (SSR caused hydration mismatches). There is no backend or database: the only server code is the Gemini API route. React components live in `src/views/`, not `src/pages/` — a `src/pages` folder would be picked up by Next's Pages Router and break the build.

**Routing is state, not URLs.** `App.tsx` holds `currentPage` and renders one view. Navigation is `onNavigate(pageId)` / `onNavigateTab(pageId)` passed down from `App` → `AppLayout` → `Sidebar`/`TopBar`. Page ids: `dashboard, attendance, leaves, annual-leave, employees, payroll, payslips, loans, analytics, shifts, holidays, reports, users, settings`. Adding a page means updating `App.tsx`, the `navItems` list in `Sidebar.tsx`, `tabLabels` in `TopBar.tsx`, and `PAGE_ACCESS` in `utils/permissions.ts`. Views can't receive params from navigation; the one cross-page hand-off (bell → Attendance "Regularizations" tab) uses `sessionStorage['workpulse_attendance_view']` plus a `workpulse:attendance-view` window event.

**Data layer: `src/services/storageService.ts`.** A singleton wrapping `localStorage` (`workpulse_*` keys) for settings, employees, shifts, holidays, attendance, leaves, regularizations, loans, payrolls and user accounts. It seeds from `src/data/seedData.ts` on first load (guarded by `workpulse_seeded_v3`) and runs small one-time migrations in `ensureInitialized()`. Views read it straight into `useState(() => storageService.getX())` and re-read after writes. Nothing is reactive, so after saving, reload the affected state (or call the parent's `onSaved` / `onRefreshData`).

**Access control: `src/utils/permissions.ts` + `src/context/AuthContext.tsx`.**
- Roles: `manager` (head, full access), `attendance_manager`, `payroll_manager`, `assistant_manager`, `employee`.
- Each role maps to a list of `Permission` strings.
- Check permissions with `useAuth().can('leaves.approve')` and `canOpen(pageId)`, never by comparing role names.
- `App.tsx` falls back to the dashboard when `canOpen` fails.
- Accounts are `UserAccount` records in storage, managed on the Users & Access page (`views/UsersPage.tsx`).
- Legacy roles `admin` / `hr` are mapped by `normalizeRole`.
- The session is re-validated against stored accounts on load.
- This is client-side only, not real security: passwords are plain text in `localStorage`.

**Business logic in pure modules** (keep calculations here, not in views):
- `utils/attendanceEngine.ts`: `evaluateAttendanceStatus` derives Present / Late / Half Day / Absent, plus worked and overtime minutes, from check-in/out times and the shift (grace period, break, half-day threshold, working days, holidays).
- `utils/annualLeaveEngine.ts`: monthly leave accrual. `AppSettings.annualLeavePolicy` sets days per month (default 2.5, so 30 per year), when a month is credited, and a carry-forward cap. The joining month is prorated by days, and approved Annual leave counts against the month it starts in. Everything is computed from joining date and leaves, nothing stored; `computeAnnualLeave` gives one year, `computeLeaveRecord` the lifetime record. Leave Management, Reports and Analytics all use this for Annual balances.
- `utils/payrollEngine.ts`: salary, tax slabs, currency formatting.
- `services/analyticsService.ts`: KPI and chart aggregations for Analytics.
- `services/approvalService.ts`: `reviewLeave` / `reviewRegularization`. Approving leave writes `On Leave` attendance for the employee's shift working days; approving a correction re-evaluates the day's status. The bell (TopBar), LeavesPage and AttendancePage all call these, so any change to approval behaviour goes here.

**Dates:** always build `YYYY-MM-DD` strings from local date parts. `toISOString().slice(0, 10)` shifts the day in UTC+5 (Pakistan), which caused off-by-one leave records before.

**Settings** come from `SettingsContext` (`useSettings()`: `settings`, `updateSettings`, `formatMoney`, dark mode). Read the annual leave policy via `getAnnualLeavePolicy(settings)`, which fills in defaults for older saved settings.

## UI conventions

- Tailwind v4 with dark mode as a `.dark` class on `<html>` (`@custom-variant dark` in `src/index.css`). Every surface pairs light classes with `dark:` variants.
- `src/index.css` holds global light-mode overrides that restyle existing utilities rather than touching components:
  - `border-neutral-100/200` borders are drawn one shade darker.
  - White `rounded-xl`/`rounded-2xl` bordered cards get layered shadows instead of outlines (`--wp-surface-shadow`).
  - Inputs and white buttons get `--wp-field-shadow`; boxes nested in cards get `--wp-inner-shadow`.
  - The selectors are wrapped in `:where()` so they keep single-class specificity, and `hover:`, `focus:`, rings and dark mode still win. Keep that pattern when adding overrides.
- Motion:
  - `App.tsx` wraps the current view in `<div key={page} className="wp-page">`. CSS in `index.css` cascades the page's top-level sections, staggers top-level grid cards, fades table rows, grows progress bars, and skips `.fixed` children (dialogs).
  - Animation utilities: `animate-fade-up`, `animate-fade-in`, `animate-scale-in` (Modal), `animate-pop` (dropdowns), `animate-toast`.
  - All motion is disabled under `prefers-reduced-motion`.
- Charts (Recharts) take their props from `utils/chartTheme.ts`: `chartAnimation(order)` for lines, `barAnimation(order)`, `pieAnimation`, `tooltipStyle`, `axisProps`, `barCursor` / `lineCursor`. Recharts restarts an animation whenever its data or children change by reference, so memoize chart data and `<Cell>` arrays, and avoid periodic re-renders on chart pages. The dashboard clock only ticks on the employee view for this reason.
- Shared components:
  - `Modal` and `ConfirmDialog` for dialogs.
  - `TimeInput` for 12-hour time picking. It stores `HH:mm` in 24-hour form, renders its popover in a portal, and exports `formatTime12`.
  - `AnimatedNumber` for count-up KPIs.
  - `Badge` for status pills.
- Toasts: `useNotification()` gives `success`, `error`, `warning` and `info`.
