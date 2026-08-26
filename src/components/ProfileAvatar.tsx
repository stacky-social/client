"use client";

import { Avatar, type AvatarProps } from '@mantine/core';
import { isDefaultProfileAvatar } from '../utils/profileAvatar.mjs';

type ProfileAvatarProps = Omit<AvatarProps, 'children' | 'src'> & {
  src?: string | null;
};

/** Account avatar that preserves real images and gives missing/demo accounts a
 * recognizable, friendly identity instead of reusing the CrossWeave mark. */
export default function ProfileAvatar({ src, alt, ...props }: ProfileAvatarProps) {
  const usesDefault = isDefaultProfileAvatar(src);

  return (
    <Avatar
      {...props}
      src={usesDefault ? undefined : src}
      alt={alt}
      data-default-profile-avatar={usesDefault ? 'true' : undefined}
    >
      <svg
        aria-hidden="true"
        data-smiley-avatar="true"
        viewBox="0 0 40 40"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <circle cx="20" cy="20" r="18.5" fill="#FFD66B" stroke="#1C2B4A" strokeWidth="1.7" />
        <circle cx="14.1" cy="16.2" r="1.45" fill="#1C2B4A" />
        <circle cx="25.9" cy="16.2" r="1.45" fill="#1C2B4A" />
        <path
          d="M13.6 23.1c1.65 2.35 3.8 3.5 6.4 3.5s4.75-1.15 6.4-3.5"
          fill="none"
          stroke="#1C2B4A"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </Avatar>
  );
}
