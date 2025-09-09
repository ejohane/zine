// Temporary fix for React 19 type compatibility issues with React Native
// This resolves the ReactNode type mismatch between React 19 and React Native

declare module 'react' {
  interface ReactPortal {
    children?: ReactNode;
  }
}