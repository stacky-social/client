import React from 'react';
import { Paper, Text } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';

interface SubStackCountProps {
  count: number;
  onClick: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

const SubStackCount: React.FC<SubStackCountProps> = ({ count, onClick }) => {
  return (
    <Paper
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      style={{
        position: 'absolute',
        top: '0px',
        right: '-40px',
        width: '50px',
        display: 'flex',
        backgroundColor: '#f6f3e1',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'transform 0.3s ease',
        zIndex: 10, // Ensure it appears above the card
      }}

    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
      }}>
        <IconStack size={24} />
        <Text size="sm">{count}</Text>
      </div>
    </Paper>
  );
};

export default SubStackCount;
