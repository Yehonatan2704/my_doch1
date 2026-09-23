import { usePathname } from 'expo-router';
import { ChevronDown, ChevronRight, User, Users, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shell, ui } from '../i18n/he';
import { useMe } from '../lib/hooks/useMe';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { useSideMenu } from './SideMenu';
import { Txt } from './Txt';

export type AppMode = 'soldier' | 'commander';

/** Mode follows the route: everything under /commander is commander mode. */
export function useAppMode(): AppMode {
  return usePathname().startsWith('/commander') ? 'commander' : 'soldier';
}

type Props = {
  title?: string;
  /** Opens the account menu (account button at the end — left in RTL). */
  onMenu?: () => void;
  /** Account button with its own account menu (top-level tab screens). */
  account?: boolean;
  /** Back arrow at the start — points right in RTL. */
  onBack?: () => void;
  /** Close (X) at the end. */
  onClose?: () => void;
  /** Extra content under the title row. */
  children?: ReactNode;
};

/** App header (DESIGN.md §4.1): title + mode pill at the start, account button at the end. */
export function TopBar({ title, onMenu, account, onBack, onClose, children }: Props) {
  const menu = useSideMenu();
  const { top } = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles();
  const mode = useAppMode();
  return (
    <View style={[s.bar, { paddingTop: top + space.sm }, mode === 'commander' && s.cmdLine]}>
      <View style={s.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={ui.back}
            hitSlop={8}
            style={({ pressed }) => [s.icon, pressed && s.pressed]}
          >
            <ChevronRight size={24} strokeWidth={1.75} color={c.text.primary} />
          </Pressable>
        ) : null}
        <View style={s.titleCol}>
          <Txt variant="title" numberOfLines={1} accessibilityRole="header">
            {title}
          </Txt>
          <ModePill mode={mode} />
        </View>
        {onMenu || account ? (
          <AccountButton mode={mode} onPress={onMenu ?? menu.open} />
        ) : null}
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={ui.close}
            hitSlop={8}
            style={({ pressed }) => [s.icon, pressed && s.pressed]}
          >
            <X size={24} strokeWidth={1.75} color={c.text.primary} />
          </Pressable>
        ) : null}
      </View>
      {children}
      {account ? menu.element : null}
    </View>
  );
}

export function ModePill({ mode }: { mode: AppMode }) {
  const { c } = useTheme();
  const s = useStyles();
  const cmd = mode === 'commander';
  const fg = cmd ? c.cmd.ink : c.accentInk;
  const Icon = cmd ? Users : User;
  return (
    <View style={[s.pill, { backgroundColor: cmd ? c.cmd.tint : c.surface.accent }]}>
      <Icon size={13} strokeWidth={2} color={fg} />
      <Txt variant="caption" style={[s.pillText, { color: fg }]}>
        {cmd ? shell.commanderMode : shell.soldierMode}
      </Txt>
    </View>
  );
}

export function Avatar({ name, size = 36, dot }: { name: string; size?: number; dot?: string }) {
  const { c } = useTheme();
  const s = useStyles();
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <View
      style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      aria-hidden
    >
      <Txt variant="caption" style={[s.initials, { fontSize: size * 0.36 }]}>
        {initials}
      </Txt>
      {dot ? (
        <View style={[s.dot, { backgroundColor: dot, borderColor: c.surface.base }]} />
      ) : null}
    </View>
  );
}

function AccountButton({ mode, onPress }: { mode: AppMode; onPress: () => void }) {
  const { c } = useTheme();
  const s = useStyles();
  const me = useMe();
  const u = me.data?.user;
  const name = u ? `${u.firstName} ${u.lastName}` : '';
  const modeLabel = mode === 'commander' ? shell.commanderMode : shell.soldierMode;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={shell.accountLabel(name, modeLabel)}
      style={({ pressed }) => [s.account, pressed && s.pressed]}
    >
      <Avatar
        name={name}
        size={34}
        dot={mode === 'commander' ? c.brand.highlight : c.brand.accent}
      />
      <ChevronDown size={16} strokeWidth={2} color={c.text.secondary} />
    </Pressable>
  );
}

const useStyles = makeStyles((c, sh) => ({
  bar: {
    backgroundColor: c.surface.base,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
    paddingHorizontal: space.screen,
    paddingBottom: space.md,
  },
  cmdLine: { borderBottomWidth: 3, borderBottomColor: c.brand.highlight },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52 },
  titleCol: { flex: 1, alignItems: 'flex-start', gap: 2 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 12, lineHeight: 16 },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    paddingEnd: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.base,
    ...sh.sm,
  },
  avatar: {
    backgroundColor: c.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: c.brand.highlight, fontWeight: '700' },
  dot: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
}));
