// src/app/explore/layout.tsx
"use client";
import { ReactNode } from 'react';
import { Shell } from '../../../components/Shell';
import { DoubleHeader } from '../../../components/DoubleHeader';

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <Shell>
      <DoubleHeader />
      {children}
    </Shell>
  );
}
