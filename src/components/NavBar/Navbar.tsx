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
    IconSearch
} from '@tabler/icons-react';
import classes from './NavbarSimple.module.css';
import { useRouter, usePathname } from 'next/navigation';
import axios from 'axios';
import {BASE_URL} from "../../utils/DevMode";

const MastodonInstanceUrl = 'https://beta.stacky.social';
const redirectUri = `${BASE_URL}/`;
const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
const clientSecret = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;

const data = [
    { link: '/home', label: 'Home', icon: IconHome },
    { link: '/notifications', label: 'Notifications', icon: IconBellRinging },
    { link: '/explore', label: 'Explore', icon: IconCompass },
    { link: '/livefeeds', label: 'Live feeds', icon: IconGlobe },
    { link: '/mentions', label: 'Private mentions', icon: IconAt },
    { link: '/bookmarks', label: 'Bookmarks', icon: IconBookmark },
    { link: '/favorites', label: 'Favorites', icon: IconStar },
    { link: '/lists', label: 'Lists', icon: IconList },
    {
        link:'/search',label:"Search",icon:IconSearch
    }
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

    const handleLogOut = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }
        try {
            const response = await fetch(`${MastodonInstanceUrl}/oauth/revoke`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  client_id: clientId,
                  client_secret: clientSecret,
                  token: accessToken
                }),
              });
            console.log(response)
            // Clear the access token from localStorage
            localStorage.removeItem('accessToken');

            // Redirect to home page
            router.push('/');
        } catch (error) {
            console.error('Failed to log out:', error);
        }
    };

    return (
        <nav className={classes.navbar}>
            <div className={classes.navbarMain}>
                {links}
            </div>

            <div className={classes.footer}>
                <a href="#" className={classes.link} onClick={handleLogOut}>
                    <IconLogout className={classes.linkIcon} stroke={1.5} />
                    <span>Logout</span>
                </a>
            </div>
        </nav>
    );
}
