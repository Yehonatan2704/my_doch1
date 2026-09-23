import { CircleCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Txt } from './Txt';
import { MOTION_MS, useReducedMotion } from './useReducedMotion';

const SHOW_MS = 2500;

/**
 * Success toast ("הדיווח נשלח ✓"). No provider needed — a screen does:
 *   const toast = useToast();  …  toast.show(text);  …  return <>{…}{toast.element}</>;
 */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const show = useCallback((text: string) => {
    setMessage(text);
    setKey((k) => k + 1);
    AccessibilityInfo.announceForAccessibility(text);
  }, []);
  const element = message ? (
    <Toast key={key} message={message} onHidden={() => setMessage(null)} />
  ) : null;
  return { show, element };
}

function Toast({ message, onHidden }: { message: string; onHidden: () => void }) {
  const styles = useStyles();
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const { bottom } = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    const fade = (v: number) =>
      Animated.timing(opacity, {
        toValue: v,
        duration: reduced ? 0 : MOTION_MS,
        useNativeDriver: true,
      });
    fade(1).start();
    const t = setTimeout(() => fade(0).start(() => onHidden()), SHOW_MS);
    return () => clearTimeout(t);
  }, [opacity, reduced, onHidden]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom: bottom + space.xl, opacity }]}
    >
      <CircleCheck size={22} strokeWidth={1.75} color={c.scheme === 'dark' ? c.tint.present.fg : c.status.present} />
      <Txt variant="heading" style={styles.text}>
        {message}
      </Txt>
    </Animated.View>
  );
}

const useStyles = makeStyles((c, sh) => ({
  toast: {
    pointerEvents: 'none',
    position: 'absolute',
    start: space.screen,
    end: space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: c.toast.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    ...sh.lg,
  },
  text: { color: c.toast.fg, flex: 1 },
}));
