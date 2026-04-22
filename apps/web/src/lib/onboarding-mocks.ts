import { ONBOARDING_MOCK_MODE } from './env';

export type MockOnboardingScenario =
  | 'youtube-connect'
  | 'youtube-empty'
  | 'youtube-populated'
  | 'spotify-populated'
  | 'gmail-scan'
  | 'gmail-populated'
  | 'rss-populated'
  | 'intro-connected';

export type MockConnectionsData = {
  YOUTUBE: { provider: 'YOUTUBE'; status: 'ACTIVE'; connectedAt: number } | null;
  SPOTIFY: { provider: 'SPOTIFY'; status: 'ACTIVE'; connectedAt: number } | null;
  GMAIL: { provider: 'GMAIL'; status: 'ACTIVE'; connectedAt: number } | null;
};

export type MockDiscoverItem = {
  id: string;
  name: string;
};

export type MockNewsletterItem = {
  id: string;
  displayName: string;
  fromAddress: string | null;
  status?: string;
};

export type MockRssCandidate = {
  feedUrl: string;
  title: string;
  description?: string;
};

export type MockOnboardingState = {
  scenario: MockOnboardingScenario;
  connections: MockConnectionsData;
  available: {
    YOUTUBE: MockDiscoverItem[];
    SPOTIFY: MockDiscoverItem[];
  };
  newsletters: MockNewsletterItem[];
  rssCandidates: MockRssCandidate[];
  activeStep: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL' | 'RSS' | null;
};

const MOCK_SCENARIOS = [
  'youtube-connect',
  'youtube-empty',
  'youtube-populated',
  'spotify-populated',
  'gmail-scan',
  'gmail-populated',
  'rss-populated',
  'intro-connected',
] as const satisfies readonly MockOnboardingScenario[];

const MOCK_CONNECTED_AT = Date.UTC(2026, 3, 22, 0, 0, 0);

const DEFAULT_YOUTUBE_CHANNELS: MockDiscoverItem[] = [
  { id: 'youtube-1', name: 'Wendover Productions' },
  { id: 'youtube-2', name: 'Veritasium' },
  { id: 'youtube-3', name: 'MKBHD' },
  { id: 'youtube-4', name: 'ColdFusion' },
];

const DEFAULT_SPOTIFY_SHOWS: MockDiscoverItem[] = [
  { id: 'spotify-1', name: 'Sharp Tech' },
  { id: 'spotify-2', name: 'Studio Notes' },
  { id: 'spotify-3', name: 'The Vergecast' },
];

const DEFAULT_NEWSLETTERS: MockNewsletterItem[] = [
  {
    id: 'gmail-1',
    displayName: 'Stratechery',
    fromAddress: 'ben@stratechery.com',
    status: 'ACTIVE',
  },
  {
    id: 'gmail-2',
    displayName: 'Morning Brew',
    fromAddress: 'crew@morningbrew.com',
    status: 'ACTIVE',
  },
  {
    id: 'gmail-3',
    displayName: 'Dense Discovery',
    fromAddress: 'hello@densediscovery.com',
    status: 'ACTIVE',
  },
];

function createActiveConnection<TProvider extends 'YOUTUBE' | 'SPOTIFY' | 'GMAIL'>(
  provider: TProvider
) {
  return {
    provider,
    status: 'ACTIVE' as const,
    connectedAt: MOCK_CONNECTED_AT,
  };
}

