import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { space } from '../theme/tokens';
import { Txt } from './Txt';
import { MOTION_MS, useReducedMotion } from './useReducedMotion';

type Props = {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  size?: number;
};

/** The big teal circle for the one-tap action ("אני בבסיס"), with press feedback + haptic. */
export function HeroAction({ label, icon, onPress, loading, disabled, size = 220 }: Props) {
  const styles = useStyles();
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    reduced
      ? undefined
      : Animated.timing(scale, {
          toValue: v,
          duration: MOTION_MS / 2,
          useNativeDriver: true,
        }).start();
  const off = disabled || loading;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        onPressIn={() => to(0.96)}
        onPressOut={() => to(1)}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-disabled={!!disabled}
        aria-busy={!!loading}
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          off && styles.off,
        ]}
      >
        {loading ? <ActivityIndicator size="large" color={c.onAccent} /> : icon}
        <Txt variant="display" tone="onAccent" center style={styles.label}>
          {label}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c, sh) => ({
  circle: {
    backgroundColor: c.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...sh.lg,
  },
  label: { marginTop: space.sm },
  off: { opacity: 0.6 },
}));
