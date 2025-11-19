"use client";
import { useEffect, useState } from 'react';

export function useAccessToken(): { token: string | null; ready: boolean } {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const getToken = () => {
      try {
        const stored = localStorage.getItem('accessToken');
        if (stored && stored !== "null" && stored !== "undefined") {
          return stored;
        }
      } catch {
        // ignore
      }
      return null;
    };

    setToken(getToken());
    setReady(true);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'accessToken') {
        const newValue = e.newValue;
        if (newValue && newValue !== "null" && newValue !== "undefined") {
          setToken(newValue);
        } else {
          setToken(null);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return { token, ready };
}


