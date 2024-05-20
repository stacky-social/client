import React from 'react';
import { Group, Avatar, TextInput, Button, ActionIcon } from '@mantine/core';
import {IconCamera, IconGif, IconMessage2, IconMoodSmile, IconMapPin  } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import {  fakeUsers } from '../app/FakeData/FakeUsers';
import FakePosts from '../app/FakeData/FakePosts';



import classes from './SubmitPost.module.css';
import { faker } from '@faker-js/faker';

export function SubmitPost() {
    const iconStyle = { width: 20, height: 20, marginLeft: 7, marginRight: 7 };
    const [currentUser, setCurrentUser] = useState(fakeUsers[0]); // assume the first user is the current user
    const [postText, setPostText] = useState('');
    const [posts, setPosts] = useState(FakePosts);
    const handleSubmit = () => {
        console.log('Submit button clicked');
        const newPost = {
            postId: faker.string.uuid(), // use faker to generate a random UUID
            text: postText,
            author: currentUser.name,
            avatar: currentUser.profilePictureUrl,
            replies: [] // no replies initially
        };
        
        console.log('New post:', newPost);

        setPosts([...posts, newPost]); // add the new post to the list of posts
        setPostText(''); // clear the text area
    };

    return (

        <div className={classes.PostBar}>
            <div className={classes.AvatarArea}>
            <Avatar
                    src={currentUser.profilePictureUrl}
                    radius="xl"
                    size={40}
                />
            </div>

            <div className={classes.inputArea}>
                <div className={classes.textArea}>
                <TextInput
                        placeholder="What's on your mind?"
                        radius="xl"
                        size="xl"
                        value={postText}
                        onChange={(event) => setPostText(event.currentTarget.value)}
                        styles={{ input: { width: '100%' } }}
                    />
                </div>
                <div className={classes.ButtonArea}>
                    <div className="iconlist">
                    <Group>
                    <ActionIcon style={iconStyle}><IconCamera size={20} /></ActionIcon>
                    <ActionIcon style={iconStyle}><IconGif size={20} /></ActionIcon>
                    <ActionIcon style={iconStyle}><IconMessage2 size={20} /></ActionIcon>
                    <ActionIcon style={iconStyle}><IconMoodSmile size={20} /></ActionIcon>
                    <ActionIcon style={iconStyle}><IconMapPin size={20} /></ActionIcon>
                    </Group>
                    </div>
                    <div className="postbutton">
                        <Button className={classes.button} onClick={handleSubmit}>Post</Button>
                    </div>
                </div>
            </div>

        </div>
    );
  }
