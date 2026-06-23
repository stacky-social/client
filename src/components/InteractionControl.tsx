"use client";

import React, { useState, ReactElement } from 'react';
import { ActionIcon, Text } from '@mantine/core';

interface InteractionControlProps {
  icon: React.ReactNode;
  label?: string | number;
  ariaLabel: string;
  onClick: () => void;
  active?: boolean;
}

export default function InteractionControl({ icon, label, ariaLabel, onClick, active = false }: InteractionControlProps) {
  const [hovered, setHovered] = useState(false);

  const baseColor = '#555555';
  const hoverColor = '#3b82f6';

  const isActive = hovered || active;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseUp={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', background: 'none', border: 'none' }}
    >
      <ActionIcon
        variant="subtle"
        radius="xl"
        size={34}
        color={isActive ? hoverColor : baseColor}
        style={{
          backgroundColor: hovered ? 'rgba(75, 116, 220, 0.06)' : 'transparent',
          transition: 'background-color 230ms 60ms ease-in-out, color 230ms 60ms ease-in-out, transform 230ms 60ms ease-in-out',
          pointerEvents: 'none',
        }}
        styles={{
          root: {
            transition: 'background-color 230ms 60ms ease-in-out, color 230ms 60ms ease-in-out, transform 230ms 60ms ease-in-out',
          },
        }}
      >
        {React.isValidElement(icon)
          ? React.cloneElement(icon as ReactElement<any>, {
              color: isActive ? hoverColor : baseColor,
              style: {
                ...(icon.props?.style || {}),
                color: isActive ? hoverColor : baseColor,
                transition: 'color 230ms 60ms ease-in-out',
              },
            })
          : icon}
      </ActionIcon>

      {label !== undefined && (
        <Text
          style={{
            color: isActive ? hoverColor : baseColor,
            transition: 'color 230ms 60ms ease-in-out',
            userSelect: 'none',
          }}
        >
          {label}
        </Text>
      )}
    </div>
  );
}


