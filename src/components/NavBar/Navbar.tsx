"use client";
import { useState, useEffect } from 'react';
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
import { useRouter, usePathname } from 'next/navigation';

const data = [
    { link: '/home', label: 'Home', icon: IconHome },
    { link: '/notifications', label: 'Notifications', icon: IconBellRinging },
    { link: '/explore', label: 'Explore', icon: IconCompass },
    { link: '/livefeeds', label: 'Live feeds', icon: IconGlobe },
    { link: '/private-mentions', label: 'Private mentions', icon: IconAt },
    { link: '/bookmarks', label: 'Bookmarks', icon: IconBookmark },
    { link: '/favorites', label: 'Favorites', icon: IconStar },
    { link: '/lists', label: 'Lists', icon: IconList },
];

export function Navbar() {
    const router = useRouter();
    const pathname = usePathname();
    const [active, setActive] = useState('');

    useEffect(() => {
        const currentPath = data.find(item => item.link === pathname);
        if (currentPath) {
            setActive(currentPath.label);
        }
    }, [pathname]);

    const links = data.map((item) => (
        <a
            className={classes.link}
            data-active={item.label === active || undefined}
            href={item.link}
            key={item.label}
            onClick={(e) => {
                e.preventDefault();
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
