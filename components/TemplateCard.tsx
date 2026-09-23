import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { weekTemplate as t, settingsV2 as ts } from '../i18n/he';
import { addDays, shortDM } from '../lib/calendar';
import { useStatuses } from '../lib/hooks/useReports';
import { useTemplate } from '../lib/hooks/useSettings';
import { makeStyles } from '../theme/theme';
import { cardSurface, space } from '../theme/tokens';
import { ApplyTemplateSheet, useApplyPlan } from './ApplyTemplateSheet';
import { PillButton } from './PillButton';
import { Skeleton } from './States';
import { TemplateEditorSheet } from './TemplateEditorSheet';
import { Txt } from './Txt';
import { WeekTemplateStrip } from './WeekTemplateStrip';

/**
 * "התבנית השבועית שלי" (DESIGN §7.3 item 0, §7.4 item 4) — soldier mode only.
 * `variant="future"` adds the apply button; `"settings"` just the edit link.
 */
export function TemplateCard({
  variant,
  onToast,
}: {
  variant: 'future' | 'settings';
  onToast: (text: string) => void;
}) {
  const s = useStyles();
  const template = useTemplate();
  const statuses = useStatuses();
  const plan = useApplyPlan();
  const [sheet, setSheet] = useState<'edit' | 'apply' | null>(null);

  if (!template.data) return <Skeleton height={140} />;
  const fixed = template.data.days.filter(Boolean).length;
  const k = plan?.toAdd.length ?? 0;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.flex}>
          <Txt variant="heading" accessibilityRole="header">
            {t.cardTitle}
          </Txt>
          <Txt variant="caption" tone="secondary">
            {t.cardSub(fixed)}
          </Txt>
        </View>
        {variant === 'future' ? (
          <Pressable
            onPress={() => setSheet('edit')}
            accessibilityRole="button"
            accessibilityLabel={t.edit}
            hitSlop={8}
            style={s.link}
          >
            <Txt variant="heading" tone="accent">
              {t.edit}
            </Txt>
          </Pressable>
        ) : null}
      </View>
      <WeekTemplateStrip template={template.data} statuses={statuses.data} />
      {variant === 'future' ? (
        <>
          <PillButton
            label={k ? t.applyWindow(k) : t.allReported}
            onPress={() => setSheet('apply')}
            disabled={!plan || k === 0}
          />
          {plan ? (
            <Txt variant="caption" tone="secondary" center>
              {t.applyCaption(shortDM(plan.today), shortDM(addDays(plan.today, 7)))}
            </Txt>
          ) : null}
        </>
      ) : (
        <PillButton label={ts.editTemplate} variant="soft" onPress={() => setSheet('edit')} />
      )}

      {sheet === 'edit' ? (
        <TemplateEditorSheet
          from="edit"
          onClose={() => setSheet(null)}
          onSaved={() => onToast(t.saved)}
        />
      ) : null}
      {sheet === 'apply' ? (
        <ApplyTemplateSheet
          onClose={() => setSheet(null)}
          onEditTemplate={() => setSheet('edit')}
          onDone={(n) => {
            setSheet(null);
            onToast(t.applied(n));
          }}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { ...cardSurface(c), padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  link: { minHeight: 44, justifyContent: 'center' },
}));
