import type { StatusesResponse, WeekTemplate } from '@doch1/shared';
import { View } from 'react-native';
import { weekTemplate as t } from '../i18n/he';
import { findReason } from '../lib/template';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { CategoryIcon, categoryRole } from './CategoryIcon';
import { Txt } from './Txt';

/** Read-only mini week Sun→Sat: weekday, category icon, short label ("—" for none). §5 */
export function WeekTemplateStrip({
  template,
  statuses,
}: {
  template: WeekTemplate;
  statuses: StatusesResponse | undefined;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={s.row}>
      {template.days.map((d, i) => {
        const found = findReason(statuses, d?.reasonId);
        const role = found ? categoryRole(found.category.code) : 'neutral';
        return (
          <View
            key={i}
            style={[s.day, { backgroundColor: c.tint[role].bg }]}
            accessible
            accessibilityLabel={`${t.rowDay(t.dayNames[i]!)} · ${found?.reason.nameHe ?? t.none}`}
          >
            <Txt variant="caption" tone="secondary">
              {t.dayLetters[i]}
            </Txt>
            {found ? (
              <CategoryIcon code={found.category.code} size={18} />
            ) : (
              <Txt variant="body" tone="disabled">
                —
              </Txt>
            )}
            <Txt variant="caption" numberOfLines={1} style={s.label}>
              {found ? found.reason.nameHe : t.none}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', gap: space.xs },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: space.sm,
    paddingHorizontal: 2,
    borderRadius: radius.tile,
    minWidth: 0,
  },
  label: { fontSize: 10, lineHeight: 14 },
}));
