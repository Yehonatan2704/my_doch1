import type { StatusCategory, WeekTemplate } from '@doch1/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { weekTemplate as t } from '../i18n/he';
import type { ApiError } from '../lib/api';
import { useStatuses } from '../lib/hooks/useReports';
import { useSaveTemplate, useTemplate } from '../lib/hooks/useSettings';
import { findReason, templateReasons } from '../lib/template';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Banner } from './Banner';
import { CategoryIcon } from './CategoryIcon';
import { OptionRow } from './OptionRow';
import { PillButton } from './PillButton';
import { Sheet } from './Sheet';
import { Skeleton } from './States';
import { Txt } from './Txt';

type Props = {
  from: 'setup' | 'edit';
  onClose: () => void;
  onSaved?: () => void;
};

/**
 * DESIGN §7.8 — edit the 7-day template as a draft; "שמירה" PUTs it, closing discards it.
 * Mount it only while open so each opening starts from the saved template.
 */
export function TemplateEditorSheet({ from, onClose, onSaved }: Props) {
  const template = useTemplate();
  const statuses = useStatuses();
  const s = useStyles();
  const save = useSaveTemplate();
  const [draft, setDraft] = useState<WeekTemplate | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = draft ?? template.data ?? null;

  const setDay = (i: number, reasonId: number | null) => {
    if (!days) return;
    const next = days.days.map((d, j) => (j === i ? (reasonId ? { reasonId } : null) : d));
    setDraft({ days: next });
    setPicking(null);
  };

  const onSave = () => {
    if (!days) return;
    setError(null);
    save.mutate(days, {
      onSuccess: () => {
        onSaved?.();
        onClose();
      },
      onError: (e) => setError((e as ApiError).message),
    });
  };

  if (picking !== null && days) {
    return (
      <Sheet visible onClose={onClose} title={t.pickerTitle(t.dayNames[picking]!)}>
        <DayPicker
          day={t.dayNames[picking]!}
          current={days.days[picking]?.reasonId ?? null}
          onBack={() => setPicking(null)}
          onPick={(id) => setDay(picking, id)}
        />
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={onClose} title={from === 'setup' ? t.setupTitle : t.editTitle}>
      <Txt variant="caption" tone="secondary">
        {t.explain}
      </Txt>
      {!days || !statuses.data ? (
        <View style={s.list}>
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {days.days.map((d, i) => {
            const found = findReason(statuses.data, d?.reasonId);
            return (
              <DayRow
                key={i}
                letter={t.dayLetters[i]!}
                title={t.rowDay(t.dayNames[i]!)}
                status={found?.reason.nameHe ?? t.none}
                icon={found ? <CategoryIcon code={found.category.code} size={20} /> : null}
                onPress={() => setPicking(i)}
              />
            );
          })}
          <Txt variant="caption" tone="secondary">
            {t.editorNote}
          </Txt>
        </ScrollView>
      )}
      {error ? <Banner kind="danger" text={error} /> : null}
      <PillButton
        label={from === 'setup' ? t.saveSetup : t.saveEdit}
        onPress={onSave}
        loading={save.isPending}
        disabled={!days}
      />
    </Sheet>
  );
}

function DayRow({
  letter,
  title,
  status,
  icon,
  onPress,
}: {
  letter: string;
  title: string;
  status: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} · ${status}`}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
    >
      <View style={s.letter}>
        <Txt variant="heading">{letter}</Txt>
      </View>
      <View style={s.icon}>{icon}</View>
      <View style={s.flex}>
        <Txt variant="caption" tone="secondary">
          {title}
        </Txt>
        <Txt variant="body">{status}</Txt>
      </View>
      <ChevronLeft size={20} strokeWidth={1.75} color={c.text.secondary} />
    </Pressable>
  );
}

/** Template-mode status picker: "ללא סטטוס קבוע", then category → reason. */
function DayPicker({
  day,
  current,
  onBack,
  onPick,
}: {
  day: string;
  current: number | null;
  onBack: () => void;
  onPick: (reasonId: number | null) => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const statuses = useStatuses();
  const [category, setCategory] = useState<StatusCategory | null>(null);
  const [chosen, setChosen] = useState<number | null>(current);
  const chosenName = findReason(statuses.data, chosen ?? undefined)?.reason.nameHe;

  const backRow = (onPress: () => void, label: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.back}
      style={s.back}
    >
      <ChevronRight size={20} strokeWidth={1.75} color={c.text.primary} />
      <Txt variant="heading">{label}</Txt>
    </Pressable>
  );

  return (
    <>
      <Txt variant="caption" tone="secondary">
        {t.pickerEyebrow}
      </Txt>
      {category ? backRow(() => setCategory(null), category.nameHe) : backRow(onBack, t.back)}
      <ScrollView contentContainerStyle={s.list}>
        {category ? (
          <View accessibilityRole="radiogroup" style={s.list}>
            {templateReasons(category).map((r) => (
              <OptionRow
                key={r.id}
                label={r.nameHe}
                selected={chosen === r.id}
                onPress={() => setChosen(r.id)}
              />
            ))}
          </View>
        ) : (
          <>
            <PillButton label={t.noFixed} variant="ghost" onPress={() => onPick(null)} />
            <Txt variant="caption" tone="secondary">
              {t.pickCategory}
            </Txt>
            {(statuses.data?.categories ?? [])
              .filter((cat) => templateReasons(cat).length > 0)
              .map((cat) => {
                const inCat = cat.reasons.find((r) => r.id === chosen);
                return (
                  <Pressable
                    key={cat.code}
                    onPress={() => setCategory(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={cat.nameHe}
                    style={({ pressed }) => [
                      s.row,
                      inCat && s.rowOn,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <CategoryIcon code={cat.code} size={22} />
                    <View style={s.flex}>
                      <Txt variant="body">{cat.nameHe}</Txt>
                      <Txt variant="caption" tone="secondary">
                        {inCat ? inCat.nameHe : t.reasonCount(templateReasons(cat).length)}
                      </Txt>
                    </View>
                    <ChevronLeft size={20} strokeWidth={1.75} color={c.text.secondary} />
                  </Pressable>
                );
              })}
          </>
        )}
      </ScrollView>
      <PillButton
        label={chosenName ? t.pickSave(day, chosenName) : t.pickFirst}
        onPress={() => onPick(chosen)}
        disabled={chosen === null}
      />
    </>
  );
}

const useStyles = makeStyles((c) => ({
  list: { gap: space.sm, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.base,
  },
  rowOn: { borderColor: c.brand.accent, backgroundColor: c.surface.accent },
  letter: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface.page,
  },
  icon: { width: 24, alignItems: 'center' },
  flex: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
}));
