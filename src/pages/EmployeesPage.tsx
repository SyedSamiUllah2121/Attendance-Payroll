import React, { useState } from 'react';
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  Edit2,
  Trash2,
  Eye,
  Building,
  Briefcase,
  Calendar,
  CreditCard,
  FileText,
  Clock,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Employee, EmploymentType, Gender, EmployeeStatus, Shift } from '../types';
import { storageService } from '../services/storageService';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface EmployeesPageProps {
  onOpenPayslip?: (employeeId: string) => void;
}

export const EmployeesPage: React.FC<EmployeesPageProps> = ({ onOpenPayslip }) => {
  const { formatMoney, settings } = useSettings();
  const { success, error, info } = useNotification();

  const [employees, setEmployees] = useState<Employee[]>(() => storageService.getEmployees());
  const [shifts] = useState<Shift[]>(() => storageService.getShifts());

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'name' | 'joiningDate' | 'basicSalary'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [profileTab, setProfileTab] = useState<'overview' | 'attendance' | 'leaves' | 'payslips' | 'documents'>('overview');
  const [deactivatingEmployee, setDeactivatingEmployee] = useState<Employee | null>(null);

  // Departments list
  const departments = ['Engineering', 'Human Resources', 'Finance', 'Sales', 'Operations'];

  // Form Fields State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cnic: '',
    dob: '1995-01-01',
    gender: 'Male' as Gender,
    address: '',
    department: 'Engineering',
    designation: '',
    employmentType: 'Permanent' as EmploymentType,
    joiningDate: '2026-01-15',
    shiftId: 'shift-morning',
    bankName: 'Meezan Bank',
    accountNumber: '',
    status: 'Active' as EmployeeStatus,
    basicSalary: 80000,
  });

  const loadEmployees = () => {
    setEmployees(storageService.getEmployees());
  };

  const handleOpenAdd = () => {
    // Generate next ID
    const maxIdNum = employees.reduce((max, e) => {
      const num = parseInt(e.id.replace('EMP-', ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const nextId = `EMP-${String(maxIdNum + 1).padStart(3, '0')}`;

    setEditingEmployee(null);
    setFormData({
      name: '',
      email: '',
      phone: '+92 ',
      cnic: '42101-',
      dob: '1996-01-01',
      gender: 'Male',
      address: '',
      department: 'Engineering',
      designation: '',
      employmentType: 'Permanent',
      joiningDate: new Date().toISOString().slice(0, 10),
      shiftId: shifts[0]?.id || 'shift-morning',
      bankName: 'Standard Chartered Bank',
      accountNumber: 'PK00SCBL0000000000000000',
      status: 'Active',
      basicSalary: 95000,
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      cnic: emp.cnic,
      dob: emp.dob,
      gender: emp.gender,
      address: emp.address,
      department: emp.department,
      designation: emp.designation,
      employmentType: emp.employmentType,
      joiningDate: emp.joiningDate,
      shiftId: emp.shiftId,
      bankName: emp.bankName,
      accountNumber: emp.accountNumber,
      status: emp.status,
      basicSalary: emp.basicSalary,
    });
    setIsFormOpen(true);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.designation.trim()) {
      error('Validation Error', 'Full name, email, and designation are required.');
      return;
    }

    if (editingEmployee) {
      const updated: Employee = {
        ...editingEmployee,
        ...formData,
      };
      storageService.updateEmployee(updated);
      success('Employee Updated', `Updated profile of ${updated.name}`);
    } else {
      const maxIdNum = employees.reduce((max, emp) => {
        const num = parseInt(emp.id.replace('EMP-', ''), 10);
        return !isNaN(num) && num > max ? num : max;
      }, 0);
      const newId = `EMP-${String(maxIdNum + 1).padStart(3, '0')}`;

      const created: Employee = {
        id: newId,
        ...formData,
      };
      storageService.addEmployee(created);
      success('Employee Added', `Created ${created.name} (${created.id})`);
    }

    loadEmployees();
    setIsFormOpen(false);
  };

  const handleConfirmDeactivate = () => {
    if (!deactivatingEmployee) return;
    const newStatus: EmployeeStatus =
      deactivatingEmployee.status === 'Active' ? 'Inactive' : 'Active';
    const updated: Employee = {
      ...deactivatingEmployee,
      status: newStatus,
    };
    storageService.updateEmployee(updated);
    success(
      newStatus === 'Inactive' ? 'Employee Deactivated' : 'Employee Activated',
      `${deactivatingEmployee.name} is now ${newStatus}.`
    );
    loadEmployees();
    setDeactivatingEmployee(null);
  };

  // Filter and sort logic
  const filteredEmployees = employees
    .filter((emp) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        emp.name.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.designation.toLowerCase().includes(q);

      const matchesDept = !selectedDept || emp.department === selectedDept;
      const matchesStatus = !selectedStatus || emp.status === selectedStatus;
      const matchesType = !selectedType || emp.employmentType === selectedType;

      return matchesSearch && matchesDept && matchesStatus && matchesType;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'id') comparison = a.id.localeCompare(b.id);
      else if (sortBy === 'name') comparison = a.name.localeCompare(b.name);
      else if (sortBy === 'joiningDate') comparison = a.joiningDate.localeCompare(b.joiningDate);
      else if (sortBy === 'basicSalary') comparison = a.basicSalary - b.basicSalary;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const totalPages = Math.ceil(filteredEmployees.length / pageSize) || 1;
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Employee Directory
          </h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Manage profiles, employment types, shifts, and compensation structures
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Employee
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-64 relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, ID, title, or email..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-indigo-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 focus:outline-hidden"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 focus:outline-hidden"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          {/* Employment Type */}
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 focus:outline-hidden"
          >
            <option value="">All Contract Types</option>
            <option value="Permanent">Permanent</option>
            <option value="Contract">Contract</option>
            <option value="Intern">Intern</option>
          </select>

          {/* Clear button */}
          {(searchQuery || selectedDept || selectedStatus || selectedType) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedDept('');
                setSelectedStatus('');
                setSelectedType('');
                setCurrentPage(1);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th
                  onClick={() => {
                    setSortBy('id');
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  }}
                  className="py-3 px-4 cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  <div className="flex items-center gap-1">
                    Employee ID <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    setSortBy('name');
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  }}
                  className="py-3 px-4 cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  <div className="flex items-center gap-1">
                    Employee Name <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Department & Role</th>
                <th className="py-3 px-4">Shift</th>
                <th className="py-3 px-4">Type</th>
                <th
                  onClick={() => {
                    setSortBy('basicSalary');
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  }}
                  className="py-3 px-4 cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  <div className="flex items-center gap-1">
                    Basic Salary <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400">
                    No employees found matching the filters.
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const shift = shifts.find((s) => s.id === emp.shiftId);
                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                        {emp.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-neutral-700 dark:text-neutral-200 text-xs">
                            {emp.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .substring(0, 2)}
                          </div>
                          <div>
                            <button
                              onClick={() => {
                                setViewingEmployee(emp);
                                setProfileTab('overview');
                              }}
                              className="font-semibold text-neutral-900 dark:text-neutral-100 hover:text-indigo-600 dark:hover:text-indigo-400 text-left block"
                            >
                              {emp.name}
                            </button>
                            <span className="text-[11px] text-neutral-400 block">{emp.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-neutral-800 dark:text-neutral-200">
                          {emp.designation}
                        </p>
                        <span className="text-[11px] text-neutral-500">{emp.department}</span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300">
                        {shift?.name || 'Standard'}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-400">
                        <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[11px] font-medium">
                          {emp.employmentType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                        {formatMoney(emp.basicSalary)}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge status={emp.status} />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setViewingEmployee(emp);
                              setProfileTab('overview');
                            }}
                            className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            title="View Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeactivatingEmployee(emp)}
                            className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            title={emp.status === 'Active' ? 'Deactivate' : 'Activate'}
                          >
                            {emp.status === 'Active' ? (
                              <XCircle className="w-4 h-4" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
          <span>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, filteredEmployees.length)} of{' '}
            {filteredEmployees.length} employees
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Employee Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingEmployee ? `Edit Employee (${editingEmployee.id})` : 'Register New Employee'}
        subtitle="Complete biographical, job assignment, and salary compensation details"
        maxWidth="3xl"
      >
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Tariq Mehmood"
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="tariq@workpulse.com"
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+92 300 0000000"
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                CNIC / National ID
              </label>
              <input
                type="text"
                value={formData.cnic}
                onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                placeholder="42101-0000000-0"
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Gender
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Residential Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="e.g. 14-C Main Boulevard, DHA"
              className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Department
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Designation *
              </label>
              <input
                type="text"
                required
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                placeholder="e.g. Lead Engineer"
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Employment Type
              </label>
              <select
                value={formData.employmentType}
                onChange={(e) =>
                  setFormData({ ...formData, employmentType: e.target.value as EmploymentType })
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="Permanent">Permanent</option>
                <option value="Contract">Contract</option>
                <option value="Intern">Intern</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Joining Date
              </label>
              <input
                type="date"
                value={formData.joiningDate}
                onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Assigned Shift
              </label>
              <select
                value={formData.shiftId}
                onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as EmployeeStatus })
                }
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Salary & Bank Tab */}
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800 space-y-3">
            <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
              Salary Compensation & Bank Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Monthly Basic Salary ({settings.company.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={formData.basicSalary}
                  onChange={(e) =>
                    setFormData({ ...formData, basicSalary: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="e.g. Standard Chartered Bank"
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  IBAN / Account Number
                </label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  placeholder="PK00XXXX0000000000000000"
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 font-mono"
                />
              </div>
            </div>

            {/* Live calculation preview */}
            <div className="pt-2 text-xs flex flex-wrap gap-4 text-neutral-600 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
              <span>
                HRA (40%):{' '}
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {formatMoney((formData.basicSalary * 40) / 100)}
                </strong>
              </span>
              <span>
                Medical (10%):{' '}
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {formatMoney((formData.basicSalary * 10) / 100)}
                </strong>
              </span>
              <span>
                Conveyance:{' '}
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {formatMoney(settings.payroll.conveyanceFixed)}
                </strong>
              </span>
              <span>
                Estimated Gross:{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {formatMoney(formData.basicSalary * 1.5 + settings.payroll.conveyanceFixed)}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              {editingEmployee ? 'Save Changes' : 'Create Employee Profile'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Employee Profile Modal with Tabs */}
      {viewingEmployee && (
        <Modal
          isOpen={Boolean(viewingEmployee)}
          onClose={() => setViewingEmployee(null)}
          title={`${viewingEmployee.name} (${viewingEmployee.id})`}
          subtitle={`${viewingEmployee.designation} · ${viewingEmployee.department}`}
          maxWidth="3xl"
        >
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-4">
            <button
              onClick={() => setProfileTab('overview')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                profileTab === 'overview'
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Overview & Salary
            </button>
            <button
              onClick={() => setProfileTab('attendance')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                profileTab === 'attendance'
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Attendance History
            </button>
            <button
              onClick={() => setProfileTab('leaves')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                profileTab === 'leaves'
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Leaves History
            </button>
            <button
              onClick={() => setProfileTab('payslips')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                profileTab === 'payslips'
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Payslips
            </button>
            <button
              onClick={() => setProfileTab('documents')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                profileTab === 'documents'
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Documents
            </button>
          </div>

          {/* Tab 1: Overview */}
          {profileTab === 'overview' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800">
                <div>
                  <span className="text-neutral-400">Employee ID</span>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100 font-mono mt-0.5">
                    {viewingEmployee.id}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-400">Status</span>
                  <div className="mt-0.5">
                    <Badge status={viewingEmployee.status} />
                  </div>
                </div>
                <div>
                  <span className="text-neutral-400">Joining Date</span>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {viewingEmployee.joiningDate}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-400">Employment</span>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {viewingEmployee.employmentType}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-2">
                  <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs">
                    Biographical & Contact
                  </h4>
                  <p>
                    <span className="text-neutral-400">Email:</span> {viewingEmployee.email}
                  </p>
                  <p>
                    <span className="text-neutral-400">Phone:</span> {viewingEmployee.phone}
                  </p>
                  <p>
                    <span className="text-neutral-400">CNIC / ID:</span> {viewingEmployee.cnic}
                  </p>
                  <p>
                    <span className="text-neutral-400">Date of Birth:</span> {viewingEmployee.dob} (
                    {viewingEmployee.gender})
                  </p>
                  <p>
                    <span className="text-neutral-400">Address:</span> {viewingEmployee.address}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-2">
                  <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs">
                    Bank & Salary Structure
                  </h4>
                  <p>
                    <span className="text-neutral-400">Bank:</span> {viewingEmployee.bankName}
                  </p>
                  <p className="font-mono">
                    <span className="text-neutral-400 font-sans">Account:</span>{' '}
                    {viewingEmployee.accountNumber}
                  </p>
                  <p>
                    <span className="text-neutral-400">Basic Salary:</span>{' '}
                    <strong className="font-mono text-neutral-900 dark:text-neutral-100">
                      {formatMoney(viewingEmployee.basicSalary)}
                    </strong>
                  </p>
                  <p>
                    <span className="text-neutral-400">Gross Monthly:</span>{' '}
                    <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                      {formatMoney(
                        viewingEmployee.basicSalary * 1.5 + settings.payroll.conveyanceFixed
                      )}
                    </strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Attendance */}
          {profileTab === 'attendance' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                Recent attendance punches for {viewingEmployee.name}
              </p>
              <div className="max-h-64 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Check-in</th>
                      <th className="py-2 px-3">Check-out</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Worked (hrs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {storageService
                      .getAttendance()
                      .filter((r) => r.employeeId === viewingEmployee.id)
                      .slice(-15)
                      .reverse()
                      .map((rec) => (
                        <tr key={rec.id}>
                          <td className="py-2 px-3 font-mono">{rec.date}</td>
                          <td className="py-2 px-3 font-mono">{rec.checkIn || '—'}</td>
                          <td className="py-2 px-3 font-mono">{rec.checkOut || '—'}</td>
                          <td className="py-2 px-3">
                            <Badge status={rec.status} />
                          </td>
                          <td className="py-2 px-3 font-mono">
                            {(rec.workedMinutes / 60).toFixed(1)}h
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Leaves */}
          {profileTab === 'leaves' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                Leave requests and approved leaves for {viewingEmployee.name}
              </p>
              <div className="space-y-2">
                {storageService
                  .getLeaves()
                  .filter((l) => l.employeeId === viewingEmployee.id)
                  .map((lv) => (
                    <div
                      key={lv.id}
                      className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {lv.leaveType} Leave ({lv.daysCount} days)
                        </p>
                        <p className="text-neutral-500 text-[11px]">
                          {lv.fromDate} to {lv.toDate}
                        </p>
                        <p className="text-neutral-400 italic text-[11px] mt-0.5">
                          &ldquo;{lv.reason}&rdquo;
                        </p>
                      </div>
                      <Badge status={lv.status} />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tab 4: Payslips */}
          {profileTab === 'payslips' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                Disbursed payslips and monthly remuneration records
              </p>
              <div className="space-y-2">
                {storageService
                  .getPayrolls()
                  .slice()
                  .reverse()
                  .map((run) => {
                    const item = run.items.find((i) => i.employeeId === viewingEmployee.id);
                    if (!item) return null;
                    return (
                      <div
                        key={run.id}
                        className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            Pay Period: {run.month}
                          </p>
                          <p className="text-neutral-500 text-[11px]">
                            Gross: {formatMoney(item.grossSalary)} · Deductions:{' '}
                            {formatMoney(item.totalDeductions)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(item.netSalary)}
                          </span>
                          <button
                            onClick={() => {
                              onOpenPayslip && onOpenPayslip(viewingEmployee.id);
                              setViewingEmployee(null);
                            }}
                            className="px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-semibold"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Tab 5: Documents */}
          {profileTab === 'documents' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <div>
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                      Employment Contract (Signed)
                    </p>
                    <span className="text-[11px] text-neutral-400">PDF · 1.4 MB</span>
                  </div>
                </div>
                <button
                  onClick={() => info('Document Download', 'Downloading Employment Contract...')}
                  className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Download
                </button>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-500" />
                  <div>
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                      National ID Card Scan (CNIC)
                    </p>
                    <span className="text-[11px] text-neutral-400">JPG · 820 KB</span>
                  </div>
                </div>
                <button
                  onClick={() => info('Document Download', 'Downloading ID scan...')}
                  className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Download
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Deactivate confirmation dialog */}
      {deactivatingEmployee && (
        <ConfirmDialog
          isOpen={Boolean(deactivatingEmployee)}
          onClose={() => setDeactivatingEmployee(null)}
          onConfirm={handleConfirmDeactivate}
          title={
            deactivatingEmployee.status === 'Active'
              ? 'Deactivate Employee'
              : 'Reactivate Employee'
          }
          message={`Are you sure you want to change the status of ${deactivatingEmployee.name} to ${
            deactivatingEmployee.status === 'Active' ? 'Inactive' : 'Active'
          }?`}
          confirmText={deactivatingEmployee.status === 'Active' ? 'Deactivate' : 'Activate'}
          isDanger={deactivatingEmployee.status === 'Active'}
        />
      )}
    </div>
  );
};
