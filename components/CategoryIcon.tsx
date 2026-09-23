import type { CategoryCode } from '@doch1/shared';
import { Briefcase, MapPin, Plane, Sunrise, Thermometer } from 'lucide-react-native';
import { View } from 'react-native';
import { useTheme } from '../theme/theme';
import type { Role } from '../theme/tokens';

// DESIGN.md §2.2: map-pin (at unit), briefcase (outside unit), sunrise (leave), plane (abroad),
// thermometer (sick).
const ICONS = {
  on_base: MapPin,
  outside_unit: Briefcase,
  annual_leave: Sunrise,
  abroad: Plane,
  sick_leave: Thermometer,
} satisfies Record<CategoryCode, unknown>;

/** Category → color role (DESIGN.md §2.2). Use `c.tint[categoryRole(code)]` for chips/tiles. */
export const CATEGORY_ROLE = {
  on_base: 'present',
  outside_unit: 'accentStrong',
  annual_leave: 'away',
  abroad: 'highlight',
  sick_leave: 'warning',
} as const satisfies Record<CategoryCode, Role>;

export function categoryRole(code: CategoryCode): Role {
  return CATEGORY_ROLE[code];
}

export function CategoryIcon({
  code,
  size = 24,
  tint,
}: {
  code: CategoryCode;
  size?: number;
  /** Defaults to the category's own color (tinted fg). */
  tint?: string;
}) {
  const { c } = useTheme();
  const Icon = ICONS[code];
  // Decorative: the category name is always shown next to it (status never by icon alone).
  return (
    <View aria-hidden>
      <Icon size={size} strokeWidth={1.75} color={tint ?? c.tint[CATEGORY_ROLE[code]].fg} />
    </View>
  );
}
