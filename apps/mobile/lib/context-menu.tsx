import React from 'react';
import { Platform, UIManager } from 'react-native';

export type ContextMenuProps = {
  actions?: { title: string; systemIcon?: string }[];
  onPress?: (e: { nativeEvent: { name: string } }) => void;
  previewBackgroundColor?: string;
  children: React.ReactNode;
};

const ContextMenuFallback = ({ children }: ContextMenuProps) => <>{children}</>;

let ResolvedContextMenu: React.ComponentType<ContextMenuProps> = ContextMenuFallback;

if (Platform.OS === 'ios' && UIManager.getViewManagerConfig('ContextMenu') != null) {
  // Avoid importing the native-only package when Expo renders the web/router-server bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const contextMenuModule = require('react-native-context-menu-view') as {
    default: React.ComponentType<ContextMenuProps>;
  };

  ResolvedContextMenu = contextMenuModule.default;
}

export default function ContextMenu(props: ContextMenuProps) {
  return <ResolvedContextMenu {...props} />;
}
