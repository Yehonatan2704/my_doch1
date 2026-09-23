import { NOTE_MAX, type CategoryCode, type Report, type StatusesResponse } from '@doch1/shared';
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { reasonBlocked } from '../../hooks/commander/logic';
import { useCommanderPutReport } from '../../hooks/commander/useCommander';
import { commanderDetail as t } from '../../i18n/he';
import type { ApiError } from '../../lib/api';
import { font, radius, space, type } from '../../theme/tokens';
import { makeStyles } from '../../theme/theme';
import { Banner } from '../Banner';
import { CategoryIcon } from '../CategoryIcon';
import { OptionRow } from '../OptionRow';
import { PillButton } from '../PillButton';
import { Sheet } from '../Sheet';
import { Txt } from '../Txt';
import { Chip } from './Chip';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  statuses: StatusesResponse;
  soldierId: string;
  soldierName: string;
  date: string;
  /** The current report — null means "report for a non-reporter" (E4). */
  report: Report | null;
};

/**
 * F9 editor: change category/reason (commander-only reasons included) and the note, for a report
 * or on behalf of a soldier who didn't report. No upload here (SPEC §9 row 20).
 */
export function ReportEditor({
  visible,
  onClose,
  onSaved,
  statuses,
  soldierId,
  soldierName,
  date,
  report,
}: Props) {
  const s = useStyles();
  const save = useCommanderPutReport();
  const [categoryCode, setCategoryCode] = useState<CategoryCode>('on_base');
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Start from the current values every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setCategoryCode(report?.reason.categoryCode ?? 'on_base');
    const onBase = statuses.categories.find((c) => c.code === 'on_base')?.reasons;
    setReasonId(report?.reason.id ?? (onBase?.length === 1 ? onBase[0].id : null));
    setNote(report?.note ?? '');
    setError(null);
  }, [visible, report, statuses]);

  const category = statuses.categories.find((c) => c.code === categoryCode);
  const reason = category?.reasons.find((r) => r.id === reasonId);
  const hasDocument = !!report?.documentId;
  const blocked = !reason
    ? t.pickReason
    : (reasonBlocked(reason, hasDocument, t.needsDocument) ??
      (note.trim().length > NOTE_MAX ? t.noteTooLong : null));

  const submit = () => {
    if (!reason) return;
    const trimmed = note.trim();
    setError(null);
    save.mutate(
      {
        userId: soldierId,
        date,
        body: { reasonId: reason.id, ...(reason.allowsNote && trimmed ? { note: trimmed } : {}) },
      },
      { onSuccess: onSaved, onError: (e) => setError((e as ApiError).message) },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={report ? t.editTitle(soldierName) : t.reportForTitle(soldierName)}
    >
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {statuses.categories.map((c) => (
            <Chip
              key={c.code}
              label={c.nameHe}
              icon={<CategoryIcon code={c.code} size={16} />}
              selected={c.code === categoryCode}
              onPress={() => {
                setCategoryCode(c.code);
                setReasonId(c.reasons.length === 1 ? c.reasons[0].id : null);
              }}
            />
          ))}
        </ScrollView>

        <View accessibilityRole="radiogroup" style={s.reasons}>
          {category?.reasons.map((r) => {
            const why = reasonBlocked(r, hasDocument, t.needsDocument);
            return (
              <OptionRow
                key={r.id}
                label={r.nameHe}
                hint={why ?? (r.commanderOnly ? t.commanderOnly : undefined)}
                selected={r.id === reasonId}
                onPress={() => setReasonId(r.id)}
              />
            );
          })}
        </View>

        {reason?.allowsNote ? (
          <View style={s.section}>
            <Txt variant="body" tone="secondary">
              {t.noteLabel}
            </Txt>
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MAX}
              multiline
              accessibilityLabel={t.noteLabel}
              style={s.note}
            />
          </View>
        ) : null}

        {error ? <Banner kind="danger" text={error} /> : null}
      </ScrollView>
      <PillButton
        label={t.save}
        variant="primary"
        onPress={submit}
        loading={save.isPending}
        disabled={!!blocked}
        disabledReason={blocked ?? undefined}
      />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  body: { gap: space.md, paddingBottom: space.md },
  chips: { gap: space.sm },
  reasons: { borderRadius: radius.card, overflow: 'hidden' },
  section: { gap: space.sm },
  note: {
    ...type.body,
    fontFamily: font.regular,
    color: c.text.primary,
    minHeight: 80,
    borderWidth: 1,
    borderColor: c.border.subtle,
    borderRadius: radius.card,
    backgroundColor: c.surface.base,
    padding: space.md,
    textAlign: 'right',
    textAlignVertical: 'top',
  },
}));
