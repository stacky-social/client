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
  cardHeight: number;
}

const iconMapping: { [key: string]: JSX.Element } = {
  uncategorized: <IconCards  style={{ color: '#011445' }} size={20} />,
  predictions: <IconBulb  style={{ color: '#011445' }} size={20} />,
  evidence_public: <IconQuote  style={{ color: '#011445' }} size={20} />,
  evidence_personal: <IconUser  style={{ color: '#011445' }} size={20} />,
  connections: <IconLink  style={{ color: '#011445' }} size={20} />,
  pointers: <IconPointer style={{ color: '#011445' }} size={20} />,
  proposals: <IconBook  style={{ color: '#011445' }} size={20} />,
  humor: <IconMoodSmile   style={{ color: '#011445' }} size={20} />,
  values: <IconHeart  style={{ color: '#011445' }} size={20} />,
  framing: <IconFrame  style={{ color: '#011445' }} size={20} />,
  questions: <IconQuestionMark  style={{ color: '#011445' }} size={20} />,
  default: <IconStack  style={{ color: '#011445' }} size={20} />,
};

const StackCount: React.FC<StackCountProps> = ({ count, onClick, onStackClick, relatedStacks, expanded, cardHeight}) => {
  console.log("StackCount loaded with count:", count); 
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

  const isTwoColumnLayout = relatedStacks.length >= 4;

  return (
    <Paper
      onClick={handlePaperClick}
      style={{
        position: 'absolute',
        top: '-0px',
        right: '-55px',
        width: '55px',
        display: 'flex',
        paddingBottom:'10px',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // boxShadow: '3px 0px 10px rgba(0,0,0,0.1)', // 只显示右边和下边的阴影
        cursor: 'pointer',
        transition: 'height 0.3s ease',
        backgroundColor:isExpanded ? '#f6f3e1' : '#f6f3e1',
  
        borderTopLeftRadius: '0px', // 左上角不圆角
        borderTopRightRadius: '8px', // 右上角圆角
        borderBottomRightRadius: '8px', // 右下角圆角
        borderBottomLeftRadius: '0px', // 左下角圆角
        borderLeft: '0px solid transparent', // 确保左边没有边框
       
        
      }}
   
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50px',
      }}>
        <IconStack 
        style={{ color: '#011445' }}
        size={24} />
        <Text style={{ color: '#011445' }} size="sm">
          {count !== null ? count : <Loader size="xs" />}
        </Text>
      </div>
  
    
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
            maxHeight: `${cardHeight*0.7}px`,
            overflowY: 'auto',
          
          }}>
            
            {relatedStacks.map((stack, index) => (
              <div 
                key={index} 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  // backgroundColor: hoveredIndex === index ? '#FF5F00' : '#FF9F66',
                  transition: 'background-color 0.3s ease',
                  width: '100%',
                  maxHeight: `${cardHeight/5}px`,
                  minHeight: `20px`,
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
