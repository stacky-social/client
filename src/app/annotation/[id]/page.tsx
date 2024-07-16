"use client";
import React, { useState } from 'react';
import { Button, TextInput, Container } from '@mantine/core';
import Posts from '../../../components/Posts/Posts';
import { SubmitPost } from '../../../components/SubmitPost/SubmitPost';
import SearchBar from '../../../components/SearchBar/SearchBar';

export default function Annotation() {
  const [taskId, setTaskId] = useState<string>('');
  const [postIds, setPostIds] = useState<string[]>([]);
  const [currentPostIndex, setCurrentPostIndex] = useState<number>(0);

  const fetchPostIds = async () => {
    
    const fakeData = {
      taskId: taskId,
      postIds: [
        'post1',
        'post2',
        'post3',
        'post4',
        'post5'
      ]
    };
    setPostIds(fakeData.postIds);
  };

  const nextPost = () => {
    setCurrentPostIndex((prevIndex) => (prevIndex + 1) % postIds.length);
  };

  const previousPost = () => {
    setCurrentPostIndex((prevIndex) => (prevIndex - 1 + postIds.length) % postIds.length);
  };

  return (
    <Container>
      <div className="di">
       
      </div>
      {postIds.length > 0 && (
        <div>
          <div>
            <h4>Post ID: {postIds[currentPostIndex]}</h4>
          </div>
          <div>
            <Button onClick={previousPost} style={{ marginRight: '1rem' }}>Previous</Button>
            <Button onClick={nextPost} style={{ marginRight: '1rem' }} >Next</Button>
            <Button> Submit</Button>
          </div>
        </div>


      )}

    </Container>
  );
}
