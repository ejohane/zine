// @ts-nocheck
import * as React from 'react';
import { useAuth } from './auth';
import { initializeApiClient } from '../lib/api';

const { useEffect, ReactNode } = React;

export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    // Initialize the API client with the auth getToken function
    initializeApiClient(getToken);
  }, [getToken]);

  return <>{children}</>;
}