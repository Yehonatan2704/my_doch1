import type { GroupNode } from '@doch1/shared';
import { ChevronDown, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { commander as t } from '../../i18n/he';
import { allScope, flattenGroups, type Scope } from '../../hooks/commander/logic';
import { cardSurface, radius, space } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/theme';
import { OptionRow } from '../OptionRow';
import { Sheet } from '../Sheet';
import { Txt } from '../Txt';

/** F8 group selector: my groups as a tree + "כל הקבוצות" (whole subtree). */
export function GroupPicker({
  groups,
  value,
  onChange,
}: {
  groups: GroupNode[];
  value: Scope;
  onChange: (s: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = useStyles();
  const { c } = useTheme();
  const flat = flattenGroups(groups);
  const all = allScope(groups);
  const isAll = value.includeSub;
  const label = isAll ? t.allGroups : (flat.find((g) => g.id === value.groupId)?.name ?? '');
  const pick = (next: Scope) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t.pickGroup}: ${label}`}
        style={({ pressed }) => [s.bar, pressed && { opacity: 0.7 }]}
      >
        <Users size={20} strokeWidth={1.75} color={c.text.primary} />
        <Txt variant="heading" numberOfLines={1} style={s.flex}>
          {label}
        </Txt>
        <ChevronDown size={20} strokeWidth={1.75} color={c.text.primary} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={t.pickGroup}>
        <ScrollView accessibilityRole="radiogroup">
          {all ? (
            <OptionRow
              label={t.allGroups}
              hint={t.withSub}
              selected={isAll}
              onPress={() => pick(all)}
            />
          ) : null}
          {flat.map((g) => (
            <View key={g.id} style={{ paddingStart: g.depth * space.xl }}>
              <OptionRow
                label={g.name}
                selected={!isAll && g.id === value.groupId}
                onPress={() => pick({ groupId: g.id, includeSub: false })}
              />
            </View>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  bar: {
    ...cardSurface(c),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  flex: { flex: 1 },
}));
