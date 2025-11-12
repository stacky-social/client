"use client";
import { useEffect, useState } from 'react';

export function useAccessToken(): { token: string | null; ready: boolean } {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('accessToken');
      setToken(stored);
    } catch {
      // ignore
    } finally {
      setReady(true);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'accessToken') {
        setToken(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return { token, ready };
}


