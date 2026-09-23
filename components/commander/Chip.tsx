import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { radius, space } from '../../theme/tokens';
import { makeStyles } from '../../theme/theme';
import { Txt } from '../Txt';

/** DESIGN.md filter chip: 38 tall pill; selected = inverted (text.primary bg). */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  tone,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: ReactNode;
  /** Text color when not selected, e.g. red for "לא דיווחו". */
  tone?: 'present' | 'missing' | 'accent';
}) {
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-selected={!!selected}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [s.chip, selected && s.on, pressed && { opacity: 0.7 }]}
    >
      {icon}
      <Txt
        variant="caption"
        tone={selected ? undefined : (tone ?? 'primary')}
        style={[s.label, selected && s.onText]}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const useStyles = makeStyles((c, sh) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 38,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.base,
    ...sh.sm,
  },
  label: { fontWeight: '600' },
  on: { backgroundColor: c.text.primary, borderColor: c.text.primary },
  onText: { color: c.surface.base },
}));
