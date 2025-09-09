import { Select as HeroUISelect, SelectItem as HeroUISelectItem } from '@heroui/react';

// Note: HeroUI Select requires SelectItem to be used directly, not wrapped
// We're re-exporting them here for consistency but they must be used as-is
export const Select = HeroUISelect;
export const SelectItem = HeroUISelectItem;