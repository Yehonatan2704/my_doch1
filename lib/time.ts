// Display helpers in Asia/Jerusalem (CLAUDE.md rule 7) — never the phone's time zone.
import { TZ } from '@doch1/shared';
import { he } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

/** "08:42" in Israel for an ISO instant. */
export const hhmmIL = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'HH:mm');

/** Has the server's edit lock (today 23:59) passed, by the server's clock? */
export const isPast = (iso: string, serverOffsetMs = 0) =>
  Date.now() + serverOffsetMs >= Date.parse(iso);

/** "יום שלישי 23/9" for a YYYY-MM-DD date (noon UTC keeps it on the same Israeli day). */
export const dayLabelIL = (date: string) =>
  formatInTimeZone(new Date(`${date}T12:00:00Z`), TZ, 'EEEE d/M', { locale: he });

/** "ספטמבר 2026" for a calendar month (1…12). */
export const monthLabelIL = (year: number, month: number) =>
  formatInTimeZone(
    new Date(`${year}-${String(month).padStart(2, '0')}-15T12:00:00Z`),
    TZ,
    'LLLL yyyy',
    { locale: he },
  );

/** "23/9 בשעה 07:15" in Israel — the Hebrew word keeps the order stable in RTL. */
export const dayTimeIL = (iso: string) => formatInTimeZone(new Date(iso), TZ, "d/M 'בשעה' HH:mm");

/** "23/9/2026" in Israel for an ISO instant. */
export const dateIL = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'd/M/yyyy');
