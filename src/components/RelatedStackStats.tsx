import React, { useEffect, useState } from 'react';
import { Paper, Text, Group, Stack } from '@mantine/core';
import axios from 'axios';

interface RelatedStack {
  rel: string;
  size: number;
}

interface RelatedStackStatsProps {
  stackId: string;
}

const fakeData = [
  { rel: 'disagree', size: 118 },
  { rel: 'prediction', size: 65 },
  { rel: 'funny', size: 58 },
  { rel: 'evidence', size: 5 },
];

const RelatedStackStats: React.FC<RelatedStackStatsProps> = ({ stackId }) => {
  const [relatedStacks, setRelatedStacks] = useState<RelatedStack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRelatedStacks = async () => {
      // Simulate API call with fake data
      setTimeout(() => {
        setRelatedStacks(fakeData);
        setLoading(false);
      }, 1000); // Simulate network delay
    };

    fetchRelatedStacks();
  }, [stackId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Paper
      style={{
        position: 'absolute',
        top: '10px',
        right: '-50px',
        width: '150px',
        height: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
        padding: '10px',
        backgroundColor: '##FFEC99',
      }}
      withBorder
    >
      <Stack  align="center">
        {relatedStacks.map((stack, index) => (
          <Group key={index}  align="center">
            <Text size="sm">{stack.rel}</Text>
            <Text size="sm">{stack.size}</Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
};

export default RelatedStackStats;
