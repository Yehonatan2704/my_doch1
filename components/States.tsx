import { CircleAlert, Inbox } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';
import { ui } from '../i18n/he';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { PillButton } from './PillButton';
import { Txt } from './Txt';
import { useReducedMotion } from './useReducedMotion';

// DESIGN.md: every list/screen has an empty, an error and a loading state.

export function EmptyState({
  title = ui.emptyTitle,
  body,
  icon,
}: {
  title?: string;
  body?: string;
  icon?: ReactNode;
}) {
  const styles = useStyles();
  const { c } = useTheme();
  return (
    <View style={styles.center}>
      {icon ?? (
        <View style={[styles.iconTile, { backgroundColor: c.tint.neutral.bg }]}>
          <Inbox size={32} strokeWidth={1.75} color={c.text.secondary} />
        </View>
      )}
      <Txt variant="heading" center>
        {title}
      </Txt>
      {body ? (
        <Txt variant="body" tone="secondary" center>
          {body}
        </Txt>
      ) : null}
    </View>
  );
}

/** `message` is the server's safe Hebrew text (`ApiError.message`) when there is one. */
export function ErrorState({
  message = ui.errorBody,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const styles = useStyles();
  const { c } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.iconTile, { backgroundColor: c.tint.missing.bg }]}>
        <CircleAlert size={32} strokeWidth={1.75} color={c.status.missing} />
      </View>
      <Txt variant="heading" center>
        {ui.errorTitle}
      </Txt>
      <Txt variant="body" tone="secondary" center>
        {message}
      </Txt>
      {onRetry ? (
        <PillButton label={ui.retry} variant="ghost" onPress={onRetry} style={styles.retry} />
      ) : null}
    </View>
  );
}

/** A grey placeholder block that pulses while loading (static with reduce motion). */
export function Skeleton({
  width = '100%',
  height = 16,
  round,
}: {
  width?: DimensionValue;
  height?: number;
  round?: boolean;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return (
    <Animated.View
      accessibilityLabel={ui.loading}
      style={{
        width,
        height,
        opacity,
        borderRadius: round ? height / 2 : radius.cell,
        backgroundColor: c.border.subtle,
      }}
    />
  );
}

const useStyles = makeStyles(() => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xxl,
  },
  retry: { marginTop: space.sm, minWidth: 160 },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
