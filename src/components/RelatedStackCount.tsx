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
        top: '0px',
        right: '-54px',
        width: '55px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        backgroundColor: '#f6f3e1',
        transition: 'height 0.3s ease',
        borderTopLeftRadius: '0px', // 左上角不圆角
        borderTopRightRadius: '8px', // 右上角圆角
        borderBottomRightRadius: '8px', // 右下角圆角
        borderBottomLeftRadius: '0px', // 左下角圆角
      }}
      // withBorder
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
