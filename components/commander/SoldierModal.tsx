import type { CategoryCode, GroupReportRow } from '@doch1/shared';
import { AlertTriangle, X } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import { commander as t, commanderTeam as tt } from '../../i18n/he';
import { makeStyles, useTheme } from '../../theme/theme';
import { radius, space, type Role } from '../../theme/tokens';
import { CategoryIcon } from '../CategoryIcon';
import { PillButton } from '../PillButton';
import { Txt } from '../Txt';
import { hhmmIL } from './SoldierRow';

const CATEGORY_ROLE: Record<CategoryCode, Role> = {
  on_base: 'present',
  outside_unit: 'accentStrong',
  annual_leave: 'away',
  sick_leave: 'warning',
  abroad: 'highlight',
};

type Props = {
  row: GroupReportRow | null;
  categoryName: string;
  canApprove: boolean;
  approving: boolean;
  onClose: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onDetails?: () => void;
};

/** DESIGN.md §7.6: centered soldier card — name, today's status, approve / edit. */
export function SoldierModal({
  row,
  categoryName,
  canApprove,
  approving,
  onClose,
  onApprove,
  onEdit,
  onDetails,
}: Props) {
  const s = useStyles();
  const { c } = useTheme();
  if (!row) return null;
  const { soldier, report } = row;
  const name = `${soldier.firstName} ${soldier.lastName}`;
  const role: Role = report ? CATEGORY_ROLE[report.reason.categoryCode] : 'missing';
  const tint = c.tint[role];
  const badge: { role: Role; label: string } | null = !report
    ? null
    : report.finalizedAt
      ? { role: 'neutral', label: t.finalizedBadge }
      : report.approvedAt
        ? { role: 'present', label: t.approved }
        : { role: 'away', label: t.pending };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel={tt.close}>
        <Pressable style={s.card} accessibilityViewIsModal onPress={() => {}}>
          <View style={s.head}>
            <View style={[s.avatar, { backgroundColor: tint.bg }]} aria-hidden>
              <Txt variant="title" style={{ color: tint.fg }}>
                {soldier.firstName.charAt(0)}
                {soldier.lastName.charAt(0)}
              </Txt>
            </View>
            <View style={s.flex}>
              <Txt variant="title" numberOfLines={1}>
                {name}
              </Txt>
              <Txt variant="caption" tone="secondary" numberOfLines={1}>
                {soldier.groupName}
              </Txt>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tt.close}
              style={s.close}
            >
              <X size={22} strokeWidth={1.75} color={c.text.secondary} />
            </Pressable>
          </View>

          <View style={s.status}>
            <View style={[s.tile, { backgroundColor: tint.bg }]} aria-hidden>
              {report ? (
                <CategoryIcon code={report.reason.categoryCode} size={24} tint={tint.fg} />
              ) : (
                <AlertTriangle size={24} strokeWidth={1.75} color={tint.fg} />
              )}
            </View>
            <View style={s.flex}>
              {report ? (
                <>
                  <Txt variant="heading">{report.reason.nameHe}</Txt>
                  <Txt variant="caption" tone="secondary">
                    {categoryName}
                  </Txt>
                </>
              ) : (
                <Txt variant="heading" tone="missing">
                  {t.notReported}
                </Txt>
              )}
            </View>
            {badge ? (
              <View style={s.badgeCol}>
                <View style={[s.pill, { backgroundColor: c.tint[badge.role].bg }]}>
                  <Txt variant="caption" style={[s.bold, { color: c.tint[badge.role].fg }]}>
                    {badge.label}
                  </Txt>
                </View>
                {report ? (
                  <Txt variant="caption" tone="secondary">
                    {tt.updatedAt(hhmmIL(report.updatedAt))}
                  </Txt>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={s.actions}>
            <PillButton
              label={tt.approve}
              variant="primary"
              onPress={onApprove}
              disabled={!canApprove}
              loading={approving}
              style={s.flex}
            />
            <PillButton
              label={report ? tt.edit : tt.report}
              variant="soft"
              onPress={onEdit}
              style={s.flex}
            />
          </View>
          {onDetails ? (
            <Pressable onPress={onDetails} accessibilityRole="link" style={s.link}>
              <Txt variant="body" tone="accent" center>
                {tt.moreDetails}
              </Txt>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((c, sh) => ({
  scrim: {
    flex: 1,
    backgroundColor: c.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.screen,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: c.surface.elevated,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.lg,
    ...sh.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.tile,
    backgroundColor: c.surface.page,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCol: { alignItems: 'flex-end', gap: 2 },
  pill: {
    height: 26,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
  },
  bold: { fontWeight: '600' },
  actions: { flexDirection: 'row', gap: space.sm },
  link: { minHeight: 44, justifyContent: 'center' },
}));
