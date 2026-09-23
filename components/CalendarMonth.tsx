import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import { PanResponder, Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { calendar as t, calendarTab as tTab } from '../i18n/he';
import { monthWeeks, type DayMark, type Month, type Ymd } from '../lib/calendar';
import { dayLabelIL, monthLabelIL } from '../lib/time';
import { makeStyles, useTheme } from '../theme/theme';
import { cardSurface, font, radius, space, tabular } from '../theme/tokens';
import { categoryRole } from './CategoryIcon';
import { Txt } from './Txt';

type Props = {
  month: Month;
  /** Israeli "today" from the server (never the phone's date). */
  today: Ymd;
  marks?: Record<Ymd, DayMark>;
  /** Editable days (§7.3: today…today+7). Later non-editable days look disabled. Default: all. */
  isEnabled?: (d: Ymd) => boolean;
  /** Called for every tapped day (past, editable, disabled) — the screen decides what to do. */
  onPressDay?: (d: Ymd) => void;
  /** Days currently selected (range drag or open picker) — solid teal. */
  selected?: readonly Ymd[];
  /**
   * Press-and-drag range selection over editable days. `onSelecting` gets the live range (null
   * when the drag ends); `onRangeSelect` gets the final range on release. Both also get the day
   * the swipe started on, so the screen can decide to add or remove (swipe from a selected day).
   */
  rangeOf?: (a: Ymd, b: Ymd) => Ymd[];
  onSelecting?: (days: Ymd[] | null, start: Ymd | null) => void;
  onRangeSelect?: (days: Ymd[], start: Ymd) => void;
  /** Month buttons; hidden when not given. Labels = the month you land on (§7.3). */
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  /** "חזרה להיום" — shown when given. */
  onToday?: () => void;
};

const DRAG_SLOP = 8;

/**
 * Month grid, 7 columns Sun→Sat — RTL puts יום א' on the right (DESIGN.md §7.3 cell states).
 * Range drag: PanResponder + hit-testing on measured cell layouts (works on native and web).
 */
export function CalendarMonth({
  month,
  today,
  marks = {},
  isEnabled = () => true,
  onPressDay,
  selected,
  rangeOf,
  onSelecting,
  onRangeSelect,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  onToday,
}: Props) {
  const styles = useStyles();
  const weeks = monthWeeks(month);
  const sel = new Set(selected);

  // ---- layout for hit-testing (grid-relative) ----
  const gridRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const rows = useRef<{ y: number; h: number }[]>([]);
  const cells = useRef<Record<string, { x: number; w: number; d: Ymd }>>({});
  const drag = useRef<{ start: Ymd | null; last: Ymd | null; days: Ymd[]; moved: boolean }>({
    start: null,
    last: null,
    days: [],
    moved: false,
  });
  const latest = useRef({ isEnabled, rangeOf, onSelecting, onRangeSelect, onPressDay });
  latest.current = { isEnabled, rangeOf, onSelecting, onRangeSelect, onPressDay };

  const measure = () => {
    // Web: read the grid's position synchronously (it moves when the page scrolls, and the async
    // measure() would answer after the press is already hit-tested).
    const node = gridRef.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
    if (Platform.OS === 'web' && node?.getBoundingClientRect) {
      const r = node.getBoundingClientRect();
      origin.current = { x: r.left, y: r.top };
      return;
    }
    gridRef.current?.measure((_x, _y, _w, _h, px, py) => {
      origin.current = { x: px, y: py };
    });
  };

  const hit = (pageX: number, pageY: number): Ymd | null => {
    // Web: ask the browser which day cell is under the pointer (layout callbacks aren't reliable
    // there, and page/inner scrolling shifts every cell).
    if (Platform.OS === 'web') {
      const doc = (globalThis as { document?: Document }).document;
      const el = doc?.elementFromPoint(
        pageX - (globalThis.scrollX ?? 0),
        pageY - (globalThis.scrollY ?? 0),
      );
      return (el?.closest('[data-day]')?.getAttribute('data-day') as Ymd | null) ?? null;
    }
    const x = pageX - origin.current.x;
    const y = pageY - origin.current.y;
    const r = rows.current.findIndex((row) => row && y >= row.y && y < row.y + row.h);
    if (r < 0) return null;
    for (let j = 0; j < 7; j++) {
      const c = cells.current[`${r}:${j}`];
      if (c && x >= c.x && x < c.x + c.w) return c.d;
    }
    return null;
  };

  // The grid owns every press that starts on an editable day (capture phase, before the cell's
  // Pressable): no movement → a tap on that day; movement → a live range. Other days fall through
  // to their Pressable (past = read-only sheet, disabled = toast).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (e) => {
          const { rangeOf: ro, onRangeSelect: done, isEnabled: ok } = latest.current;
          if (!ro || !done) return false;
          measure();
          const start = hit(e.nativeEvent.pageX, e.nativeEvent.pageY);
          if (!start || !ok(start)) return false;
          drag.current = { start, last: null, days: [], moved: false };
          return true;
        },
        onPanResponderMove: (_e, g) => {
          if (!drag.current.moved && Math.abs(g.dx) < DRAG_SLOP && Math.abs(g.dy) < DRAG_SLOP)
            return;
          drag.current.moved = true;
          update(g.moveX, g.moveY);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => finish(true),
        onPanResponderTerminate: () => finish(false),
      }),
    [],
  );

  function update(pageX: number, pageY: number) {
    const { start } = drag.current;
    const ro = latest.current.rangeOf;
    if (!start || !ro) return;
    const d = hit(pageX, pageY);
    if (!d || d === drag.current.last) return;
    const days = ro(start, d);
    if (!days.length) return;
    if (days.length !== drag.current.days.length && Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    drag.current = { ...drag.current, last: d, days };
    latest.current.onSelecting?.(days, start);
  }

  function finish(commit: boolean) {
    const { start, days, moved } = drag.current;
    drag.current = { start: null, last: null, days: [], moved: false };
    latest.current.onSelecting?.(null, null);
    if (!commit || !start) return;
    if (!moved) latest.current.onPressDay?.(start);
    else if (days.length) latest.current.onRangeSelect?.(days, start);
  }

  const onMonth = today.slice(0, 7) === `${month.year}-${String(month.month).padStart(2, '0')}`;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Arrow
          label={prevLabel ?? t.prevMonth}
          text={prevLabel}
          onPress={onPrev}
          Icon={ChevronRight}
        />
        <Txt variant="heading" center style={styles.flex} accessibilityRole="header">
          {monthLabelIL(month.year, month.month)}
        </Txt>
        <Arrow
          label={nextLabel ?? t.nextMonth}
          text={nextLabel}
          onPress={onNext}
          Icon={ChevronLeft}
          next
        />
      </View>
      {onToday && !onMonth ? (
        <Pressable
          onPress={onToday}
          accessibilityRole="button"
          style={({ pressed }) => [styles.todayLink, pressed && { opacity: 0.6 }]}
        >
          <Txt variant="caption" style={styles.todayLinkText}>
            {tTab.backToToday}
          </Txt>
        </Pressable>
      ) : null}

      <View style={styles.row} aria-hidden>
        {t.weekdays.map((w) => (
          <Txt key={w} variant="caption" tone="secondary" center style={styles.flex}>
            {w}
          </Txt>
        ))}
      </View>

      <View
        ref={gridRef}
        onLayout={measure}
        // Web: stop the browser from scrolling/zooming while a finger drags across the grid.
        style={
          Platform.OS === 'web'
            ? ({ touchAction: 'none', userSelect: 'none' } as object)
            : undefined
        }
        onTouchStart={measure}
        {...(Platform.OS === 'web' ? { onMouseDown: measure } : null)}
        {...pan.panHandlers}
      >
        {weeks.map((week, i) => (
          <View
            key={i}
            style={styles.row}
            onLayout={(e: LayoutChangeEvent) => {
              rows.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
            }}
          >
            {week.map((d, j) => (
              <View
                key={d ?? `x${j}`}
                style={styles.flex}
                onLayout={(e: LayoutChangeEvent) => {
                  if (d) {
                    const { x, width } = e.nativeEvent.layout;
                    cells.current[`${i}:${j}`] = { x, w: width, d };
                  } else delete cells.current[`${i}:${j}`];
                }}
              >
                {d ? (
                  <Day
                    date={d}
                    mark={marks[d]}
                    isToday={d === today}
                    past={d < today}
                    enabled={isEnabled(d)}
                    selected={sel.has(d)}
                    onPress={onPressDay}
                  />
                ) : (
                  <View style={styles.cell} />
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Day({
  date,
  mark,
  isToday,
  past,
  enabled,
  selected,
  onPress,
}: {
  date: Ymd;
  mark?: DayMark;
  isToday: boolean;
  past: boolean;
  enabled: boolean;
  selected: boolean;
  onPress?: (d: Ymd) => void;
}) {
  const styles = useStyles();
  const { c } = useTheme();
  const disabled = !past && !enabled;
  const editable = enabled && !past;
  const text = mark?.label ?? (mark?.present ? t.present : undefined);
  const labelColor = selected
    ? c.onAccent
    : mark?.category
      ? c.tint[categoryRole(mark.category)].fg
      : c.text.secondary;
  const a11y = [
    dayLabelIL(date),
    isToday && t.today,
    text ?? (editable || past ? t.notReported : null),
    mark?.pending && editable && tTab.cellPending,
    mark?.changed && t.changed,
    mark?.attachment && t.attachment,
    disabled && tTab.cellDisabled,
    selected && tTab.cellSelected,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      style={({ pressed }) => [
        styles.cell,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && { opacity: 0.6 },
      ]}
      onPress={onPress ? () => onPress(date) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={a11y}
      accessibilityState={{ selected, disabled }}
      // Web: `data-day` lets the grid hit-test the pointer (see `hit`).
      {...({ dataSet: { day: date } } as object)}
    >
      {mark?.pending && editable ? <View style={styles.pendingDot} /> : null}
      <View
        style={[styles.num, isToday && !selected && styles.today, mark?.changed && styles.changed]}
      >
        <Txt
          variant="body"
          tone={
            selected || isToday
              ? 'onAccent'
              : past
                ? 'secondary'
                : disabled
                  ? 'disabled'
                  : 'primary'
          }
          style={[tabular, (isToday || editable) && styles.bold, disabled && styles.strike]}
        >
          {Number(date.slice(8))}
        </Txt>
      </View>
      {text ? (
        <Txt
          variant="caption"
          numberOfLines={1}
          style={[styles.label, { color: labelColor }]}
          aria-hidden
        >
          {text}
        </Txt>
      ) : past ? (
        <View style={styles.emptyDot} aria-hidden />
      ) : null}
      {mark?.attachment ? (
        <Paperclip size={10} strokeWidth={2} color={selected ? c.onAccent : c.text.secondary} />
      ) : null}
    </Pressable>
  );
}

function Arrow({
  label,
  text,
  onPress,
  Icon,
  next,
}: {
  label: string;
  /** Visible month name next to the chevron. */
  text?: string;
  onPress?: () => void;
  Icon: typeof ChevronLeft;
  next?: boolean;
}) {
  const styles = useStyles();
  const { c } = useTheme();
  if (!onPress) return <View style={[styles.arrow, text ? styles.arrowText : null]} />;
  const icon = <Icon size={20} strokeWidth={2} color={c.accentInk} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.arrow,
        text ? styles.arrowText : null,
        pressed && { opacity: 0.6 },
      ]}
    >
      {!next ? icon : null}
      {text ? (
        <Txt variant="caption" numberOfLines={1} style={styles.arrowLabel}>
          {text}
        </Txt>
      ) : null}
      {next ? icon : null}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    ...cardSurface(c),
    padding: space.sm,
    gap: space.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  arrow: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: {
    flexDirection: 'row',
    gap: 2,
    width: 96,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
  },
  arrowLabel: { color: c.accentInk, fontFamily: font.bold },
  todayLink: { alignSelf: 'center', paddingHorizontal: space.md, paddingVertical: space.xs },
  todayLinkText: { color: c.accentInk, fontFamily: font.bold },
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  cell: {
    height: 62,
    margin: 1,
    alignItems: 'center',
    paddingTop: 4,
    gap: 1,
    borderRadius: radius.cell,
  },
  selected: { backgroundColor: c.brand.accent },
  disabled: { opacity: 0.35 },
  num: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  today: { backgroundColor: c.brand.accent },
  changed: { borderColor: c.status.missing },
  bold: { fontFamily: font.bold },
  strike: { textDecorationLine: 'line-through' },
  label: { fontSize: 10, lineHeight: 13, maxWidth: '100%', paddingHorizontal: 2 },
  pendingDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.status.away,
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    backgroundColor: c.text.disabled,
  },
}));
