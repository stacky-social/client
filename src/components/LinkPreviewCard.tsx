import React, { useMemo, useState } from 'react';
import { Anchor, Card, Divider, Group, Image, Stack, Text } from '@mantine/core';
import { IconWorld } from '@tabler/icons-react';

export interface LinkPreviewCardProps {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  className?: string;
}

function getOrigin(u: string) {
    try {
      return new URL(u).origin;
    } catch {
      return u;
    }
}

export function LinkPreviewCard({ url, title, description, imageUrl, className }: LinkPreviewCardProps) {
    const [hovered, setHovered] = useState(false);
    const baseUrl = getOrigin(url);

    return (
        <Card
        withBorder
        radius="md"
        padding="sm"
        className={className}
        style={{
            marginTop: '0.5rem',
            marginRight: '0.5rem',
            borderColor: hovered ? '#cfcfcf' : undefined,
            transition: 'border-color 150ms ease',
        }}
        component="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        >
            <Card.Section>
                {imageUrl ? (
                    <Image src={imageUrl} alt={title} h={150}/>
                    ) : null}
            </Card.Section>
            <Stack gap={4} style={{ flex: 1, marginTop: '0.5rem' }}>
                <Text c="#011445" fw={700} size="sm" lineClamp={2}>{title}</Text>
                {description && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                        {description}
                    </Text>
                )}
                <Divider style={{ marginTop: '0.25rem', marginBottom: '0.25rem' }} />
                <Group gap={6} align="center" wrap="nowrap">
                    <IconWorld size={14} style={{ 
                        color: hovered ? "#98a2b3" : '#cfcfcf',
                        transition: 'color 150ms ease' }}/>
                    <Anchor component="span" size="xs" c="blue" underline="hover" style={{ wordBreak: 'break-all' }}>
                        {baseUrl}
                    </Anchor>
                </Group>
            </Stack>
            </Card>
    );
}

export default LinkPreviewCard;
