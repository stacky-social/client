import React, { useState, useEffect } from 'react';
import { Paper, Text, Transition,Loader } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';
import { randomEmojis } from '../utils/emojiMapping';

interface StackCountProps {
    count: number|null;
    onClick: () => void; 
    onStackClick: (index: number) => void; 
    relatedStacks: Array<{ rel: string, stackId: string, size: number }>;
    expanded: boolean;
}

const StackCount: React.FC<StackCountProps> = ({ count, onClick, onStackClick, relatedStacks, expanded }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [isExpanded, setIsExpanded] = useState(expanded);

    useEffect(() => {
        setIsExpanded(expanded);
    }, [expanded]);

    const handlePaperClick = () => {
        onClick();
        setIsExpanded(true);
    };

    return (
        <Paper
            onClick={handlePaperClick}
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
                <Text size="sm">
                    {count !== null ? count : <Loader size="xs" />}
                </Text>
            </div>
            <Transition mounted={isExpanded} transition="slide-down" duration={300} timingFunction="ease">
                {(styles) => (
                    <div style={{ ...styles, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        {relatedStacks.map((stack, index) => (
                            <div 
                                key={index} 
                                style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center', 
                                    marginTop: '5px', 
                                    marginBottom: '5px', 
                                    backgroundColor: hoveredIndex === index ? 'rgba(0, 0, 0, 0.1)' : 'transparent',
                                    transition: 'background-color 0.3s ease',
                                    width: '100%' 
                                }}
                                onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStackClick(index);
                                    setIsExpanded(true);
                                }}
                            >
                                <Text style={{ lineHeight: '24px', margin: '0' }}>{randomEmojis[stack.rel] || randomEmojis["default"]}</Text>
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
