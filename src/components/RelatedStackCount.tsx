import React from 'react';
import { Paper, Text } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';

interface RelatedStackCountProps {
  count: number;
  onClick: () => void;
}

const RelatedStackCount: React.FC<RelatedStackCountProps> = ({ count, onClick }) => {
  return (
    <Paper
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '10px',
        right: '-50px',
        width: '50px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'height 0.3s ease',
      }}
      withBorder
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50px',
      }}>
        <IconStack size={24} />
        <Text size="sm">{count}</Text>
      </div>
    </Paper>
  );
};

export default RelatedStackCount;
