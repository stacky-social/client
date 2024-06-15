import React from 'react';
import { Paper, Text } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';

interface StackCountProps {
    count: number;
    onClick: () => void; 
}

const StackCount: React.FC<StackCountProps> = ({ count, onClick }) => {
    return (
        <Paper
            onClick={onClick} 
            style={{
                position: 'absolute',
                top: '10px',
                right: '-50px',
                width: '50px',
                height: '50px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                // cursor: 'pointer' 
            }}
            withBorder
        >
            <IconStack size={24} />
            <Text size="sm">{count}</Text>
        </Paper>
    );
};

export default StackCount;
