// Temporary fix for React 19 type compatibility issues with React Native
// This resolves the ReactNode type mismatch between React 19 and React Native

import * as React from 'react';

declare module 'react' {
  interface ReactPortal {
    children?: ReactNode;
  }
  
  export function useState<S>(
    initialState: S | (() => S)
  ): [S, React.Dispatch<React.SetStateAction<S>>];
  
  export function useEffect(
    effect: React.EffectCallback,
    deps?: React.DependencyList
  ): void;
  
  export function useCallback<T extends (...args: any[]) => any>(
    callback: T,
    deps: React.DependencyList
  ): T;
  
  export function useMemo<T>(
    factory: () => T,
    deps: React.DependencyList | undefined
  ): T;
  
  export function useRef<T>(initialValue: T): React.MutableRefObject<T>;
}