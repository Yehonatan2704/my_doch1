import type { CategoryCode, GroupReportRow } from '@doch1/shared';
import {
  AlertTriangle,
  Check,
  Clock,
  Lock,
  MessageSquareText,
  Paperclip,
  Pencil,
  Star,
} from 'lucide-react-native';
import { TZ } from '@doch1/shared';
import { formatInTimeZone } from 'date-fns-tz';
import { Pressable, StyleSheet, View } from 'react-native';
import { commander as t, commanderTeam as tt } from '../../i18n/he';
import { radius, space, type Role } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/theme';
import { CategoryIcon } from '../CategoryIcon';
import { Txt } from '../Txt';

type Props = {
  row: GroupReportRow;
  categoryName: string;
  onPress: () => void;
  onStar: () => void;
  onEdit: () => void;
  onApprove: () => void;
  /** Approve is enabled only for pending, non-finalized reports. */
  canApprove: boolean;
  approving?: boolean;
};

/** "HH:MM" in Israel time. */
export const hhmmIL = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'HH:mm');

const ICON = { size: 18, strokeWidth: 1.75 } as const;

/** DESIGN.md §2.2 category → tint role (avatar + icon). */
const CATEGORY_ROLE: Record<CategoryCode, Role> = {
  on_base: 'present',
  outside_unit: 'accentStrong',
  annual_leave: 'away',
  sick_leave: 'warning',
  abroad: 'highlight',
};

/** DESIGN.md `SoldierRow`: star, name, category/reason, badges, not-reported state (F8). */
export function SoldierRow({
  row,
  categoryName,
  onPress,
  onStar,
  onEdit,
  onApprove,
  canApprove,
  approving,
}: Props) {
  const s = useStyles();
  const { c } = useTheme();
  const { soldier, report } = row;
  const name = `${soldier.firstName} ${soldier.lastName}`;
  const status = report ? [categoryName, report.reason.nameHe].join(', ') : t.notReported;
  const badges = [
    report?.note ? t.hasNote : null,
    report?.documentId ? t.hasDocument : null,
    report?.finalizedAt ? t.finalizedBadge : report && !report.approvedAt ? t.pending : null,
  ].filter(Boolean);
  const avatar = c.tint[report ? CATEGORY_ROLE[report.reason.categoryCode] : 'missing'];
  const initials = `${soldier.firstName.charAt(0)}${soldier.lastName.charAt(0)}`;
  const badge: { role: Role; Icon: typeof Check; label: string } | null = !report
    ? null
    : report.finalizedAt
      ? { role: 'neutral', Icon: Lock, label: t.finalizedBadge }
      : report.approvedAt
        ? { role: 'present', Icon: Check, label: t.approved }
        : { role: 'away', Icon: Clock, label: `${t.pending} · ${hhmmIL(report.updatedAt)}` };

  return (
    <View style={s.row}>
      <Pressable
        onPress={onStar}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={row.isFavorite ? t.unstar(name) : t.star(name)}
        aria-pressed={row.isFavorite}
        style={s.lead}
      >
        <Star
          {...ICON}
          size={22}
          color={row.isFavorite ? c.brand.highlight : c.text.disabled}
          fill={row.isFavorite ? c.brand.highlight : 'transparent'}
        />
      </Pressable>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[name, status, ...badges].join(', ')}
        style={({ pressed }) => [s.main, pressed && { opacity: 0.7 }]}
      >
        <View style={[s.avatar, { backgroundColor: avatar.bg }]} aria-hidden>
          <Txt variant="heading" style={{ color: avatar.fg }}>
            {initials}
          </Txt>
        </View>
        <View style={s.text}>
          <Txt variant="heading" numberOfLines={1}>
            {name}
          </Txt>
          {report ? (
            <>
              <View style={s.line}>
                <CategoryIcon
                  code={report.reason.categoryCode}
                  size={16}
                  tint={c.tint[CATEGORY_ROLE[report.reason.categoryCode]].fg}
                />
                <Txt variant="caption" tone="secondary" numberOfLines={1} style={s.flex}>
                  {categoryName} · {report.reason.nameHe}
                </Txt>
              </View>
            </>
          ) : (
            <View style={s.line}>
              <AlertTriangle {...ICON} size={16} color={c.status.missing} />
              <Txt variant="caption" tone="missing" style={s.bold}>
                {t.notReported}
              </Txt>
            </View>
          )}
        </View>
        <View style={s.badges} aria-hidden>
          {report?.note ? <MessageSquareText {...ICON} color={c.text.secondary} /> : null}
          {report?.documentId ? <Paperclip {...ICON} color={c.text.secondary} /> : null}
          {badge ? (
            <View style={[s.pill, { backgroundColor: c.tint[badge.role].bg }]}>
              <badge.Icon size={14} strokeWidth={2} color={c.tint[badge.role].fg} />
              <Txt variant="caption" style={[s.bold, { color: c.tint[badge.role].fg }]}>
                {badge.label}
              </Txt>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={s.actions}>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={report ? tt.editA11y(name) : tt.reportA11y(name)}
          style={({ pressed }) => [s.iconBtn, s.editBtn, pressed && { opacity: 0.7 }]}
        >
          {report ? (
            <Pencil {...ICON} color={c.text.primary} />
          ) : (
            <Txt variant="caption" style={[s.bold, { color: c.accentInk }]}>
              {tt.report}
            </Txt>
          )}
        </Pressable>
        <Pressable
          onPress={onApprove}
          disabled={!canApprove || approving}
          accessibilityRole="button"
          accessibilityLabel={tt.approveA11y(name)}
          accessibilityState={{ disabled: !canApprove || approving }}
          style={({ pressed }) => [
            s.iconBtn,
            canApprove ? s.approveOn : s.approveOff,
            (pressed || approving) && { opacity: 0.7 },
          ]}
        >
          <Check size={20} strokeWidth={2.25} color={canApprove ? c.onAccent : c.text.disabled} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border.subtle,
    paddingEnd: space.lg,
  },
  lead: { width: 48, minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 72,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  flex: { flexShrink: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bold: { fontWeight: '600' },
  actions: { flexDirection: 'row', gap: space.sm, marginStart: space.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: { backgroundColor: c.surface.page, borderWidth: 1, borderColor: c.border.subtle },
  approveOn: { backgroundColor: c.brand.accent },
  approveOff: { backgroundColor: c.border.subtle },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 26,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
  },
}));
