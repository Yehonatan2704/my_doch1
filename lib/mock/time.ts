import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TZ } from '@doch1/shared';

export const todayIL = (now: Date) => formatInTimeZone(now, TZ, 'yyyy-MM-dd');
export const hhmmIL = (now: Date) => formatInTimeZone(now, TZ, 'HH:mm');
export const atIL = (date: string, hhmm: string) =>
  fromZonedTime(`${date}T${hhmm}:00`, TZ).toISOString();

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
