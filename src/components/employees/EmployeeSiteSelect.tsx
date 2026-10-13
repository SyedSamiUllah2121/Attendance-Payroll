import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Employee, Site } from '../../types';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { storageService } from '../../services/storageService';
import { transferEmployee } from '../../services/employeeActionsService';
import { todayStr } from '../../utils/dateUtils';
import { siteNameOf } from '../../utils/sites';

const NEW_SITE = '__new';

const labelClass = 'block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1';
const fieldClass =
  'w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100';

interface Props {
  employee: Employee;
  /** Called after the site changed (reload employees / sites). */
  onChanged: () => void;
  className?: string;
}

/**
 * Inline site picker for one employee: move to another site, remove the site, or create a
 * new site and move there. Each change is a Transfer (effective today) in the employee's
 * History. Without edit rights it just shows the site name.
 */
export const EmployeeSiteSelect: React.FC<Props> = ({ employee, onChanged, className = '' }) => {
  const { can, user } = useAuth();
  const { success, error } = useNotification();
  const [newSite, setNewSite] = useState<{ name: string; country: string } | null>(null);
  // Read on each render so a site added from another row shows up everywhere
  const sites: Site[] = storageService.getSites();
  const name = siteNameOf(sites, employee.siteId);

  if (!can('employees.edit')) {
    return <span className={`text-neutral-600 dark:text-neutral-300 ${className}`}>{name || '—'}</span>;
  }
  const canAddSite = can('sites.manage');
  const by = user?.name || 'Manager';

  const moveTo = (siteId: string, siteName: string) => {
    transferEmployee(
      employee,
      { siteId, effectiveDate: todayStr(), note: siteId ? `Site changed to ${siteName}` : 'Site removed' },
      by
    );
    success('Site updated', siteId ? `${employee.name} moved to ${siteName}.` : `${employee.name} has no site now.`);
    onChanged();
  };

  const handleChange = (value: string) => {
    if (value === NEW_SITE) {
      setNewSite({ name: '', country: '' });
      return;
    }
    try {
      moveTo(value, siteNameOf(sites, value));
    } catch (err) {
      error('Not saved', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSite) return;
    const siteName = newSite.name.trim();
    if (!siteName) {
      error('Name required', 'Enter the site name, e.g. Riyadh.');
      return;
    }
    const stored = storageService.getSites();
    if (stored.some((s) => s.name.toLowerCase() === siteName.toLowerCase())) {
      error('Name in use', `There is already a site called ${siteName}. Pick it from the list.`);
      return;
    }
    try {
      // The new site and the move are saved together
      storageService.transaction(() => {
        const site: Site = { id: `site-${Date.now()}`, name: siteName, country: newSite.country.trim(), status: 'Active' };
        storageService.saveSites([...stored, site]);
        moveTo(site.id, site.name);
      });
      setNewSite(null);
    } catch (err) {
      error('Not saved', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <>
      <select
        value={employee.siteId || ''}
        onChange={(e) => handleChange(e.target.value)}
        title="Change site (recorded as a Transfer in History)"
        className={`px-2 py-1 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-800 dark:text-neutral-200 cursor-pointer ${className}`}
      >
        <option value="">No site</option>
        {sites
          .filter((s) => s.status === 'Active' || s.id === employee.siteId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        {canAddSite && <option value={NEW_SITE}>+ Add new site…</option>}
      </select>

      {/* Portal: the picker sits inside animated / scrolling tables that would clip a fixed dialog */}
      {newSite &&
        createPortal(
          <Modal
            isOpen
            onClose={() => setNewSite(null)}
            title="Add New Site"
            subtitle={`${employee.name} moves to it from today`}
            maxWidth="sm"
          >
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className={labelClass}>Site Name *</label>
                <input
                  autoFocus
                  required
                  value={newSite.name}
                  onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                  placeholder="e.g. Riyadh"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <input
                  value={newSite.country}
                  onChange={(e) => setNewSite({ ...newSite, country: e.target.value })}
                  placeholder="e.g. Saudi Arabia"
                  className={fieldClass}
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setNewSite(null)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                >
                  Add Site &amp; Move
                </button>
              </div>
            </form>
          </Modal>,
          document.body
        )}
    </>
  );
};
