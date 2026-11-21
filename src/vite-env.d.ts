/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleScriptRunBuilder {
  withSuccessHandler<T = unknown>(callback: (result: T) => void): GoogleScriptRunBuilder;
  withFailureHandler(callback: (error: Error) => void): GoogleScriptRunBuilder;
  [functionName: string]: ((...args: unknown[]) => void) | unknown;
}

declare global {
  interface Window {
    google?: {
      script?: {
        run?: GoogleScriptRunBuilder;
      };
    };
  }
}

export {};
