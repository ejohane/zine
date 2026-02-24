import type { Href } from 'expo-router';
import { Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: Href & string;
  /** Optional override for deterministic tests/stories */
  platformOverride?: 'web' | 'native';
  /** Optional override for deterministic tests/stories */
  onOpenExternal?: (url: string) => Promise<void> | void;
};

export function ExternalLink({ href, onPress, platformOverride, onOpenExternal, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        await onPress?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (
          platformOverride === 'native' ||
          (platformOverride !== 'web' && process.env.EXPO_OS !== 'web')
        ) {
          // Prevent the default behavior of linking to the default browser on native.
          event.preventDefault();
          // Open the link in an in-app browser.
          if (onOpenExternal) {
            await onOpenExternal(href);
          } else {
            await openBrowserAsync(href, {
              enableBarCollapsing: true,
              presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
            });
          }
        }
      }}
    />
  );
}
