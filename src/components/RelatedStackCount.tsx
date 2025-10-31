import React from 'react';
import { Paper, Text } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';
import { motion } from 'framer-motion';

interface RelatedStackCountProps {
  count: number;
  onClick: () => void;
  topOffset?: number; // px from top inside the card; helps avoid overlap with badges
}

const RelatedStackCount: React.FC<RelatedStackCountProps> = ({ count, onClick, topOffset = 8 }) => {
  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };

  return (
    <Paper
      onClick={handleClick}
      style={{
        position: 'absolute',
        top: `${topOffset}px`,
        right: '6px',
        width: '48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        backgroundColor: 'transparent',
        transition: 'height 0.3s ease',
        border: 'none',
        borderRadius: '8px',
        zIndex: 10,
      }}
    >
      <motion.div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '44px',
        }}
        whileHover={{ scale: 1.06, y: -2 }}
        transition={{ type: 'spring', stiffness: 450, damping: 22, mass: 0.3 }}
      >
        <IconStack size={20} />
        <Text size="xs">{count}</Text>
      </motion.div>
    </Paper>
  );
};

export default RelatedStackCount;
