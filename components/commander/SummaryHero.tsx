import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { commander as t } from '../../i18n/he';
import { radius, space, tabular } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/theme';
import { Txt } from '../Txt';

type Counts = { total: number; present: number; away: number; notReported: number };
type Dot = 'present' | 'away' | 'missing';

const RING = 72;
const STROKE = 7;

/** DESIGN.md §7.5 summary hero: navy card, progress ring (reported/total) + status dots. */
export function SummaryHero({
  counts,
  presentOn,
  missingOn,
  onPresent,
  onMissing,
}: {
  counts: Counts;
  presentOn: boolean;
  missingOn: boolean;
  onPresent: () => void;
  onMissing: () => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const reported = counts.total - counts.notReported;
  const pct = counts.total ? Math.round((reported / counts.total) * 100) : 0;
  const r = (RING - STROKE) / 2;
  const len = 2 * Math.PI * r;

  const dot = (role: Dot, label: string, on?: boolean, onPress?: () => void) => {
    const body = (
      <>
        <View style={[s.dot, { backgroundColor: c.status[role] }]} />
        <Txt variant="caption" tone="hero" style={s.dotText}>
          {label}
        </Txt>
      </>
    );
    return onPress ? (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        aria-selected={!!on}
        accessibilityState={{ selected: !!on }}
        style={({ pressed }) => [s.dotRow, on && s.dotOn, pressed && { opacity: 0.7 }]}
      >
        {body}
      </Pressable>
    ) : (
      <View style={s.dotRow}>{body}</View>
    );
  };

  return (
    <View style={s.hero}>
      <View style={s.top}>
        <View style={s.ring} accessibilityLabel={`${pct}%`}>
          <Svg width={RING} height={RING}>
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={c.hero.tile}
              strokeWidth={STROKE}
              fill="none"
            />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={c.hero.accent}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(len * pct) / 100} ${len}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <View style={s.ringLabel}>
            <Txt variant="heading" tone="hero" style={tabular}>
              {`${pct}%`}
            </Txt>
          </View>
        </View>
        <View style={s.flex}>
          <Txt variant="title" tone="hero" style={tabular}>
            {`${reported}/${counts.total}`}
          </Txt>
          <Txt variant="caption" tone="heroMuted">
            {t.soldiersCount(counts.total)}
          </Txt>
        </View>
      </View>
      <View style={s.dots}>
        {dot('present', t.chipPresent(counts.present), presentOn, onPresent)}
        {dot('away', t.chipAway(counts.away))}
        {dot('missing', t.chipNotReported(counts.notReported), missingOn, onMissing)}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, sh) => ({
  hero: {
    backgroundColor: c.hero.bg,
    borderRadius: radius.hero,
    padding: space.xl,
    gap: space.lg,
    ...sh.md,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  ring: { width: RING, height: RING },
  ringLabel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: c.hero.tile,
  },
  dotOn: { borderWidth: 1, borderColor: c.hero.text },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  dotText: { fontWeight: '600' },
}));
