import {
  AppSettings,
  AttendanceRecord,
  Employee,
  Holiday,
  LeaveRequest,
  Loan,
  PayrollItem,
  PayrollRun,
  RegularizationRequest,
  Shift,
} from '../types';
import { calculateSalary } from '../utils/payrollEngine';
import { evaluateAttendanceStatus, getWorkingDaysInMonth } from '../utils/attendanceEngine';

// Seeded pseudo-random generator for consistent deterministic records
function createSeededRandom(initialSeed: number) {
  let s = initialSeed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export const defaultSettings: AppSettings = {
  company: {
    name: 'WorkPulse Technologies',
    logoText: 'WorkPulse',
    address: 'Suite 400, Tech Innovation Boulevard, Silicon Valley, CA 94025',
    currency: 'Rs.',
    financialYearStartMonth: 7, // July
  },
  attendance: {
    defaultGracePeriod: 15,
    otMinimumMinutes: 30,
    otMultiplier: 1.5,
    latePenaltyEveryCount: 3,
    latePenaltyHalfDays: 0.5,
    halfDayThresholdHours: 4.5,
  },
  payroll: {
    hraPercentage: 40,
    medicalPercentage: 10,
    conveyanceFixed: 5000,
    providentFundPercentage: 5,
    socialSecurityFixed: 370,
    taxSlabs: [
      { id: 'slab-1', minIncome: 0, maxIncome: 600000, baseTax: 0, taxRate: 0 },
      { id: 'slab-2', minIncome: 600000, maxIncome: 1200000, baseTax: 0, taxRate: 0.05 },
      { id: 'slab-3', minIncome: 1200000, maxIncome: 2200000, baseTax: 30000, taxRate: 0.15 },
      { id: 'slab-4', minIncome: 2200000, maxIncome: 3200000, baseTax: 180000, taxRate: 0.25 },
      { id: 'slab-5', minIncome: 3200000, maxIncome: null, baseTax: 430000, taxRate: 0.35 },
    ],
  },
  leaveQuotas: {
    Annual: 14,
    Sick: 10,
    Casual: 8,
    Unpaid: 999,
  },
  annualLeavePolicy: {
    monthlyDays: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    creditTiming: 'end',
    joiningCutoffDay: 15,
    maxCarryForward: 0,
  },
};

export const defaultShifts: Shift[] = [
  {
    id: 'shift-morning',
    name: 'Morning Shift',
    startTime: '09:00',
    endTime: '18:00',
    breakDurationMinutes: 60,
    gracePeriodMinutes: 15,
    halfDayThresholdHours: 4.5,
    workingDays: [1, 2, 3, 4, 5], // Mon-Fri
  },
  {
    id: 'shift-evening',
    name: 'Evening Shift',
    startTime: '14:00',
    endTime: '23:00',
    breakDurationMinutes: 60,
    gracePeriodMinutes: 15,
    halfDayThresholdHours: 4.5,
    workingDays: [1, 2, 3, 4, 5], // Mon-Fri
  },
  {
    id: 'shift-weekend',
    name: 'Weekend Support',
    startTime: '10:00',
    endTime: '16:00',
    breakDurationMinutes: 30,
    gracePeriodMinutes: 10,
    halfDayThresholdHours: 3.0,
    workingDays: [0, 6], // Sun, Sat
  },
];

export const defaultHolidays: Holiday[] = [
  { id: 'hol-1', name: "New Year's Day", date: '2026-01-01', type: 'Public' },
  { id: 'hol-2', name: 'Kashmir Day', date: '2026-02-05', type: 'Public' },
  { id: 'hol-3', name: 'Pakistan Resolution Day', date: '2026-03-23', type: 'Public' },
  { id: 'hol-4', name: 'Eid ul-Fitr Holiday 1', date: '2026-04-10', type: 'Public' },
  { id: 'hol-5', name: 'Eid ul-Fitr Holiday 2', date: '2026-04-11', type: 'Public' },
  { id: 'hol-6', name: 'Labour Day', date: '2026-05-01', type: 'Public' },
  { id: 'hol-7', name: 'Eid ul-Adha', date: '2026-06-17', type: 'Public' },
  { id: 'hol-8', name: 'Independence Day', date: '2026-08-14', type: 'Public' },
  { id: 'hol-9', name: 'Defence Day', date: '2026-09-06', type: 'Company' },
  { id: 'hol-10', name: 'Iqbal Day', date: '2026-11-09', type: 'Public' },
  { id: 'hol-11', name: 'Quaid-e-Azam Day / Christmas', date: '2026-12-25', type: 'Public' },
];

export const defaultEmployees: Employee[] = [
  {
    id: 'EMP-001',
    name: 'Ali Khan',
    email: 'ali.khan@workpulse.com',
    phone: '+92 300 1234567',
    cnic: '42101-1234567-1',
    dob: '1992-04-14',
    gender: 'Male',
    address: '74-B Block 4, Gulshan-e-Iqbal, Karachi',
    department: 'Engineering',
    designation: 'Senior Developer',
    employmentType: 'Permanent',
    joiningDate: '2021-03-15',
    shiftId: 'shift-morning',
    bankName: 'Standard Chartered Bank',
    accountNumber: 'PK36SCBL0000001123456701',
    status: 'Active',
    basicSalary: 150000,
  },
  {
    id: 'EMP-002',
    name: 'Sara Ahmed',
    email: 'hr@workpulse.com',
    phone: '+92 301 2345678',
    cnic: '42201-2345678-2',
    dob: '1990-09-22',
    gender: 'Female',
    address: '12 Sunset Boulevard, Phase 6, DHA, Karachi',
    department: 'Human Resources',
    designation: 'HR Manager',
    employmentType: 'Permanent',
    joiningDate: '2020-07-01',
    shiftId: 'shift-morning',
    bankName: 'Habib Bank Limited (HBL)',
    accountNumber: 'PK08HABB0000002234567802',
    status: 'Active',
    basicSalary: 130000,
  },
  {
    id: 'EMP-003',
    name: 'Usman Tariq',
    email: 'usman.tariq@workpulse.com',
    phone: '+92 302 3456789',
    cnic: '42301-3456789-3',
    dob: '1994-01-18',
    gender: 'Male',
    address: '88 Khayaban-e-Ittehad, Phase 8, DHA',
    department: 'Finance',
    designation: 'Accountant',
    employmentType: 'Permanent',
    joiningDate: '2022-01-10',
    shiftId: 'shift-morning',
    bankName: 'Meezan Bank',
    accountNumber: 'PK19MEZN0000003345678903',
    status: 'Active',
    basicSalary: 90000,
  },
  {
    id: 'EMP-004',
    name: 'Ayesha Malik',
    email: 'ayesha.malik@workpulse.com',
    phone: '+92 303 4567890',
    cnic: '42401-4567890-4',
    dob: '1995-11-05',
    gender: 'Female',
    address: '45 Shaheed-e-Millat Road, PECHS',
    department: 'Engineering',
    designation: 'Frontend Developer',
    employmentType: 'Permanent',
    joiningDate: '2022-09-05',
    shiftId: 'shift-morning',
    bankName: 'Bank Alfalah',
    accountNumber: 'PK45ALFH0000004456789004',
    status: 'Active',
    basicSalary: 110000,
  },
  {
    id: 'EMP-005',
    name: 'Bilal Hussain',
    email: 'bilal.hussain@workpulse.com',
    phone: '+92 304 5678901',
    cnic: '42501-5678901-5',
    dob: '1996-03-30',
    gender: 'Male',
    address: 'Block 13-D, Gulshan, Karachi',
    department: 'Sales',
    designation: 'Sales Executive',
    employmentType: 'Permanent',
    joiningDate: '2023-02-20',
    shiftId: 'shift-morning',
    bankName: 'Faysal Bank',
    accountNumber: 'PK22FAYS0000005567890105',
    status: 'Active',
    basicSalary: 70000,
  },
  {
    id: 'EMP-006',
    name: 'Fatima Noor',
    email: 'fatima.noor@workpulse.com',
    phone: '+92 305 6789012',
    cnic: '42101-6789012-6',
    dob: '1989-12-14',
    gender: 'Female',
    address: '22 Marine Drive, Clifton, Karachi',
    department: 'Operations',
    designation: 'Operations Lead',
    employmentType: 'Permanent',
    joiningDate: '2019-11-11',
    shiftId: 'shift-morning',
    bankName: 'United Bank Limited (UBL)',
    accountNumber: 'PK60UNIL0000006678901206',
    status: 'Active',
    basicSalary: 120000,
  },
  {
    id: 'EMP-007',
    name: 'Hamza Raza',
    email: 'hamza.raza@workpulse.com',
    phone: '+92 306 7890123',
    cnic: '42201-7890123-7',
    dob: '1997-07-28',
    gender: 'Male',
    address: 'Block 7, Saadi Town, Karachi',
    department: 'Engineering',
    designation: 'QA Engineer',
    employmentType: 'Permanent',
    joiningDate: '2023-06-01',
    shiftId: 'shift-evening',
    bankName: 'MCB Bank',
    accountNumber: 'PK77MUCB0000007789012307',
    status: 'Active',
    basicSalary: 85000,
  },
  {
    id: 'EMP-008',
    name: 'Zainab Ali',
    email: 'zainab.ali@workpulse.com',
    phone: '+92 307 8901234',
    cnic: '42301-8901234-8',
    dob: '1991-05-19',
    gender: 'Female',
    address: '58 Khayaban-e-Shamsheer, DHA Phase 5',
    department: 'Sales',
    designation: 'Sales Manager',
    employmentType: 'Permanent',
    joiningDate: '2020-04-18',
    shiftId: 'shift-morning',
    bankName: 'Allied Bank',
    accountNumber: 'PK31ABPA0000008890123408',
    status: 'Active',
    basicSalary: 140000,
  },
  {
    id: 'EMP-009',
    name: 'Omar Farooq',
    email: 'omar.farooq@workpulse.com',
    phone: '+92 308 9012345',
    cnic: '42401-9012345-9',
    dob: '1999-02-12',
    gender: 'Male',
    address: 'Flat 402, Al-Razi Heights, North Nazimabad',
    department: 'Operations',
    designation: 'Support Agent',
    employmentType: 'Permanent',
    joiningDate: '2024-01-08',
    shiftId: 'shift-weekend',
    bankName: 'Meezan Bank',
    accountNumber: 'PK19MEZN0000009901234509',
    status: 'Active',
    basicSalary: 55000,
  },
  {
    id: 'EMP-010',
    name: 'Hira Shah',
    email: 'hira.shah@workpulse.com',
    phone: '+92 309 0123456',
    cnic: '42501-0123456-0',
    dob: '1987-04-03',
    gender: 'Female',
    address: '15 Khayaban-e-Bukhari, Phase 6, DHA',
    department: 'Finance',
    designation: 'Finance Manager',
    employmentType: 'Permanent',
    joiningDate: '2018-08-25',
    shiftId: 'shift-morning',
    bankName: 'Standard Chartered Bank',
    accountNumber: 'PK36SCBL0000000012345610',
    status: 'Active',
    basicSalary: 160000,
  },
  {
    id: 'EMP-011',
    name: 'Danish Iqbal',
    email: 'danish.iqbal@workpulse.com',
    phone: '+92 310 1234560',
    cnic: '42101-1234560-1',
    dob: '1993-08-15',
    gender: 'Male',
    address: '102 Falcon Complex, Malir Cantt',
    department: 'Engineering',
    designation: 'DevOps Engineer',
    employmentType: 'Contract',
    joiningDate: '2022-05-16',
    shiftId: 'shift-evening',
    bankName: 'Habib Metropolitan Bank',
    accountNumber: 'PK88HABB0000001123456011',
    status: 'Active',
    basicSalary: 125000,
  },
  {
    id: 'EMP-012',
    name: 'Maryam Javed',
    email: 'maryam.javed@workpulse.com',
    phone: '+92 311 2345671',
    cnic: '42201-2345671-2',
    dob: '2002-06-25',
    gender: 'Female',
    address: '78 Garden East, Karachi',
    department: 'Human Resources',
    designation: 'HR Intern',
    employmentType: 'Intern',
    joiningDate: '2025-07-01',
    shiftId: 'shift-morning',
    bankName: 'National Bank of Pakistan',
    accountNumber: 'PK55NBPB0000002234567112',
    status: 'Active',
    basicSalary: 35000,
  },
];

export const defaultLoans: Loan[] = [
  {
    id: 'loan-1',
    employeeId: 'EMP-003',
    loanType: 'Loan',
    totalAmount: 60000,
    monthlyInstallment: 10000,
    paidAmount: 50000,
    startMonth: '2026-04',
    status: 'Active',
    createdAt: '2026-03-25T10:00:00Z',
    notes: 'Home renovation loan approved by Finance committee.',
  },
  {
    id: 'loan-2',
    employeeId: 'EMP-005',
    loanType: 'Advance',
    totalAmount: 30000,
    monthlyInstallment: 5000,
    paidAmount: 15000,
    startMonth: '2026-06',
    status: 'Active',
    createdAt: '2026-05-28T14:30:00Z',
    notes: 'Emergency medical advance.',
  },
];

export const defaultLeaves: LeaveRequest[] = [
  {
    id: 'leave-1',
    employeeId: 'EMP-001',
    leaveType: 'Annual',
    fromDate: '2026-05-18',
    toDate: '2026-05-22',
    daysCount: 5,
    reason: 'Family vacation in northern areas.',
    status: 'Approved',
    appliedAt: '2026-05-10T09:00:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-05-11T11:00:00Z',
    reviewComment: 'Approved. Enjoy your time off!',
  },
  {
    id: 'leave-2',
    employeeId: 'EMP-004',
    leaveType: 'Sick',
    fromDate: '2026-06-08',
    toDate: '2026-06-09',
    daysCount: 2,
    reason: 'Severe migraine and fever.',
    status: 'Approved',
    appliedAt: '2026-06-08T07:30:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-06-08T08:15:00Z',
    reviewComment: 'Get well soon, Ayesha.',
  },
  {
    id: 'leave-3',
    employeeId: 'EMP-005',
    leaveType: 'Casual',
    fromDate: '2026-07-15',
    toDate: '2026-07-15',
    daysCount: 1,
    reason: 'Personal bank and passport appointment.',
    status: 'Approved',
    appliedAt: '2026-07-12T15:00:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-07-13T10:00:00Z',
    reviewComment: 'Approved.',
  },
  {
    id: 'leave-4',
    employeeId: 'EMP-007',
    leaveType: 'Casual',
    fromDate: '2026-07-24',
    toDate: '2026-07-24',
    isHalfDay: true,
    daysCount: 0.5,
    reason: 'Attending sibling university graduation ceremony.',
    status: 'Approved',
    appliedAt: '2026-07-20T11:30:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-07-21T09:20:00Z',
    reviewComment: 'Approved for 2nd half.',
  },
  {
    id: 'leave-5',
    employeeId: 'EMP-008',
    leaveType: 'Annual',
    fromDate: '2026-08-03',
    toDate: '2026-08-07',
    daysCount: 5,
    reason: 'Annual family break.',
    status: 'Approved',
    appliedAt: '2026-07-25T14:00:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-07-26T16:00:00Z',
    reviewComment: 'Approved. Coverage arranged.',
  },
  {
    id: 'leave-6',
    employeeId: 'EMP-011',
    leaveType: 'Sick',
    fromDate: '2026-08-20',
    toDate: '2026-08-21',
    daysCount: 2,
    reason: 'Food poisoning recovery.',
    status: 'Approved',
    appliedAt: '2026-08-20T08:00:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-08-20T09:00:00Z',
    reviewComment: 'Rest up.',
  },
  {
    id: 'leave-7',
    employeeId: 'EMP-002',
    leaveType: 'Annual',
    fromDate: '2026-09-28',
    toDate: '2026-10-02',
    daysCount: 5,
    reason: 'Scheduled rest leave.',
    status: 'Pending',
    appliedAt: '2026-09-21T10:00:00Z',
  },
  {
    id: 'leave-8',
    employeeId: 'EMP-003',
    leaveType: 'Casual',
    fromDate: '2026-09-25',
    toDate: '2026-09-25',
    daysCount: 1,
    reason: 'Vehicle inspection and registration renewal.',
    status: 'Pending',
    appliedAt: '2026-09-22T14:15:00Z',
  },
  {
    id: 'leave-9',
    employeeId: 'EMP-005',
    leaveType: 'Annual',
    fromDate: '2026-08-17',
    toDate: '2026-08-21',
    daysCount: 5,
    reason: 'Extended leave request during quarterly sales closing.',
    status: 'Rejected',
    appliedAt: '2026-08-10T12:00:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-08-11T14:00:00Z',
    reviewComment: 'Cannot approve during key quarterly targets week. Please reschedule.',
  },
  {
    id: 'leave-10',
    employeeId: 'EMP-009',
    leaveType: 'Casual',
    fromDate: '2026-07-04',
    toDate: '2026-07-05',
    daysCount: 2,
    reason: 'Weekend swap request with short notice.',
    status: 'Rejected',
    appliedAt: '2026-07-03T18:00:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-07-03T20:00:00Z',
    reviewComment: 'Requires 48h advance notice for support shift coverage.',
  },
];

export const defaultRegularizations: RegularizationRequest[] = [
  {
    id: 'reg-1',
    employeeId: 'EMP-001',
    date: '2026-09-15',
    currentCheckIn: '09:45',
    currentCheckOut: '18:15',
    requestedCheckIn: '08:55',
    requestedCheckOut: '18:15',
    reason: 'Biometric reader on 4th floor had network timeout on entry.',
    status: 'Pending',
    createdAt: '2026-09-15T18:30:00Z',
  },
  {
    id: 'reg-2',
    employeeId: 'EMP-004',
    date: '2026-09-18',
    currentCheckIn: undefined,
    currentCheckOut: '18:30',
    requestedCheckIn: '09:05',
    requestedCheckOut: '18:30',
    reason: 'Forgot NFC card in car; checked in with security desk guard.',
    status: 'Pending',
    createdAt: '2026-09-18T19:00:00Z',
  },
  {
    id: 'reg-3',
    employeeId: 'EMP-007',
    date: '2026-09-21',
    currentCheckIn: '14:35',
    currentCheckOut: '23:05',
    requestedCheckIn: '13:58',
    requestedCheckOut: '23:05',
    reason: 'Delayed at reception visitor gate due to client escort.',
    status: 'Pending',
    createdAt: '2026-09-22T08:00:00Z',
  },
  {
    id: 'reg-4',
    employeeId: 'EMP-003',
    date: '2026-08-11',
    currentCheckIn: '09:40',
    currentCheckOut: '18:05',
    requestedCheckIn: '09:00',
    requestedCheckOut: '18:05',
    reason: 'External audit firm early meeting at their office before arriving.',
    status: 'Approved',
    createdAt: '2026-08-11T18:15:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-08-12T10:00:00Z',
    reviewComment: 'Verified with Audit Lead.',
  },
  {
    id: 'reg-5',
    employeeId: 'EMP-006',
    date: '2026-07-28',
    currentCheckIn: '09:30',
    currentCheckOut: '18:20',
    requestedCheckIn: '08:50',
    requestedCheckOut: '18:20',
    reason: 'Hardware server room maintenance escort.',
    status: 'Approved',
    createdAt: '2026-07-28T18:45:00Z',
    reviewedBy: 'Sara Ahmed',
    reviewedAt: '2026-07-29T09:15:00Z',
    reviewComment: 'Approved based on ops log.',
  },
];

/**
 * Generates 6 full months of realistic attendance records (March 2026 - August 2026)
 * plus September 2026 to date (2026-09-23).
 */
export function generateSeedAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const rand = createSeededRandom(42);

  const shiftsMap: Record<string, Shift> = {};
  defaultShifts.forEach((s) => (shiftsMap[s.id] = s));

  // Months to generate: 2026-03 to 2026-09
  const months = [
    { year: 2026, month: 3, days: 31 },
    { year: 2026, month: 4, days: 30 },
    { year: 2026, month: 5, days: 31 },
    { year: 2026, month: 6, days: 30 },
    { year: 2026, month: 7, days: 31 },
    { year: 2026, month: 8, days: 31 },
    { year: 2026, month: 9, days: 23 }, // current month to date (Sept 23, 2026)
  ];

  for (const m of months) {
    for (let day = 1; day <= m.days; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(m.month).padStart(2, '0');
      const dateStr = `${m.year}-${monthStr}-${dayStr}`;
      const d = new Date(m.year, m.month - 1, day);
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

      const isHoliday = defaultHolidays.some((h) => h.date === dateStr);

      for (const emp of defaultEmployees) {
        const shift = shiftsMap[emp.shiftId] || defaultShifts[0];
        const isShiftWorkDay = shift.workingDays.includes(dayOfWeek);

        if (isHoliday) {
          records.push({
            id: `att-${emp.id}-${dateStr}`,
            employeeId: emp.id,
            date: dateStr,
            status: 'Holiday',
            workedMinutes: 0,
            overtimeMinutes: 0,
            isEarlyDeparture: false,
          });
          continue;
        }

        if (!isShiftWorkDay) {
          records.push({
            id: `att-${emp.id}-${dateStr}`,
            employeeId: emp.id,
            date: dateStr,
            status: 'Weekend',
            workedMinutes: 0,
            overtimeMinutes: 0,
            isEarlyDeparture: false,
          });
          continue;
        }

        // Check if on approved leave
        const onLeave = defaultLeaves.some(
          (lv) =>
            lv.employeeId === emp.id &&
            lv.status === 'Approved' &&
            dateStr >= lv.fromDate &&
            dateStr <= lv.toDate
        );

        if (onLeave) {
          records.push({
            id: `att-${emp.id}-${dateStr}`,
            employeeId: emp.id,
            date: dateStr,
            status: 'On Leave',
            workedMinutes: 0,
            overtimeMinutes: 0,
            isEarlyDeparture: false,
          });
          continue;
        }

        // If today (2026-09-23)
        if (dateStr === '2026-09-23') {
          // Live today: most employees already checked in this morning
          const r = rand();
          let checkInTime = '08:54';
          let status: any = 'Present';

          if (emp.id === 'EMP-001') {
            checkInTime = '08:52';
          } else if (emp.id === 'EMP-002') {
            checkInTime = '09:02';
          } else if (emp.id === 'EMP-003') {
            checkInTime = '08:58';
          } else if (emp.id === 'EMP-005') {
            // Late today
            checkInTime = '09:28';
            status = 'Late';
          } else if (emp.id === 'EMP-007' || emp.id === 'EMP-011') {
            // Evening shift
            checkInTime = '13:55';
          } else if (emp.id === 'EMP-009') {
            // Weekend shift
            checkInTime = undefined as any;
            status = 'Weekend';
          }

          if (status !== 'Weekend') {
            records.push({
              id: `att-${emp.id}-${dateStr}`,
              employeeId: emp.id,
              date: dateStr,
              checkIn: checkInTime,
              checkInLocation: {
                lat: 24.8607 + (r - 0.5) * 0.01,
                lng: 67.0011 + (r - 0.5) * 0.01,
                address: 'Main HQ Office, Tech Park, Karachi',
              },
              status: status,
              workedMinutes: 240, // live in progress
              overtimeMinutes: 0,
              isEarlyDeparture: false,
            });
          }
          continue;
        }

        // Historic date: simulate realistic attendance distributions
        // Base probabilities:
        // ~85% present on-time
        // ~8% late (higher on Monday ~14%, higher for Bilal Hussain EMP-005)
        // ~4% absent (Bilal has higher spells for Bradford factor)
        // ~3% half day
        // Overtime on ~20% of days (especially month-end engineering)

        const roll = rand();
        let isLate = false;
        let isAbsent = false;
        let isHalfDay = false;

        // Custom employee behavior
        if (emp.id === 'EMP-005') {
          // Bilal Hussain: more frequent short absence spells & lateness
          if (dayOfWeek === 1 && roll < 0.22) isLate = true;
          else if (roll < 0.16) isLate = true;
          else if (roll > 0.90) isAbsent = true;
          else if (roll > 0.86) isHalfDay = true;
        } else {
          // Normal distribution
          const lateThreshold = dayOfWeek === 1 ? 0.13 : 0.07;
          if (roll < lateThreshold) {
            isLate = true;
          } else if (roll > 0.96) {
            isAbsent = true;
          } else if (roll > 0.93) {
            isHalfDay = true;
          }
        }

        if (isAbsent) {
          records.push({
            id: `att-${emp.id}-${dateStr}`,
            employeeId: emp.id,
            date: dateStr,
            status: 'Absent',
            workedMinutes: 0,
            overtimeMinutes: 0,
            isEarlyDeparture: false,
          });
          continue;
        }

        // Generate check-in / check-out times based on shift
        const [shiftStartH, shiftStartM] = shift.startTime.split(':').map(Number);
        const [shiftEndH, shiftEndM] = shift.endTime.split(':').map(Number);

        let inH = shiftStartH;
        let inM = shiftStartM;

        if (isLate) {
          // Checked in 16 to 45 mins late
          const lateOffset = 16 + Math.floor(rand() * 30);
          inM += lateOffset;
          if (inM >= 60) {
            inH += Math.floor(inM / 60);
            inM = inM % 60;
          }
        } else {
          // Checked in 0 to 12 mins before or within grace period
          const earlyOffset = Math.floor(rand() * 18) - 10;
          inM += earlyOffset;
          if (inM < 0) {
            inH -= 1;
            inM += 60;
          } else if (inM >= 60) {
            inH += 1;
            inM -= 60;
          }
        }

        let outH = shiftEndH;
        let outM = shiftEndM;
        let overtimeMins = 0;

        if (isHalfDay) {
          // Checked out after ~3.5 to 4 hours
          outH = inH + 4;
          outM = inM;
        } else {
          // Check-out: normal or with overtime
          const isEngineering = emp.department === 'Engineering';
          const isMonthEnd = day >= 24;
          const otChance = isEngineering && isMonthEnd ? 0.45 : 0.20;

          if (rand() < otChance) {
            // 30 to 120 minutes of overtime
            overtimeMins = 30 + Math.floor(rand() * 90);
            outM += overtimeMins;
            if (outM >= 60) {
              outH += Math.floor(outM / 60);
              outM = outM % 60;
            }
          } else {
            // Left on time +/- 5 mins
            const leaveDiff = Math.floor(rand() * 10) - 4;
            outM += leaveDiff;
            if (outM < 0) {
              outH -= 1;
              outM += 60;
            } else if (outM >= 60) {
              outH += 1;
              outM -= 60;
            }
          }
        }

        const checkInFormatted = `${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}`;
        const checkOutFormatted = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;

        const evaluated = evaluateAttendanceStatus(
          checkInFormatted,
          checkOutFormatted,
          shift,
          dateStr,
          defaultHolidays,
          false
        );

        records.push({
          id: `att-${emp.id}-${dateStr}`,
          employeeId: emp.id,
          date: dateStr,
          checkIn: checkInFormatted,
          checkOut: checkOutFormatted,
          checkInLocation: {
            lat: 24.8607 + (rand() - 0.5) * 0.005,
            lng: 67.0011 + (rand() - 0.5) * 0.005,
            address: 'WorkPulse Office Floor 4, Karachi',
          },
          status: evaluated.status,
          workedMinutes: evaluated.workedMinutes,
          overtimeMinutes: evaluated.overtimeMinutes,
          isEarlyDeparture: evaluated.isEarlyDeparture,
        });
      }
    }
  }

  return records;
}