const MOCK_SCENARIO_STATE: Record<MockOnboardingScenario, MockOnboardingState> = {
  'youtube-connect': {
    scenario: 'youtube-connect',
    connections: {
      YOUTUBE: null,
      SPOTIFY: null,
      GMAIL: null,
    },
    available: {
      YOUTUBE: DEFAULT_YOUTUBE_CHANNELS,
      SPOTIFY: [],
    },
    newsletters: [],
    rssCandidates: [],
    activeStep: 'YOUTUBE',
  },
  'youtube-empty': {
    scenario: 'youtube-empty',
    connections: {
      YOUTUBE: createActiveConnection('YOUTUBE'),
      SPOTIFY: null,
      GMAIL: null,
    },
    available: {
      YOUTUBE: [],
      SPOTIFY: [],
    },
    newsletters: [],
    rssCandidates: [],
    activeStep: 'YOUTUBE',
  },
  'youtube-populated': {
    scenario: 'youtube-populated',
    connections: {
      YOUTUBE: createActiveConnection('YOUTUBE'),
      SPOTIFY: null,
      GMAIL: null,
    },
    available: {
      YOUTUBE: DEFAULT_YOUTUBE_CHANNELS,
      SPOTIFY: [],
    },
    newsletters: [],
    rssCandidates: [],
    activeStep: 'YOUTUBE',
  },
  'spotify-populated': {
    scenario: 'spotify-populated',
    connections: {
      YOUTUBE: null,
      SPOTIFY: createActiveConnection('SPOTIFY'),
      GMAIL: null,
    },
    available: {
      YOUTUBE: [],
      SPOTIFY: DEFAULT_SPOTIFY_SHOWS,
    },
    newsletters: [],
    rssCandidates: [],
    activeStep: 'SPOTIFY',
  },
  'gmail-scan': {
    scenario: 'gmail-scan',
    connections: {
      YOUTUBE: null,
      SPOTIFY: null,
      GMAIL: createActiveConnection('GMAIL'),
    },
    available: {
      YOUTUBE: [],
      SPOTIFY: [],
    },
    newsletters: [],
    rssCandidates: [],
    activeStep: 'GMAIL',
  },
  'gmail-populated': {
    scenario: 'gmail-populated',
    connections: {
      YOUTUBE: null,
      SPOTIFY: null,
      GMAIL: createActiveConnection('GMAIL'),
    },
    available: {
      YOUTUBE: [],
      SPOTIFY: [],
    },
    newsletters: DEFAULT_NEWSLETTERS,
    rssCandidates: [],
    activeStep: 'GMAIL',
  },
  'rss-populated': {
    scenario: 'rss-populated',
    connections: {
      YOUTUBE: null,
      SPOTIFY: null,
      GMAIL: null,
    },
    available: {
      YOUTUBE: [],
      SPOTIFY: [],
    },
    newsletters: [],
    rssCandidates: [
      {
        feedUrl: 'https://feeds.example/rss.xml',
        title: 'Feeds Weekly',
        description: 'Editorial picks and product notes.',
      },
      {
        feedUrl: 'https://feeds.example/design.xml',
        title: 'Design Dispatch',
        description: 'Visual systems and interface writing.',
      },
    ],
    activeStep: 'RSS',
  },
  'intro-connected': {
    scenario: 'intro-connected',
    connections: {
      YOUTUBE: createActiveConnection('YOUTUBE'),
      SPOTIFY: createActiveConnection('SPOTIFY'),
      GMAIL: createActiveConnection('GMAIL'),
    },
    available: {
      YOUTUBE: DEFAULT_YOUTUBE_CHANNELS,
      SPOTIFY: DEFAULT_SPOTIFY_SHOWS,
    },
    newsletters: DEFAULT_NEWSLETTERS,
    rssCandidates: [],
    activeStep: null,
  },
};

function isMockOnboardingScenario(value: string): value is MockOnboardingScenario {
  return (MOCK_SCENARIOS as readonly string[]).includes(value);
}

export function resolveMockOnboardingScenario(searchParams: URLSearchParams) {
  if (!import.meta.env.DEV) {
    return null;
  }

  const requestedScenario =
    searchParams.get('mockOnboarding')?.trim().toLowerCase() || ONBOARDING_MOCK_MODE;

  if (!requestedScenario || !isMockOnboardingScenario(requestedScenario)) {
    return null;
  }

  return requestedScenario;
}

export function createMockOnboardingState(scenario: MockOnboardingScenario): MockOnboardingState {
  return JSON.parse(JSON.stringify(MOCK_SCENARIO_STATE[scenario])) as MockOnboardingState;
}

export function connectMockProvider(
  state: MockOnboardingState,
  provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL'
) {
  const connections = {
    ...state.connections,
    [provider]: createActiveConnection(provider),
  };

  if (provider === 'YOUTUBE') {
    return {
      ...state,
      connections,
      available: {
        ...state.available,
        YOUTUBE:
          state.available.YOUTUBE.length > 0 ? state.available.YOUTUBE : DEFAULT_YOUTUBE_CHANNELS,
      },
    };
  }

  if (provider === 'SPOTIFY') {
    return {
      ...state,
      connections,
      available: {
        ...state.available,
        SPOTIFY:
          state.available.SPOTIFY.length > 0 ? state.available.SPOTIFY : DEFAULT_SPOTIFY_SHOWS,
      },
    };
  }

  return {
    ...state,
    connections,
  };
}

export function scanMockNewsletters(state: MockOnboardingState) {
  return {
    ...state,
    newsletters: DEFAULT_NEWSLETTERS,
  };
}

export function discoverMockFeeds(state: MockOnboardingState, inputUrl: string) {
  let host = 'feeds.example';

  try {
    host = new URL(inputUrl).hostname || host;
  } catch {
    // Keep the fallback host for partial or invalid draft input.
  }

  const titlePrefix = host.replace(/^www\./, '');

  return {
    ...state,
    rssCandidates: [
      {
        feedUrl: `https://${host}/rss.xml`,
        title: `${titlePrefix} Updates`,
        description: 'Latest posts from the primary site feed.',
      },
      {
        feedUrl: `https://${host}/podcast.xml`,
        title: `${titlePrefix} Podcast`,
        description: 'Audio episodes and show notes.',
      },
    ],
  };
}
