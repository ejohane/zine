import { cn } from './components';

export function AppWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('wordmark', compact && 'wordmark--compact')}>
      <img className="wordmark__mark" src="/zine-logo.png" alt="" aria-hidden="true" />
      <div className="wordmark__text">
        <p>Zine</p>
        <small>editorial browser</small>
      </div>
    </div>
  );
}
