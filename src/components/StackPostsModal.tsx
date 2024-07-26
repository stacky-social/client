import React, { useEffect, useState } from 'react';
import { Modal, ScrollArea, Switch } from '@mantine/core';
import PostList from './PostList';
import ExpandModal from './ExpandModal';
import test from 'node:test';
import { Tabs, rem } from '@mantine/core';
import { IconPhoto, IconMessageCircle, IconSettings } from '@tabler/icons-react';

interface StackPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  stackId: string | null;
}


function StackPostsModal({ isOpen, onClose, apiUrl, stackId }: StackPostsModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [relatedStacks, setRelatedStacks] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<string | null>('first');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
  }, []);

  const handleStackIconClick = (relatedStacks: any[]) => {
    setRelatedStacks(relatedStacks);
  };

  const title = "";

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={title}
      size="100%"
      centered
    >
          <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="first">First tab
        </Tabs.Tab>
        <Tabs.Tab value="second">Second tab</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="first">First panel
      <ScrollArea style={{ height: 600 }}>
        {showAdvanced ? (
          stackId ? <ExpandModal stackId={stackId} /> : null
        ) : (
          <PostList
            apiUrl={apiUrl}
            handleStackIconClick={handleStackIconClick}
            loadStackInfo={false}
            accessToken={accessToken}
            setIsModalOpen={() => {}}
            setIsExpandModalOpen={() => {}}
          />
        )}
      </ScrollArea>
      </Tabs.Panel>
      <Tabs.Panel value="second">Second panel</Tabs.Panel>
    </Tabs>
      {/* <Switch
        label="Switch to see posts in stack/substack"
        checked={showAdvanced}
        onChange={() => setShowAdvanced(!showAdvanced)}
        style={{ marginBottom: 20 }}
      /> */}
    </Modal>
  );
}

export default StackPostsModal;
