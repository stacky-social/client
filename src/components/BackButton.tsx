"use client";

import { useRouter } from 'next/navigation';
import { UnstyledButton, Text, Group } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';

export default function BackButton() {
  const router = useRouter();
  return (
    <UnstyledButton onClick={() => router.back()} style={{ marginBottom: '1rem' }}>
      <Group gap={6}>
        <IconArrowLeft size={18} color="#1c2b4a" />
        <Text size="sm" fw={600} c="#1c2b4a">Back</Text>
      </Group>
    </UnstyledButton>
  );
}
