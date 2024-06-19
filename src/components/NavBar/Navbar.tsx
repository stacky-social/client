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
    IconLogout,
    IconHome,
    IconGlobe,
    IconBookmark,
    IconStar,
    IconList,
    IconAt,
    IconCompass,
  } from '@tabler/icons-react';
import { MantineLogo } from '@mantinex/mantine-logo';
import StackLogo from '../../utils/StackLogo';
import classes from './NavbarSimple.module.css';

const data = [
    { link: '/home', label: 'Home', icon: IconHome },
    { link: '/notifications', label: 'Notifications', icon: IconBellRinging },
    { link: '/explore', label: 'Explore', icon: IconCompass },
    { link: '/live-feeds', label: 'Live feeds', icon: IconGlobe },
    { link: '/private-mentions', label: 'Private mentions', icon: IconAt },
    { link: '/bookmarks', label: 'Bookmarks', icon: IconBookmark },
    { link: '/favorites', label: 'Favorites', icon: IconStar },
    { link: '/lists', label: 'Lists', icon: IconList },
  ];

export function Navbar() {
    const [active, setActive] = useState('Home');

    const links = data.map((item) => (
        <a
          className={`${classes.link} ${item.label === active ? classes.activeLink : ''}`}
          href={item.link}
          key={item.label}
          onClick={(event) => {
            event.preventDefault();
            setActive(item.label);
          }}
        >
          <item.icon className={classes.linkIcon} stroke={1.5} />
          <span>{item.label}</span>
        </a>
      ));

      return (
        <nav className={classes.navbar}>
            <div className={classes.navbarMain}>
                {links}
            </div>

            <div className={classes.footer}>
                <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
                    <IconLogout className={classes.linkIcon} stroke={1.5} />
                    <span>Logout</span>
                </a>
            </div>
        </nav>
      );
    }
