"use client";
import { useState } from 'react';
import {
    IconBellRinging,
    IconHome,
    IconCompass,
    IconGlobe,
    IconAt,
    IconBookmark,
    IconStar,
    IconList,
    IconLogout,
} from '@tabler/icons-react';
import classes from './NavbarSimple.module.css';
import { useRouter } from 'next/navigation'; 

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
    const router = useRouter(); 

    const links = data.map((item) => (
        <a
            className={`${classes.link} ${item.label === active ? classes.activeLink : ''}`}
            key={item.label}
            onClick={(event) => {
                event.preventDefault();
                setActive(item.label);
                router.push(item.link); 
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
