import { Site } from '../types';

/** Site name for an id ('' when unassigned or unknown). */
export const siteNameOf = (sites: Site[], siteId?: string): string =>
  (siteId && sites.find((s) => s.id === siteId)?.name) || '';