/**
 * Pre-generates the past 6 months of Payroll runs (2026-03 to 2026-08), all status "Paid".
 * Leaves current month (2026-09) ungenerated for user action!
 */
export function generateSeedPayrolls(
  attendanceRecords: AttendanceRecord[],
  employees: Employee[],
  settings: AppSettings,
  shifts: Shift[],
  holidays: Holiday[],
  loans: Loan[]
): PayrollRun[] {
  const pastMonths = [
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
  ];

  const shiftMap: Record<string, Shift> = {};
  shifts.forEach((s) => (shiftMap[s.id] = s));

  const runs: PayrollRun[] = [];

  for (const monthStr of pastMonths) {
    const [yearStr, mStr] = monthStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10);

    const items: PayrollItem[] = [];

    for (const emp of employees) {
      const shift = shiftMap[emp.shiftId] || shifts[0];
      const workingDays = getWorkingDaysInMonth(year, month, shift, holidays);

      // Filter attendance records for this employee in this month
      const empRecords = attendanceRecords.filter(
        (r) => r.employeeId === emp.id && r.date.startsWith(monthStr)
      );

      let presentDays = 0;
      let lateCount = 0;
      let halfDays = 0;
      let absentDays = 0;
      let unpaidLeaveDays = 0;
      let overtimeMinutes = 0;

      empRecords.forEach((r) => {
        if (r.status === 'Present') presentDays++;
        else if (r.status === 'Late') {
          presentDays++;
          lateCount++;
        } else if (r.status === 'Half Day') {
          halfDays++;
        } else if (r.status === 'Absent') {
          absentDays++;
        } else if (r.status === 'On Leave') {
          // Assume unpaid only if marked as such, default paid leave
        }

        if (r.overtimeMinutes > 0) {
          overtimeMinutes += r.overtimeMinutes;
        }
      });

      const overtimeHours = Math.round((overtimeMinutes / 60) * 10) / 10;

      // Active loan installment for this month
      const activeLoan = loans.find(
        (l) => l.employeeId === emp.id && l.status === 'Active' && l.startMonth <= monthStr
      );
      const loanInstallment = activeLoan ? activeLoan.monthlyInstallment : 0;

      // Bonus simulation
      const bonus = emp.department === 'Sales' && (month === 6 || month === 8) ? 10000 : 0;

      const calc = calculateSalary({
        basicSalary: emp.basicSalary,
        workingDaysInMonth: workingDays,
        shiftHoursPerDay: 8,
        presentDays,
        lateCount,
        halfDays,
        absentDays,
        unpaidLeaveDays,
        overtimeHours,
        bonus,
        loanInstallment,
        settings,
      });

      items.push({
        id: `payitem-${emp.id}-${monthStr}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        designation: emp.designation,
        basicSalary: emp.basicSalary,
        hra: calc.hra,
        medical: calc.medical,
        conveyance: calc.conveyance,
        grossSalary: calc.grossSalary,
        workingDays,
        presentDays,
        lateCount,
        halfDays,
        absentDays,
        unpaidLeaveDays,
        overtimeHours,
        overtimePay: calc.overtimePay,
        bonus: calc.bonus,
        totalEarnings: calc.totalEarnings,
        perDaySalary: calc.perDaySalary,
        hourlyRate: calc.hourlyRate,
        incomeTax: calc.incomeTax,
        providentFund: calc.providentFund,
        socialSecurity: calc.socialSecurity,
        lopDeduction: calc.lopDeduction,
        latePenaltyDeduction: calc.latePenaltyDeduction,
        loanInstallment: calc.loanInstallment,
        otherDeductions: calc.otherDeductions,
        totalDeductions: calc.totalDeductions,
        netSalary: calc.netSalary,
      });
    }

    const totalGross = items.reduce((acc, i) => acc + i.grossSalary + i.overtimePay + i.bonus, 0);
    const totalDeductions = items.reduce((acc, i) => acc + i.totalDeductions, 0);
    const totalNet = items.reduce((acc, i) => acc + i.netSalary, 0);

    runs.push({
      id: `run-${monthStr}`,
      month: monthStr,
      status: 'Paid',
      createdAt: `${monthStr}-25T09:00:00Z`,
      processedAt: `${monthStr}-26T14:00:00Z`,
      approvedAt: `${monthStr}-27T16:00:00Z`,
      paidAt: `${monthStr}-28T11:00:00Z`,
      totalGross: Math.round(totalGross * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      employeeCount: items.length,
      items,
    });
  }

  return runs;
}
