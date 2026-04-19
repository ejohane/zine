import type { OAuthProvider } from './oauth';

export type SupportedSource = OAuthProvider | 'RSS';
export type WizardStep = 'SPOTIFY' | 'YOUTUBE' | 'GMAIL' | 'RSS' | 'DONE';

export const wizardSteps: WizardStep[] = ['SPOTIFY', 'YOUTUBE', 'GMAIL', 'RSS', 'DONE'];

export const wizardStepLabels: Record<WizardStep, string> = {
  SPOTIFY: 'Spotify',
  YOUTUBE: 'YouTube',
  GMAIL: 'Newsletters',
  RSS: 'RSS',
  DONE: 'Done',
};

export type OnboardingOAuthContext = {
  origin: 'welcome' | 'settings';
  provider: OAuthProvider;
};

export const ONBOARDING_OAUTH_CONTEXT_KEY = 'zine:web:onboarding-oauth-context';

export type SourceConfig = {
  id: SupportedSource;
  title: string;
  eyebrow: string;
  summary: string;
  itemNounSingular: string;
  itemNounPlural: string;
};

export const sourceConfigs: Record<SupportedSource, SourceConfig> = {
  SPOTIFY: {
    id: 'SPOTIFY',
    title: 'Spotify',
    eyebrow: 'Podcasts',
    summary: 'Pick the podcasts you follow on Spotify and import them into Zine.',
    itemNounSingular: 'show',
    itemNounPlural: 'shows',
  },
  YOUTUBE: {
    id: 'YOUTUBE',
    title: 'YouTube',
    eyebrow: 'Videos',
    summary: 'Pick the channels you subscribe to on YouTube and import them into Zine.',
    itemNounSingular: 'channel',
    itemNounPlural: 'channels',
  },
  GMAIL: {
    id: 'GMAIL',
    title: 'Newsletters',
    eyebrow: 'Gmail',
    summary: 'Connect Gmail so Zine can find the newsletters you already receive.',
    itemNounSingular: 'newsletter',
    itemNounPlural: 'newsletters',
  },
  RSS: {
    id: 'RSS',
    title: 'RSS',
    eyebrow: 'Blogs & sites',
    summary: 'Paste the URL of a blog or feed and Zine will discover the feed for you.',
    itemNounSingular: 'feed',
    itemNounPlural: 'feeds',
  },
};

export const supportedSources = Object.keys(sourceConfigs) as SupportedSource[];

export function setOnboardingOAuthContext(context: OnboardingOAuthContext) {
  sessionStorage.setItem(ONBOARDING_OAUTH_CONTEXT_KEY, JSON.stringify(context));
}

export function getOnboardingOAuthContext(): OnboardingOAuthContext | null {
  const stored = sessionStorage.getItem(ONBOARDING_OAUTH_CONTEXT_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<OnboardingOAuthContext>;
    if (
      (parsed.origin === 'welcome' || parsed.origin === 'settings') &&
      (parsed.provider === 'YOUTUBE' ||
        parsed.provider === 'SPOTIFY' ||
        parsed.provider === 'GMAIL')
    ) {
      return { origin: parsed.origin, provider: parsed.provider };
    }
  } catch {
    // Ignore malformed stored state.
  }

  return null;
}

export function clearOnboardingOAuthContext() {
  sessionStorage.removeItem(ONBOARDING_OAUTH_CONTEXT_KEY);
}

export function providerToWizardStep(provider: OAuthProvider): Exclude<WizardStep, 'DONE'> {
  return provider;
}

export function nextWizardStep(current: WizardStep): WizardStep {
  const index = wizardSteps.indexOf(current);
  if (index < 0 || index === wizardSteps.length - 1) {
    return current;
  }
  return wizardSteps[index + 1]!;
}

export function previousWizardStep(current: WizardStep): WizardStep | null {
  const index = wizardSteps.indexOf(current);
  if (index <= 0) {
    return null;
  }
  return wizardSteps[index - 1] ?? null;
}
