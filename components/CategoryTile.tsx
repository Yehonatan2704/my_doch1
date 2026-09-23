import type { CategoryCode } from '@doch1/shared';
import { Pressable, View } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { cardSurface, radius, space } from '../theme/tokens';
import { CATEGORY_ROLE, CategoryIcon } from './CategoryIcon';
import { Txt } from './Txt';

type Props = { code: CategoryCode; label: string; onPress: () => void; selected?: boolean };

/** Card with a tinted icon tile + label, for the category grid (F3 step 1). */
export function CategoryTile({ code, label, onPress, selected }: Props) {
  const s = useStyles();
  const { c } = useTheme();
  const t = c.tint[CATEGORY_ROLE[code]];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={!!selected}
      style={({ pressed }) => [s.tile, selected && s.selected, pressed && { opacity: 0.85 }]}
    >
      <View style={[s.icon, { backgroundColor: t.bg }]}>
        <CategoryIcon code={code} size={28} tint={t.fg} />
      </View>
      <Txt variant="heading" tone="primary" center>
        {label}
      </Txt>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  tile: {
    ...cardSurface(c),
    flex: 1,
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    minHeight: 44,
    borderWidth: 2,
    borderColor: c.scheme === 'dark' ? c.border.subtle : 'transparent',
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { borderColor: c.brand.accent, backgroundColor: c.surface.accent },
}));
