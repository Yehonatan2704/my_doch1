import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { font, radius, space } from '../theme/tokens';
import { Txt } from './Txt';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Small line under the label, e.g. "נדרש מסמך" / "ניתן להוסיף הערה". */
  hint?: string;
};

/** Full-width single-select row with a check on the selected one (F3 step 2). */
export function OptionRow({ label, selected, onPress, hint }: Props) {
  const styles = useStyles();
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      aria-checked={selected}
      aria-selected={selected}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.text}>
        <Txt variant="body" tone="primary" style={selected ? styles.bold : null}>
          {label}
        </Txt>
        {hint ? (
          <Txt variant="caption" tone="secondary">
            {hint}
          </Txt>
        ) : null}
      </View>
      <View style={styles.check}>
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <Check size={16} strokeWidth={2.5} color={c.onAccent} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.screen,
    paddingVertical: space.md,
    backgroundColor: c.surface.base,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  selected: { backgroundColor: c.surface.accent, borderColor: c.brand.accent },
  text: { flex: 1, gap: 2 },
  bold: { fontFamily: font.medium },
  check: { width: 32, alignItems: 'center' },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: c.brand.accent, borderColor: c.brand.accent },
}));
