import * as Haptics from 'expo-haptics';

import { triggerTabPressHaptics } from '@/app/(tabs)/_layout';

const mockSelectionAsync = jest.mocked(Haptics.selectionAsync);

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    OS: 'ios',
  },
  DynamicColorIOS: (colors: { dark: string; light: string }) => colors,
}));

jest.mock('expo-router/unstable-native-tabs', () => ({
  NativeTabs: Object.assign(() => null, {
    Trigger: Object.assign(() => null, {
      Label: () => null,
      Icon: () => null,
    }),
  }),
}));

jest.mock('@/components/auth-guard', () => ({
  AuthGuard: () => null,
}));

describe('TabLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectionAsync.mockResolvedValue(undefined);
  });

  it('triggers selection haptics when a tab is pressed', () => {
    triggerTabPressHaptics();

    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
  });
});
