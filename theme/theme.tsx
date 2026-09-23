// Active theme (DESIGN.md §7.4 "מראה"). Light is the default; the choice is remembered on device.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { kv } from '../lib/secureStorage';
import { palettes, shadows, type Palette, type Scheme } from './tokens';

const KEY = 'doch1.theme';

type ThemeValue = { c: Palette; scheme: Scheme; setScheme: (s: Scheme) => void };

const ThemeContext = createContext<ThemeValue>({
  c: palettes.light,
  scheme: 'light',
  setScheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<Scheme>('light');

  useEffect(() => {
    kv.get(KEY).then((v) => {
      if (v === 'dark' || v === 'light') setSchemeState(v);
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      c: palettes[scheme],
      scheme,
      setScheme: (s) => {
        setSchemeState(s);
        void kv.set(KEY, s);
      },
    }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Themed StyleSheet: `const useStyles = makeStyles((c) => ({ ... }))` at module level,
 * then `const s = useStyles()` inside the component. Built once per scheme.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  fn: (c: Palette, sh: ReturnType<typeof shadows>) => T,
) {
  const cache: Partial<Record<Scheme, T>> = {};
  return function useStyles(): T {
    const { c, scheme } = useTheme();
    return (cache[scheme] ??= StyleSheet.create(fn(c, shadows(c))));
  };
}
