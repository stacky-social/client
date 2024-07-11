import React, { useEffect, useState } from 'react';
import { Modal, ScrollArea, Switch } from '@mantine/core';
import PostList from './PostList';
import ExpandModal from './ExpandModal';
import test from 'node:test';

interface StackPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  stackId: string | null;
}

const testurl='https://beta.stacky.social/api/v1/timelines/public';

function StackPostsModal({ isOpen, onClose, apiUrl, stackId }: StackPostsModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [relatedStacks, setRelatedStacks] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
  }, []);

  const handleStackIconClick = (relatedStacks: any[]) => {
    setRelatedStacks(relatedStacks);
  };

  const title = showAdvanced ? "Substack" : "Post in Stack";

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={title}
      size="100%"
      centered
    >
      <Switch
        label="Switch to see posts in stack/substack"
        checked={showAdvanced}
        onChange={() => setShowAdvanced(!showAdvanced)}
        style={{ marginBottom: 20 }}
      />
      <ScrollArea style={{ height: 600 }}>
        {showAdvanced ? (
          stackId ? <ExpandModal stackId={stackId} /> : null
        ) : (
          <PostList
            apiUrl={testurl}
            handleStackIconClick={handleStackIconClick}
            loadStackInfo={false}
            accessToken={accessToken}
            setIsModalOpen={() => {}}
            setIsExpandModalOpen={() => {}}
          />
        )}
      </ScrollArea>
    </Modal>
  );
}

export default StackPostsModal;
