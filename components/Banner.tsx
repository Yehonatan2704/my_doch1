import { CircleAlert, Info, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { font, radius, space, type Role } from '../theme/tokens';
import { Txt } from './Txt';

export type BannerKind = 'info' | 'warning' | 'danger';

const look: Record<BannerKind, { role: Role; Icon: typeof Info }> = {
  info: { role: 'accent', Icon: Info },
  warning: { role: 'warning', Icon: TriangleAlert },
  danger: { role: 'missing', Icon: CircleAlert },
};

/** Inline message strip, e.g. the red "לא ניתן לשלוח דיווח אחרי 23:59" (F8). */
export function Banner({ kind = 'info', text }: { kind?: BannerKind; text: string }) {
  const s = useStyles();
  const { c } = useTheme();
  const { role, Icon } = look[kind];
  const bg = kind === 'info' ? c.surface.accent : c.tint[role].bg;
  const fg = kind === 'info' ? c.accentInk : c.tint[role].fg;
  return (
    <View
      style={[s.banner, { backgroundColor: bg }]}
      accessibilityRole={kind === 'info' ? 'text' : 'alert'}
    >
      <Icon size={20} strokeWidth={1.75} color={fg} />
      <Txt
        variant="body"
        style={[s.text, { color: kind === 'info' ? c.text.primary : fg }]}
      >
        {text}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.tile,
  },
  text: { flex: 1, fontFamily: font.medium },
}));
