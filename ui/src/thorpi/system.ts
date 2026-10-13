import client from './client';

// project imports
import { Stats, SystemSettings } from '@models/system';

/**
 * Fetch system-wide runtime statistics (`GET /system/stats`).
 *
 * @returns The system {@link Stats}
 */
export async function getSystemStats(): Promise<Stats> {
  const url = '/system/stats';
  return client.get<Stats>(url).then((res) => {
    if (res?.status == 200 && res.data) {
      return res.data;
    }
    throw new Error('Error getting system stats');
  });
}

/**
 * Fetch the system configuration settings (`GET /system/settings`).
 *
 * @returns The {@link SystemSettings}
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  const url = '/system/settings';
  return client.get<SystemSettings>(url).then((res) => {
    if (res?.status == 200 && res.data) {
      return res.data;
    }
    throw new Error('Error getting system settings');
  });
}
