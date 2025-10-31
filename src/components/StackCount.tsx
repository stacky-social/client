import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paper, Text, Transition, Loader } from '@mantine/core';
import {
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
import { Layers } from 'lucide-react';

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

const getIcon = (rel: string) => iconMapping[rel] ?? <Layers style={{ color: ICON_COLOR }} size={ICON_SIZE} />;

const styles = {
  paper: {
    position: 'absolute' as const,
    top: '10px',
    right: '5px',
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
    width: '100%',
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
    overflowX: 'hidden' as const,
    paddingTop: 4,
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

// Sequential reveal animation for list items (also animate on exit)
const listVariants = {
  hidden: {
    opacity: 1,
    transition: { staggerChildren: 0.06, staggerDirection: -1 },
  },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05, staggerDirection: 1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: -6, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 460, damping: 26, mass: 0.3 },
  },
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
      <motion.div
        style={styles.header}
        whileHover={{ scale: 1.06, y: -2 }}
        transition={{ type: 'spring', stiffness: 450, damping: 22, mass: 0.3 }}
      >
        <Layers style={styles.headerIcon} size={20} />
        <Text style={styles.headerText} size="sm">
          {count !== null ? count : <Loader size="xs" />}
        </Text>
      </motion.div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            style={styles.list(cardHeight)}
            variants={listVariants}
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            {relatedStacks.map((stack, index) => {
              const isHovered = hoveredIndex === index;
              const isFirst = index === 0;

              return (
                <motion.div
                  key={stack.stackId || index}
                  variants={itemVariants}
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
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </Paper>
  );
};

export default React.memo(StackCount);
