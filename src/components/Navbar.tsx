"use client"

import { useState } from 'react';
import { Group, Code } from '@mantine/core';
import {
    IconBellRinging,
    IconFingerprint,
    IconKey,
    IconSettings,
    Icon2fa,
    IconDatabaseImport,
    IconReceipt2,
    IconSwitchHorizontal,
    IconLogout, IconHome,
} from '@tabler/icons-react';
import { MantineLogo } from '@mantinex/mantine-logo';
import StackLogo from './StackLogo';
import classes from './NavbarSimple.module.css';

const data = [
    { link: '/home', label: 'Home', icon: IconHome },
    { link: '', label: 'placeholder', icon: IconBellRinging },
    { link: '', label: 'placeholder', icon: IconReceipt2 },
    { link: '', label: 'placeholder', icon: IconFingerprint },
    { link: '', label: 'placeholder', icon: IconKey },
    { link: '', label: 'placeholder', icon: IconDatabaseImport },
    { link: '', label: 'placeholder', icon: Icon2fa },
    { link: '', label: 'placeholder', icon: IconSettings },
];

export function Navbar() {
    const [active, setActive] = useState('Home');

    const links = data.map((item) => (
        <a
            className={classes.link}
            data-active={item.label === active || undefined}
            href={item.link}
            key={item.label}
            onClick={(event) => {
                if (item.label !== 'Home') {
                    event.preventDefault();
                    setActive(item.label);
                } else {
                    setActive(item.label);
                }
            }}
        >
            <item.icon className={classes.linkIcon} stroke={1.5} />
            <span>{item.label}</span>
        </a>
    ));

    return (
        <nav className={classes.navbar}>
            <div className={classes.navbarMain}>
                <Group className={classes.header} justify="space-between">
                    {/* <MantineLogo size={28} /> */}
                    <StackLogo size={28} />
                    <Code fw={700}>v0.0.1</Code>
                </Group>
                {links}
            </div>

            <div className={classes.footer}>
                <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
                    <IconSwitchHorizontal className={classes.linkIcon} stroke={1.5} />
                    <span>Change account</span>
                </a>

                <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
                    <IconLogout className={classes.linkIcon} stroke={1.5} />
                    <span>Logout</span>
                </a>
            </div>
        </nav>
    );
}
