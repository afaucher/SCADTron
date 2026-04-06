import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface ApiKeyContextType {
  apiKey: string | null;
  hasKey: boolean;
  isEnvKey: boolean; // true if key came from build-time env
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | null>(null);

const STORAGE_KEY = 'gemini_api_key';

function getEnvKey(): string | null {
  try {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (key && typeof key === 'string' && key.length > 10 && key !== 'MY_GEMINI_API_KEY') {
      return key;
    }
  } catch {
    // env not available
  }
  return null;
}

function getStoredKey(): string | null {
  try {
    const key = localStorage.getItem(STORAGE_KEY);
    if (key && key.length > 10) return key;
  } catch {
    // localStorage not available
  }
  return null;
}

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [isEnvKey, setIsEnvKey] = useState(false);

  // Resolve key on mount: env > localStorage > null
  useEffect(() => {
    const envKey = getEnvKey();
    if (envKey) {
      setApiKeyState(envKey);
      setIsEnvKey(true);
      return;
    }
    const storedKey = getStoredKey();
    if (storedKey) {
      setApiKeyState(storedKey);
      setIsEnvKey(false);
    }
  }, []);

  const setApiKey = useCallback((key: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // silently fail
    }
    setApiKeyState(key);
    setIsEnvKey(false);
  }, []);

  const clearApiKey = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // silently fail
    }
    // If there's an env key, fall back to it
    const envKey = getEnvKey();
    if (envKey) {
      setApiKeyState(envKey);
      setIsEnvKey(true);
    } else {
      setApiKeyState(null);
      setIsEnvKey(false);
    }
  }, []);

  return (
    <ApiKeyContext.Provider value={{
      apiKey,
      hasKey: apiKey !== null,
      isEnvKey,
      setApiKey,
      clearApiKey,
    }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error('useApiKey must be used within ApiKeyProvider');
  return ctx;
}
