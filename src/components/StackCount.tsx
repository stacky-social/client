import React, { useState } from 'react';
import { Paper, Text, Transition, Group } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';

interface StackCountProps {
    count: number;
    onClick: () => void; 
    relatedStacks: Array<{ rel: string, stackId: string, size: number }>;
}

const randomEmojis: { [key: string]: string } = {
    "disagree": "❌",
    "prediction": "🔮",
    "funny": "😂",
    "evidence": "📜",
};

const StackCount: React.FC<StackCountProps> = ({ count, onClick, relatedStacks }) => {
    const [expanded, setExpanded] = useState(false);

    const handleExpand = () => {
        setExpanded(!expanded);
        onClick();
    };

    return (
        <Paper
            onClick={handleExpand}
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
            <Transition mounted={expanded} transition="slide-down" duration={300} timingFunction="ease">
                {(styles) => (
                    <div style={{ ...styles, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        {relatedStacks.map((stack, index) => (
                            <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '5px', marginBottom: '5px' }}>
                                <Text style={{ lineHeight: '24px', margin: '0' }}>{randomEmojis[stack.rel] || "📦"}</Text>
                                <Text size="xs" style={{ margin: '0' }}>{stack.size}</Text>
                            </div>
                        ))}
                    </div>
                )}
            </Transition>
        </Paper>
    );
};

export default StackCount;
