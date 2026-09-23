import { ChevronDown, Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { settingsV2 as t } from '../i18n/he';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space, tabular } from '../theme/tokens';
import { Txt } from './Txt';

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/** DESIGN §7.4 — field that opens a 4-column grid of all 24 whole hours. */
export function TimePicker({
  value,
  disabled,
  onChange,
  label = t.time,
}: {
  value: string;
  disabled?: boolean;
  onChange: (hhmm: string) => void;
  label?: string;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = open && !disabled;
  return (
    <View style={[s.wrap, disabled && s.disabled]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value}`}
        aria-expanded={shown}
        aria-disabled={!!disabled}
        style={s.field}
      >
        <Clock size={20} strokeWidth={1.75} color={c.text.secondary} />
        <Txt variant="body" tone="secondary">
          {label}
        </Txt>
        <Txt variant="title" style={[s.value, tabular]}>
          {value.slice(0, 5)}
        </Txt>
        <ChevronDown size={20} strokeWidth={1.75} color={c.text.secondary} />
      </Pressable>
      {shown ? (
        <View style={s.grid} accessibilityRole="radiogroup">
          {HOURS.map((h) => {
            const on = value.slice(0, 5) === h;
            return (
              <Pressable
                key={h}
                onPress={() => {
                  onChange(h);
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityLabel={h}
                aria-checked={on}
                style={[s.cell, on && s.cellOn]}
              >
                <Txt variant="body" center style={[tabular, on ? s.cellOnText : null]}>
                  {h}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: space.sm },
  disabled: { opacity: 0.5 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.page,
  },
  value: { flex: 1, textAlign: 'left' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: {
    width: '23.5%',
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.tile,
    backgroundColor: c.surface.page,
  },
  cellOn: { backgroundColor: c.brand.accent },
  cellOnText: { color: c.onAccent },
}));
