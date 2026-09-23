import { useEffect } from 'react';
import { futureWindow } from '../calendar';
import { syncReminders } from '../notifications';
import { planReminders } from '../reminders';
import { useReportsRange, useTodayReport } from './useReports';
import { useSettings } from './useSettings';

/**
 * F6: keep the phone's local reminders in line with the settings and what's already reported.
 * Every report change invalidates these queries, so reporting (today or ahead) re-plans and
 * cancels that day's reminders. Mounted once, inside the signed-in area.
 */
export function useReminderSync() {
  const settings = useSettings();
  const today = useTodayReport();
  const todayDate = today.data?.date;
  const ahead = useReportsRange(todayDate ? futureWindow(todayDate) : undefined);

  useEffect(() => {
    if (!settings.data || !today.data || !ahead.data) return;
    const { date, report, serverOffsetMs } = today.data;
    const reported = new Set(ahead.data.map((r) => r.date));
    if (report) reported.add(date);
    const plan = planReminders({
      settings: settings.data,
      today: date,
      reported,
      now: Date.now() + serverOffsetMs,
    });
    syncReminders(plan, serverOffsetMs).catch(() => {
      // Best effort: a failed schedule is retried on the next data change / app focus.
    });
  }, [settings.data, today.data, ahead.data]);
}
