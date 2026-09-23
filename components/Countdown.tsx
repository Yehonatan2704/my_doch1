import { Clock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ui } from '../i18n/he';
import { useTheme } from '../theme/theme';
import { space, tabular } from '../theme/tokens';
import { countdownState } from './countdownState';
import { Txt } from './Txt';

type Props = {
  /** `deadline` from GET /reports/today. */
  deadline: string;
  /** Server − phone clock (see `serverOffset`), so a wrong phone clock can't hide the deadline. */
  serverOffsetMs?: number;
};

/** "נותרו HH:MM לשליחת הדיווח" → warning color under 30 min → "הדיווח באיחור" (F2). */
export function Countdown({ deadline, serverOffsetMs = 0 }: Props) {
  const { c } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const s = countdownState(deadline, now, serverOffsetMs);
  const warn = s.kind === 'late' || s.warning;
  const text = s.kind === 'late' ? ui.countdownLate : ui.countdownLeft(s.hhmm);
  const tint = warn ? c.tint.warning.fg : c.text.primary;
  return (
    <View style={styles.row} accessibilityRole="timer" accessibilityLiveRegion="polite">
      <Clock size={20} strokeWidth={1.75} color={tint} />
      <Txt variant="heading" style={[tabular, { color: tint }]}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
});
