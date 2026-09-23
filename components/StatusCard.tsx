import type { CategoryCode } from '@doch1/shared';
import { StyleSheet, View } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { ui } from '../i18n/he';
import { cardSurface, font, radius, space } from '../theme/tokens';
import { CATEGORY_ROLE, CategoryIcon } from './CategoryIcon';
import { Txt } from './Txt';

type Props = {
  categoryCode: CategoryCode;
  categoryLabel: string;
  reasonLabel: string;
  note?: string | null;
  /** Set when a commander/HR changed the report: shows "עודכן ע״י {name}". */
  updatedBy?: string | null;
};

/** Today's (or a day's) status: icon, category, reason, note, "updated by" (F2, F5). */
export function StatusCard({ categoryCode, categoryLabel, reasonLabel, note, updatedBy }: Props) {
  const styles = useStyles();
  const { c } = useTheme();
  const t = c.tint[CATEGORY_ROLE[categoryCode]];
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={[categoryLabel, reasonLabel, note].filter(Boolean).join(', ')}
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: t.bg }]}>
          <CategoryIcon code={categoryCode} tint={t.fg} />
        </View>
        <View style={styles.text}>
          <Txt variant="heading">{categoryLabel}</Txt>
          <Txt variant="body" tone="secondary">
            {reasonLabel}
          </Txt>
        </View>
      </View>
      {note ? (
        <View style={styles.note}>
          <Txt variant="caption" tone="secondary">
            {ui.note}
          </Txt>
          <Txt variant="body">{note}</Txt>
        </View>
      ) : null}
      {updatedBy ? (
        <Txt variant="caption" tone="missing" style={styles.updated}>
          {ui.updatedBy(updatedBy)}
        </Txt>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    ...cardSurface(c),
    padding: space.xl,
    gap: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  note: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border.subtle,
    paddingTop: space.sm,
  },
  updated: { fontFamily: font.medium },
}));
