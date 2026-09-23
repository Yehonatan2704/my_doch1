import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space, type Palette } from '../theme/tokens';
import { Txt } from './Txt';

/** `dark` is a legacy alias of `primary`. */
export type PillVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'onHero' | 'dark';

type Props = {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  disabled?: boolean;
  /** DESIGN.md: a disabled button explains why, e.g. "יש לצרף אישור רפואי". */
  disabledReason?: string;
  loading?: boolean;
  style?: ViewStyle;
};

type Look = { bg: string; fg: string; border?: string };

function lookFor(c: Palette, variant: PillVariant): Look {
  switch (variant) {
    case 'soft':
      return { bg: c.surface.accent, fg: c.accentInk };
    case 'ghost':
      return { bg: c.surface.page, fg: c.text.primary, border: c.border.subtle };
    case 'danger':
      return { bg: c.status.missing, fg: c.hero.text };
    case 'onHero':
      return { bg: c.hero.accent, fg: c.onAccent };
    case 'primary':
    case 'dark':
    default:
      return { bg: c.brand.accent, fg: c.onAccent };
  }
}

export function PillButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  disabledReason,
  loading,
  style,
}: Props) {
  const s = useStyles();
  const { c } = useTheme();
  const off = disabled || loading;
  const v: Look = disabled
    ? { bg: c.border.subtle, fg: c.text.disabled }
    : lookFor(c, variant);
  return (
    <View style={style}>
      <Pressable
        onPress={onPress}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={disabled ? disabledReason : undefined}
        aria-disabled={!!disabled}
        aria-busy={!!loading}
        style={({ pressed }) => [
          s.pill,
          { backgroundColor: v.bg },
          v.border ? [s.bordered, { borderColor: v.border }] : null,
          pressed && !off && s.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={v.fg} />
        ) : (
          <Txt variant="heading" style={{ color: v.fg }} center>
            {label}
          </Txt>
        )}
      </Pressable>
      {disabled && disabledReason ? (
        <Txt variant="caption" tone="secondary" center style={s.reason}>
          {disabledReason}
        </Txt>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  pill: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: { borderWidth: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  reason: { marginTop: space.xs },
}));
