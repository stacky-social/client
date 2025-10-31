import React from 'react';
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
  IconThumbUp,
  IconThumbDown,
} from '@tabler/icons-react';

interface RelatedStack {
  rel: string;
  stackId: string;
  size: number;
}

interface StackCountProps {
  count: number | null;
  onClick: () => void;
  onStackClick: (index: number) => void;
  relatedStacks: RelatedStack[];
  expanded: boolean;
  cardHeight: number;
}

const ICON_COLOR = '#011445';
const ICON_SIZE = 20;

const iconMapping: Record<string, React.ReactNode> = {
  uncategorized: <IconCards style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  predictions: <IconBulb style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  evidence_public: <IconQuote style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  evidence_personal: <IconUser style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  connections: <IconLink style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  pointers: <IconPointer style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  proposals: <IconBook style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  humor: <IconMoodSmile style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  values: <IconHeart style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  framing: <IconFrame style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  questions: <IconQuestionMark style={{ color: ICON_COLOR }} size={ICON_SIZE} />,
  agree: <IconThumbUp size={ICON_SIZE} />,
  disagree: <IconThumbDown size={ICON_SIZE} />,
};

const getIcon = (rel: string) => iconMapping[rel] ?? <IconStack style={{ color: ICON_COLOR }} size={ICON_SIZE} />;

const styles = {
  paper: {
    position: 'absolute' as const,
    top: '10px',
    right: '0px',
    width: 60,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    cursor: 'pointer',
    transition: 'height 0.3s ease',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 50,
  },
  headerIcon: { color: '#555555' },
  headerText: { color: '#555555' },
  list: (cardHeight: number) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 5,
    width: '100%',
    maxHeight: `${cardHeight * 0.7}px`,
    overflowY: 'auto' as const,
  }),
  item: (cardHeight: number, isFirst: boolean, isHovered: boolean) => ({
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-start' as const,
    gap: 4,
    padding: '2px 6px',
    backgroundColor: isFirst ? '#e3ffe0' : isHovered ? '#f0fff0' : 'transparent',
    borderRadius: 5,
    transition: 'background-color 0.3s ease',
    width: '90%',
    margin: '0 auto',
    maxHeight: `${cardHeight / 5}px`,
    minHeight: 20,
  }),
  itemText: { margin: 0, color: '#555' },
};

const StackCount: React.FC<StackCountProps> = ({
  count,
  onClick,
  onStackClick,
  relatedStacks,
  expanded,
  cardHeight,
}) => {
  // Preserve existing behavior: hide if count is -1
  if (count === -1) return null;

  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  const handlePaperClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };

  return (
    <Paper onClick={handlePaperClick} style={styles.paper} aria-label="Open related stacks">
      <div style={styles.header}>
        <IconStack style={styles.headerIcon} size={24} />
        <Text style={styles.headerText} size="sm">
          {count !== null ? count : <Loader size="xs" />}
        </Text>
      </div>

      <Transition mounted={expanded} transition="slide-down" duration={300} timingFunction="ease">
        {(transitionStyles) => (
          <div style={{ ...transitionStyles, ...styles.list(cardHeight) }}>
            {relatedStacks.map((stack, index) => {
              const isHovered = hoveredIndex === index;
              const isFirst = index === 0;

              return (
                <div
                  key={stack.stackId || index}
                  style={styles.item(cardHeight, isFirst, isHovered)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStackClick(index);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onStackClick(index);
                    }
                  }}
                  aria-label={`Open stack ${stack.rel} (${stack.size})`}
                >
                  {getIcon(stack.rel)}
                  <Text size="xs" style={styles.itemText}>
                    {stack.size}
                  </Text>
                </div>
              );
            })}
          </div>
        )}
      </Transition>
    </Paper>
  );
};

export default React.memo(StackCount);
