import type { ActiveEmergency, EmergencyResponseStatus } from '@doch1/shared';
import { CircleCheck, LifeBuoy, Siren, X } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { emergency as t, ui } from '../../i18n/he';
import { radius, space } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/theme';
import { Banner } from '../Banner';
import { Txt } from '../Txt';

/** DESIGN.md `EmergencySheet`: full screen, two huge buttons — OK (green) / need help (red). */
export function EmergencySheet({
  event,
  sending,
  error,
  onAnswer,
  onClose,
}: {
  event: ActiveEmergency;
  sending: boolean;
  error: string | null;
  onAnswer: (s: EmergencyResponseStatus) => void;
  /** Only offered once answered — an unanswered event keeps the sheet up. */
  onClose?: () => void;
}) {
  const { top, bottom } = useSafeAreaInsets();
  const st = useStyles();
  const { c } = useTheme();
  const label = (s: EmergencyResponseStatus) => (s === 'ok' ? t.ok : t.needHelp);
  return (
    <Modal visible animationType="none" onRequestClose={onClose ?? (() => undefined)}>
      <View
        style={[st.page, { paddingTop: top + space.lg, paddingBottom: bottom + space.lg }]}
        accessibilityViewIsModal
        aria-modal
      >
        <View style={st.head}>
          {onClose ? (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={ui.close}
              hitSlop={8}
              style={st.close}
            >
              <X size={24} strokeWidth={1.75} color={c.text.primary} />
            </Pressable>
          ) : null}
          <Siren size={48} strokeWidth={1.75} color={c.status.missing} />
          <Txt variant="title" tone="missing" center accessibilityRole="header">
            {t.sheetTitle}
          </Txt>
          <Txt variant="body" tone="secondary" center>
            {event.groupName}
          </Txt>
          {event.message ? (
            <Txt variant="heading" center>
              {event.message}
            </Txt>
          ) : null}
        </View>

        <View style={st.buttons}>
          {(['ok', 'need_help'] as const).map((s) => {
            const Icon = s === 'ok' ? CircleCheck : LifeBuoy;
            const on = event.myResponse === s;
            return (
              <Pressable
                key={s}
                disabled={sending}
                onPress={() => onAnswer(s)}
                accessibilityRole="button"
                accessibilityLabel={label(s)}
                aria-pressed={on}
                style={({ pressed }) => [
                  st.big,
                  { backgroundColor: s === 'ok' ? c.status.present : c.status.missing },
                  on && st.chosen,
                  (pressed || sending) && { opacity: 0.8 },
                ]}
              >
                <Icon size={40} strokeWidth={1.75} color={c.surface.base} />
                <Txt variant="display" style={st.bigText}>
                  {label(s)}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {event.myResponse ? (
          <Txt variant="body" tone="secondary" center>
            {t.answered(label(event.myResponse))}
          </Txt>
        ) : null}
        {error ? <Banner kind="danger" text={error} /> : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  page: {
    flex: 1,
    backgroundColor: c.tint.missing.bg,
    paddingHorizontal: space.screen,
    gap: space.xl,
  },
  head: { alignItems: 'center', gap: space.sm },
  close: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: { flex: 1, gap: space.lg },
  big: {
    flex: 1,
    borderRadius: radius.card * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  chosen: { borderWidth: 6, borderColor: c.text.primary },
  bigText: { color: c.surface.base },
}));
