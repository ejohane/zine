import { createContext, useContext } from 'react';

interface AuthResumeGateValue {
  ensureFreshAuthToken: () => Promise<boolean>;
}

export const AuthResumeGateContext = createContext<AuthResumeGateValue>({
  ensureFreshAuthToken: async () => true,
});

export function useAuthResumeGate() {
  return useContext(AuthResumeGateContext);
}
