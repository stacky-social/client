// src/app/explore/page.tsx
"use client";
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import PostPage from './posts/page';
import HashtagsPage from './hashtags/page';
import PeoplePage from './people/page';
import NewsPage from './news/page';
import {DoubleHeader} from "../../../components/DoubleHeader";

export default function Explore() {
  const pathname = usePathname();
  const [activePage, setActivePage] = useState<string | null>(null);

  useEffect(() => {
    console.log('Current pathname:', pathname);

    if (pathname.includes('posts')) {
      setActivePage('posts');
    } else if (pathname.includes('hashtags')) {
      setActivePage('hashtags');
    } else if (pathname.includes('people')) {
      setActivePage('people');
    } else if (pathname.includes('news')) {
      setActivePage('news');
    } else {
      setActivePage(null);
    }
  }, [pathname]);

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
        return <div>Select a tab to view content</div>;
    }
  };

  return (
    <>
      <DoubleHeader />
        {renderActivePage()}
    </>


  );
}
