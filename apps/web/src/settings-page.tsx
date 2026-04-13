import { Button, LinkButton, Surface } from './components';
import { useAppSession, useAuthAvailability } from './lib/trpc';

export function SettingsPage() {
  const { mode } = useAuthAvailability();
  const { signOut } = useAppSession();

  return (
    <main className="shell-loading">
      <Surface className="empty-state">
        <p className="eyebrow">Settings</p>
        <h2>Settings are pared back in this web pass.</h2>
        <p>
          Use the bookmarks desk for now. Account controls can come back once the browser channel
          expands.
        </p>
        <div className="button-row">
          <LinkButton to="/bookmarks" tone="ghost">
            Back to bookmarks
          </LinkButton>
          {mode === 'clerk' ? (
            <Button
              tone="danger"
              onClick={() => {
                void signOut({ redirectUrl: '/sign-in' });
              }}
            >
              Sign out
            </Button>
          ) : null}
        </div>
      </Surface>
    </main>
  );
}
