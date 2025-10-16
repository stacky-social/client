"use client";

import { useEffect, useState } from 'react';
import PostPage from './posts/page';
import HashtagsPage from './hashtags/page';
import PeoplePage from './people/page';
import NewsPage from './news/page';
import { DoubleHeader } from "../../../components/DoubleHeader";

export default function Explore() {
  const [activePage, setActivePage] = useState<string>('posts'); // Default to 'posts'

  useEffect(() => {
    const path = window.location.pathname.split('/').pop();
    setActivePage(path || 'posts');
  }, []);

  const renderActivePage = () => {
    switch (activePage) {
      case 'posts':
        return <PostPage />;
      case 'hashtags':
        return <HashtagsPage />;
      case 'people':
        return <PeoplePage />;
      case 'news':
        return <NewsPage />;
      default:
        return <PostPage />;
    }
  };

  return (
      <>
        <DoubleHeader active={activePage} setActive={setActivePage} />
        {renderActivePage()}
      </>
  );
}
