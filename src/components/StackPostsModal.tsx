import React from 'react';
import { Modal, ScrollArea, Switch } from '@mantine/core';
import Posts from './Posts/Posts';
import ExpandModal from './ExpandModal';
import { useState } from 'react';


interface StackPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  stackId: string | null;
}
const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/timelines/public';



function StackPostsModal({ isOpen, onClose, apiUrl,stackId}: StackPostsModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const title = showAdvanced ? "Substack" : "Post in Stack";
  

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={title}
      size="80%"
      centered
    >
      <Switch
        label="Switch to see posts in stack/substack"
        checked={showAdvanced}
        onChange={() => setShowAdvanced(!showAdvanced)}
        style={{ marginBottom: 20 }}
      />

  
<ScrollArea style={{ height: 600 }}>
  {
    showAdvanced ?
    (stackId ? <ExpandModal stackId={stackId} /> : null) :  
    <Posts apiUrl={MastodonInstanceUrl} loadStackInfo={false} />
  }
</ScrollArea>
    </Modal>
  );
}


export default StackPostsModal;
