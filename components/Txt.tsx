import { Text, type TextProps } from 'react-native';
import { type as typeScale } from '../theme/tokens';
import { useTheme } from '../theme/theme';

type Variant = keyof typeof typeScale;
type Tone =
  | 'primary'
  | 'secondary'
  | 'disabled'
  | 'accent'
  | 'present'
  | 'away'
  | 'missing'
  | 'warning'
  | 'onAccent'
  | 'hero'
  | 'heroMuted';

export type TxtProps = TextProps & { variant?: Variant; tone?: Tone; center?: boolean };

/** Text in a DESIGN.md type style. Font scaling stays on (accessibility). */
export function Txt({ variant = 'body', tone = 'primary', center, style, ...rest }: TxtProps) {
  const { c } = useTheme();
  const toneColor: Record<Tone, string> = {
    primary: c.text.primary,
    secondary: c.text.secondary,
    disabled: c.text.disabled,
    accent: c.accentInk,
    present: c.tint.present.fg,
    away: c.tint.away.fg,
    missing: c.status.missing,
    warning: c.tint.warning.fg,
    onAccent: c.onAccent,
    hero: c.hero.text,
    heroMuted: c.hero.textMuted,
  };
  return (
    <Text
      {...rest}
      style={[
        typeScale[variant],
        { color: toneColor[tone], textAlign: center ? 'center' : undefined },
        style,
      ]}
    />
  );
}
