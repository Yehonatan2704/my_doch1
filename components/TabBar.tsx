import { router, usePathname, type Href } from 'expo-router';
import { Calendar, ClipboardCheck, Settings, Users, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabs as t } from '../i18n/he';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { useAppMode } from './TopBar';
import { Txt } from './Txt';

type Tab = { label: string; icon: LucideIcon; href: string; badge?: number };

const SOLDIER: Tab[] = [
  { label: t.myReport, icon: ClipboardCheck, href: '/' },
  { label: t.future, icon: Calendar, href: '/future' },
  { label: t.settings, icon: Settings, href: '/settings' },
];
const COMMANDER: Tab[] = [
  { label: t.team, icon: Users, href: '/commander' },
  { label: t.settings, icon: Settings, href: '/commander/settings' },
];

/** Bottom navigation (DESIGN.md §4.3). Shown only on a mode's top-level tabs. */
export function TabBar({ badge }: { badge?: number }) {
  const { bottom } = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles();
  const mode = useAppMode();
  const pathname = usePathname();
  const list = mode === 'commander' ? COMMANDER : SOLDIER;
  if (!list.some((tab) => tab.href === pathname)) return null;

  return (
    <View style={[s.bar, { paddingBottom: Math.max(bottom, space.sm) }]} accessibilityRole="tablist">
      {list.map((tab, i) => {
        const active = tab.href === pathname;
        const Icon = tab.icon;
        const count = mode === 'commander' && i === 0 ? badge : undefined;
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            aria-selected={active}
            onPress={() => !active && router.replace(tab.href as Href)}
            style={s.tab}
          >
            <View style={[s.iconPill, active && { backgroundColor: c.surface.accent }]}>
              <Icon size={22} strokeWidth={active ? 2.2 : 1.75} color={active ? c.accentInk : c.text.secondary} />
              {count ? (
                <View style={s.badge}>
                  <Txt variant="caption" style={s.badgeText}>
                    {count}
                  </Txt>
                </View>
              ) : null}
            </View>
            <Txt variant="caption" style={[s.label, { color: active ? c.accentInk : c.text.secondary }]}>
              {tab.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: c.surface.base,
    borderTopWidth: 1,
    borderTopColor: c.border.subtle,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56 },
  iconPill: {
    width: 60,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '600' },
  badge: {
    position: 'absolute',
    top: -4,
    end: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: c.status.away,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: c.hero.text, fontSize: 11, lineHeight: 14, fontWeight: '700' },
}));
