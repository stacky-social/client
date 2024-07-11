import React from 'react';
import SearchBar from './SearchBar/SearchBar'
import RelatedStacks from './RelatedStacks';

interface SidebarProps {
    relatedStacks: any[];
}

const Sidebar: React.FC<SidebarProps> = ({ relatedStacks }) => {
    return (
        <div style={{ gridColumn: '2 / 3' }}>
            <SearchBar />
            {relatedStacks.length > 0 && (
                <RelatedStacks
                    relatedStacks={relatedStacks}
                    cardWidth={450}
                    cardHeight={200}
                    onStackClick={() => {}}
                    setIsExpandModalOpen={()=>{}}
                    setIsModalOpen={()=>{}}
                />
            )}
        </div>
    );
};

export default Sidebar;
