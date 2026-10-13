import React, { useState } from 'react';
import { Edit2, MapPin, Plus, Trash2, UserPlus, Users, XCircle, CheckCircle } from 'lucide-react';
import { Site } from '../types';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { transferEmployee } from '../services/employeeActionsService';
import { todayStr } from '../utils/dateUtils';
import { siteNameOf } from '../utils/sites';

const labelClass = 'block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1';
const fieldClass =
  'w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';

const blankForm = () => ({ name: '', country: '', address: '' });

/**
 * Work sites (e.g. Dubai, London, Paris). Employees are assigned a site in the employee form
 * or with a Transfer; Attendance, Payroll and the other records show and filter by it.
 */
export const SitesPage: React.FC = () => {
  const { can, user } = useAuth();
  const canManage = can('sites.manage');
  // Moving people between sites is a Transfer, which needs employee edit rights
  const canAssign = can('employees.edit');
  const { success, error } = useNotification();

  const [sites, setSites] = useState<Site[]>(() => storageService.getSites());
  const [employees, setEmployees] = useState(() => storageService.getEmployees());
  const [history, setHistory] = useState(() => storageService.getEmployeeHistory());
  const [editing, setEditing] = useState<Site | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [deleting, setDeleting] = useState<Site | null>(null);
  // "Assign employees" dialog: the site, who is ticked, and from when
  const [assigning, setAssigning] = useState<{ site: Site; ids: string[]; date: string } | null>(null);

  const reload = () => {
    setSites(storageService.getSites());
    setEmployees(storageService.getEmployees());
    setHistory(storageService.getEmployeeHistory());
  };

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigning || !assigning.ids.length) {
      error('Nobody selected', 'Tick the employees to move to this site.');
      return;
    }
    try {
      // One transaction: either everyone moves (each logged as a Transfer) or nobody does
      storageService.transaction(() =>
        assigning.ids.forEach((id) => {
          const emp = storageService.getEmployeeById(id);
          if (emp) {
            transferEmployee(
              emp,
              { siteId: assigning.site.id, effectiveDate: assigning.date, note: `Assigned to ${assigning.site.name}` },
              user?.name || 'Manager'
            );
          }
        })
      );
      success(
        'Employees assigned',
        `${assigning.ids.length} employee${assigning.ids.length === 1 ? '' : 's'} moved to ${assigning.site.name}` +
          (assigning.date > todayStr() ? ` from ${assigning.date}.` : '.')
      );
      setAssigning(null);
      reload();
    } catch (err) {
      error('Not saved', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const staffAt = (siteId: string) => employees.filter((e) => e.status === 'Active' && e.siteId === siteId);
  const unassigned = employees.filter((e) => e.status === 'Active' && !e.siteId);
  // A site anyone was ever assigned to stays (deactivate instead), so old records keep their site name.
  const everUsed = (siteId: string) =>
    employees.some((e) => e.siteId === siteId) ||
    history.some((h) => h.oldValue.siteId === siteId || h.newValue.siteId === siteId);

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setIsFormOpen(true);
  };

  const openEdit = (site: Site) => {
    setEditing(site);
    setForm({ name: site.name, country: site.country, address: site.address || '' });
    setIsFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      error('Name required', 'Enter the site name, e.g. Dubai.');
      return;
    }
    const stored = storageService.getSites();
    if (stored.some((s) => s.id !== editing?.id && s.name.toLowerCase() === name.toLowerCase())) {
      error('Name in use', `There is already a site called ${name}.`);
      return;
    }
    const data = { name, country: form.country.trim(), address: form.address.trim() || undefined };
    if (editing) {
      storageService.saveSites(stored.map((s) => (s.id === editing.id ? { ...s, ...data } : s)));
      success('Site updated', `${name} saved.`);
    } else {
      storageService.saveSites([...stored, { id: `site-${Date.now()}`, ...data, status: 'Active' }]);
      success('Site added', `${name} can now be assigned to employees.`);
    }
    reload();
    setIsFormOpen(false);
  };

  const toggleStatus = (site: Site) => {
    if (site.status === 'Active' && staffAt(site.id).length) {
      error('Site in use', `Move the ${staffAt(site.id).length} employee(s) at ${site.name} first (Employee Actions → Transfer).`);
      return;
    }
    const status = site.status === 'Active' ? 'Inactive' : 'Active';
    storageService.saveSites(storageService.getSites().map((s) => (s.id === site.id ? { ...s, status } : s)));
    success(status === 'Active' ? 'Site reactivated' : 'Site deactivated', `${site.name} is now ${status}.`);
    reload();
  };

  const handleDelete = () => {
    if (!deleting) return;
    storageService.saveSites(storageService.getSites().filter((s) => s.id !== deleting.id));
    success('Site removed', `${deleting.name} was deleted.`);
    setDeleting(null);
    reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Sites</h1>
          <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Work locations. Each employee belongs to a site, shown across attendance, payroll and reports
          </p>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Site
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {sites.map((site) => {
          const staff = staffAt(site.id);
          const depts = Array.from(new Set(staff.map((e) => e.department))).sort();
          return (
            <div
              key={site.id}
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{site.name}</h3>
                    <p className="text-xs text-neutral-500">{site.country || '—'}</p>
                  </div>
                </div>
                <Badge status={site.status} />
              </div>
              {site.address && <p className="text-xs text-neutral-500 mt-3">{site.address}</p>}
              <div className="mt-4 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <Users className="w-4 h-4 text-neutral-400" />
                <span className="font-semibold font-mono">{staff.length}</span> active employee
                {staff.length === 1 ? '' : 's'}
              </div>
              {depts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {depts.map((d) => (
                    <span
                      key={d}
                      className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-300"
                    >
                      {d} · {staff.filter((e) => e.department === d).length}
                    </span>
                  ))}
                </div>
              )}
              {(canManage || canAssign) && (
                <div className="mt-auto pt-4 flex items-center justify-end gap-1">
                  {canAssign && site.status === 'Active' && (
                    <button
                      onClick={() => setAssigning({ site, ids: [], date: todayStr() })}
                      className="mr-auto px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Assign employees
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button
                        onClick={() => openEdit(site)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        title="Edit site"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleStatus(site)}
                        className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        title={site.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                      >
                        {site.status === 'Active' ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      {!everUsed(site.id) && (
                        <button
                          onClick={() => setDeleting(site)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                          title="Delete site (never used)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sites.length === 0 && (
          <p className="text-sm text-neutral-400 py-12 text-center col-span-full">No sites yet. Add the first one.</p>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
          <span className="font-semibold">{unassigned.length} active employee{unassigned.length === 1 ? ' has' : 's have'} no site yet:</span>{' '}
          {unassigned.map((e) => e.name).join(', ')}. Use &ldquo;Assign employees&rdquo; on a site, the employee form, or Employee Actions → Transfer.
        </div>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit Site (${editing.name})` : 'Add Site'}
        subtitle="A work location employees can be assigned to"
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Site Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Dubai"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="e.g. United Arab Emirates"
                className={fieldClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <textarea
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Optional"
              className={fieldClass}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              {editing ? 'Save Changes' : 'Add Site'}
            </button>
          </div>
        </form>
      </Modal>

      {assigning && (() => {
        // Active staff not at this site: unassigned first, then by their current site
        const candidates = employees
          .filter((e) => e.status === 'Active' && e.siteId !== assigning.site.id)
          .sort(
            (a, b) =>
              Number(Boolean(a.siteId)) - Number(Boolean(b.siteId)) ||
              (a.siteId || '').localeCompare(b.siteId || '') ||
              a.name.localeCompare(b.name)
          );
        const toggle = (id: string) =>
          setAssigning({
            ...assigning,
            ids: assigning.ids.includes(id) ? assigning.ids.filter((x) => x !== id) : [...assigning.ids, id],
          });
        const allTicked = candidates.length > 0 && candidates.every((e) => assigning.ids.includes(e.id));
        return (
          <Modal
            isOpen
            onClose={() => setAssigning(null)}
            title={`Assign employees to ${assigning.site.name}`}
            subtitle="Each move is saved as a Transfer in the employee's History"
            maxWidth="lg"
          >
            <form onSubmit={handleAssign} className="space-y-4">
              {candidates.length === 0 ? (
                <p className="py-8 text-center text-xs text-neutral-400">Every active employee is already at {assigning.site.name}.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">
                      {assigning.ids.length} of {candidates.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setAssigning({ ...assigning, ids: allTicked ? [] : candidates.map((e) => e.id) })}
                      className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {allTicked ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800">
                    {candidates.map((emp) => (
                      <label
                        key={emp.id}
                        className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                      >
                        <input
                          type="checkbox"
                          checked={assigning.ids.includes(emp.id)}
                          onChange={() => toggle(emp.id)}
                          className="accent-indigo-600"
                        />
                        <span className="flex-1">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">{emp.name}</span>{' '}
                          <span className="font-mono text-neutral-400">({emp.id})</span>
                          <span className="block text-[11px] text-neutral-500">
                            {emp.designation} · {emp.department}
                          </span>
                        </span>
                        <span className="text-[11px] text-neutral-400 whitespace-nowrap">
                          {siteNameOf(sites, emp.siteId) ? `now ${siteNameOf(sites, emp.siteId)}` : 'no site'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className={labelClass}>Effective Date *</label>
                    <input
                      type="date"
                      required
                      value={assigning.date}
                      onChange={(e) => setAssigning({ ...assigning, date: e.target.value })}
                      className={`${fieldClass} font-mono`}
                    />
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Attendance and payroll show the new site from this date.
                    </p>
                  </div>
                </>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigning(null)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                {candidates.length > 0 && (
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                  >
                    Assign {assigning.ids.length || ''} to {assigning.site.name}
                  </button>
                )}
              </div>
            </form>
          </Modal>
        );
      })()}

      {deleting && (
        <ConfirmDialog
          isOpen
          onClose={() => setDeleting(null)}
          onConfirm={handleDelete}
          title="Delete Site"
          message={`Delete ${deleting.name}? No employee has ever been assigned to it.`}
          confirmText="Delete"
          isDanger
        />
      )}
    </div>
  );
};
