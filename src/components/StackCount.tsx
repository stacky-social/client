import React, { useState, useEffect } from 'react';
import { Paper, Text, Transition, Loader } from '@mantine/core';
import {
  IconStack,
  IconQuestionMark,
  IconBulb,
  IconQuote,
  IconLink,
  IconPointer,
  IconBook,
  IconMoodSmile,
  IconHeart,
  IconFrame,
  IconUser,
  IconCards,
} from '@tabler/icons-react';

interface StackCountProps {
  count: number | null;
  onClick: () => void;
  onStackClick: (index: number) => void;
  relatedStacks: Array<{ rel: string, stackId: string, size: number }>;
  expanded: boolean;
}

const iconMapping: { [key: string]: JSX.Element } = {
  uncategorized: <IconCards size={24} />,
  predictions: <IconBulb size={24} />,
  evidence_public: <IconQuote size={24} />,
  evidence_personal: <IconUser size={24} />,
  connections: <IconLink size={24} />,
  pointers: <IconPointer size={24} />,
  proposals: <IconBook size={24} />,
  humor: <IconMoodSmile size={24} />,
  values: <IconHeart size={24} />,
  framing: <IconFrame size={24} />,
  questions: <IconQuestionMark size={24} />,
  default: <IconStack size={24} />,
};

const StackCount: React.FC<StackCountProps> = ({ count, onClick, onStackClick, relatedStacks, expanded }) => {
  if (count === -1) return null;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(expanded);

  useEffect(() => {
    setIsExpanded(expanded);
  }, [expanded]);

  const handlePaperClick = () => {
    onClick();
    setIsExpanded(true);
  };

  const isTwoColumnLayout = relatedStacks.length >= 5;

  return (
    <Paper
      onClick={handlePaperClick}
      style={{
        position: 'absolute',
        top: '-1px',
        right: '-53px',
        width: '55px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // boxShadow: '3px 0px 10px rgba(0,0,0,0.1)', // 只显示右边和下边的阴影
        cursor: 'pointer',
        transition: 'height 0.3s ease',
        backgroundColor:isExpanded ? '#c6e6e8' : '#fff',
  
        borderTopLeftRadius: '0px', // 左上角不圆角
        borderTopRightRadius: '8px', // 右上角圆角
        borderBottomRightRadius: '8px', // 右下角圆角
        borderBottomLeftRadius: '0px', // 左下角圆角
        borderLeft: '0px solid transparent', // 确保左边没有边框
       
        
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
      {
        isExpanded&&(
            <div style={{
                width: '100%',
                borderBottom: '1px solid #a9a9a9', // 更深的灰色
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', // 更深的阴影效果
                marginBottom: '5px',
              }}></div>
        )
      }
      
    
      <Transition mounted={isExpanded} transition="slide-down" duration={300} timingFunction="ease">
        
        {(styles) => (
          <div style={{ 
            ...styles, 
            display: isTwoColumnLayout ? 'grid' : 'flex', 
            gridTemplateColumns: isTwoColumnLayout ? 'repeat(2, 1fr)' : undefined,
            gridAutoRows: isTwoColumnLayout ? 'auto' : undefined,
            flexDirection: isTwoColumnLayout ? undefined : 'column',
            gap: '5px',
            width: '100%',
          }}>
            
            {relatedStacks.map((stack, index) => (
              <div 
                key={index} 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
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
                  
                {iconMapping[stack.rel] || iconMapping["default"]}
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
