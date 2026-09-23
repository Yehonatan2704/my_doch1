import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '../i18n/he';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Txt } from './Txt';
import { useReducedMotion } from './useReducedMotion';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/** Bottom sheet over a dimmed backdrop (F4 day sheet, F5 day detail). Tap outside or X closes. */
export function Sheet({ visible, onClose, title, children }: Props) {
  const styles = useStyles();
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={ui.close}
        />
        <View
          style={[styles.sheet, { paddingBottom: bottom + space.lg }]}
          accessibilityViewIsModal
          aria-modal
        >
          <View style={styles.handle} aria-hidden />
          <View style={styles.header}>
            <Txt variant="heading" style={styles.title} accessibilityRole="header">
              {title}
            </Txt>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={ui.close}
              hitSlop={8}
              style={styles.close}
            >
              <X size={24} strokeWidth={1.75} color={c.text.primary} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: c.scrim,
  },
  sheet: {
    backgroundColor: c.surface.elevated,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
    gap: space.md,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border.subtle,
  },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
}));
