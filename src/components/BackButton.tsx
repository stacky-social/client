'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UnstyledButton, Text, Group } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { navigateFromPanelScope } from '../utils/highlightStore';

function labelFromPath(path: string): string | null {
  if (path.startsWith('/tag/')) {
    const tag = decodeURIComponent(path.replace('/tag/', ''));
    return `#${tag}`;
  }
  if (path === '/' || path === '/home') return 'Home';
  if (path.startsWith('/user/')) return 'Profile';
  return null;
}

// 'unchecked' = haven't read sessionStorage yet, 'none' = checked but no previous path
type BackButtonState = 'unchecked' | 'none' | { label: string | null; path: string };

export default function BackButton() {
  const router = useRouter();
  const [state, setState] = useState<BackButtonState>('unchecked');

  useEffect(() => {
    const prev = sessionStorage.getItem(`previousPath:${window.location.pathname}`);
    if (prev) {
      setState({ label: labelFromPath(prev), path: prev });
    } else {
      setState('none');
    }
  }, []);

  // Haven't checked yet or no previous path — don't render
  if (state === 'unchecked' || state === 'none') return null;

  const displayLabel = state.label;
  const previousPath = state.path;

  // The visible in-app Back button is route navigation, not panel undo. Browser
  // Back owns undoing filters/grouping through the popstate sentinel; this button
  // always goes to the recorded previous page and lets navigateFromPanelScope
  // collapse any pending sentinel so it is not left stranded in history.
  const handleBack = () => {
    navigateFromPanelScope(previousPath || '/ChineseEVs', router);
  };

  return (
    <UnstyledButton
      onClick={handleBack}
      style={{ marginBottom: '1rem' }}
    >
      <Group gap={6}>
        <IconArrowLeft size={18} color="#1c2b4a" />
        <Text size="sm" fw={600} c="#1c2b4a">
          {displayLabel ? `Back to ${displayLabel}` : 'Back'}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
