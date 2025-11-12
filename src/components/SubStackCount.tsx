import React from 'react';
import { Paper, Text } from '@mantine/core';
import { Layers } from 'lucide-react';

interface SubStackCountProps {
  count: number;
  onClick: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

const SubStackCount: React.FC<SubStackCountProps> = ({ count, onClick }) => {
  return (
    <Paper
      onClick={event => {
        event.stopPropagation();
        onClick(event);
      }}
      style={{
        position: 'absolute',
        top: '0px',
        right: '-50px',            // 对齐到 StackCount 的偏移
        width: '60px',             // 同 StackCount 宽度
        display: 'flex',
        paddingBottom: '10px',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'transform 0.3s ease',
        backgroundColor: '#f9f9f9',// 同 StackCount 背景
        border: '1px solid #cbcbcb', // 同 StackCount 边框
        borderRadius: '10px',      // 同 StackCount 圆角
        zIndex: 10,
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50px',            // 同 StackCount 图标区高度
      }}>
        <Layers size={24} style={{ color: '#555555' }} />
        <Text style={{ color: '#555555' }} size="sm">
          {count}
        </Text>
      </div>
    </Paper>
  );
};

export default SubStackCount;
