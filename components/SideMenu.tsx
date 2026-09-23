import { router, type Href } from 'expo-router';
import { ArrowLeftRight, LogOut } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menu as t, shell, ui } from '../i18n/he';
import { useSignOut } from '../lib/auth';
import { useMe } from '../lib/hooks/useMe';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Avatar, ModePill, useAppMode } from './TopBar';
import { Txt } from './Txt';
import { useReducedMotion } from './useReducedMotion';

/**
 * Account menu (DESIGN.md §4.2). No provider needed — a screen does:
 *   const menu = useSideMenu();  …  <TopBar onMenu={menu.open} />  …  {menu.element}
 */
export function useSideMenu() {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const element = <SideMenu visible={visible} onClose={() => setVisible(false)} />;
  return { open, element };
}

const COMMANDER = '/commander' as Href;

/** Popover anchored top-left (end in RTL): user, current mode, switch mode, log out. */
export function SideMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles();
  const me = useMe();
  const signOut = useSignOut();
  const mode = useAppMode();
  const [busy, setBusy] = useState(false);

  const user = me.data?.user;
  const name = user ? `${user.firstName} ${user.lastName}` : '';
  const toCommander = mode === 'soldier';

  const switchMode = () => {
    onClose();
    if (toCommander) router.navigate(COMMANDER);
    else router.dismissTo('/');
  };

  const logout = async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={s.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={ui.close}
      />
      <View
        style={[s.card, { top: insets.top + 64 }]}
        accessibilityViewIsModal
        aria-modal
        aria-label={t.title}
      >
        <View style={s.user}>
          <Avatar name={name} size={48} />
          <View style={s.flex}>
            <Txt variant="heading" numberOfLines={1}>
              {name}
            </Txt>
            {me.data?.group ? (
              <Txt variant="caption" tone="secondary" numberOfLines={1}>
                {me.data.group.name}
              </Txt>
            ) : null}
          </View>
        </View>

        <View style={[s.section, s.modeRow]}>
          <Txt variant="caption" tone="secondary">
            {shell.currentMode}
          </Txt>
          <ModePill mode={mode} />
        </View>

        {me.data?.isCommander || !toCommander ? (
          <Pressable
            onPress={switchMode}
            accessibilityRole="button"
            style={({ pressed }) => [s.section, s.row, pressed && s.pressed]}
          >
            <View style={s.tile}>
              <ArrowLeftRight size={18} strokeWidth={2} color={c.accentInk} />
            </View>
            <View style={s.flex}>
              <Txt variant="heading">{toCommander ? shell.toCommander : shell.toSoldier}</Txt>
              <Txt variant="caption" tone="secondary">
                {toCommander ? shell.toCommanderSub : shell.toSoldierSub}
              </Txt>
            </View>
          </Pressable>
        ) : null}

        <Pressable
          onPress={logout}
          disabled={busy}
          accessibilityRole="button"
          aria-busy={busy}
          style={({ pressed }) => [s.section, s.row, (pressed || busy) && s.pressed]}
        >
          <LogOut size={18} strokeWidth={2} color={c.status.missing} />
          <Txt variant="heading" tone="missing">
            {t.logout}
          </Txt>
        </Pressable>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c, sh) => ({
  backdrop: { ...({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const) },
  card: {
    position: 'absolute',
    left: space.screen,
    width: 288,
    maxWidth: '92%',
    backgroundColor: c.surface.elevated,
    borderRadius: radius.card,
    borderWidth: c.scheme === 'dark' ? 1 : 0,
    borderColor: c.border.subtle,
    overflow: 'hidden',
    ...sh.lg,
  },
  user: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  flex: { flex: 1, alignItems: 'flex-start' },
  section: {
    borderTopWidth: 1,
    borderTopColor: c.border.subtle,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: c.surface.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
}));
