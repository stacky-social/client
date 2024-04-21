import React from 'react';
import { Group, Avatar, TextInput, Button, ActionIcon } from '@mantine/core';
import {IconCamera, IconGif, IconMessage2, IconMoodSmile, IconMapPin  } from '@tabler/icons-react';

import classes from './PostBar.module.css';

export function PostBar() {
    const iconStyle = { width: 20, height: 20, marginLeft: 7, marginRight: 7 };
    return (
     
        <div className={classes.PostBar}>
            <div className={classes.AvatarArea}>
                <Avatar
                    src="https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-8.png"
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
                        <Button className={classes.button}>Post</Button>
                    </div>
                </div>
            </div>

        </div>
    );
  }