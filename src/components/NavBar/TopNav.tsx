"use client";

import { Group, ActionIcon, Tooltip, Box } from "@mantine/core";
import {
    IconHome,
    IconSearch,
    IconBookmark,
    IconHeart,
    IconLogout,
} from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";
import CrossweaveLogo from "./CrossweaveLogo";
import { ExperimentPanel } from "./ExperimentPanel";

const MastodonInstanceUrl = "https://beta.stacky.social";
const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
const clientSecret = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;

/** Height of the sticky top nav bar (used by the shell for sticky offsets). */
export const TOP_NAV_HEIGHT = 56;

const LINKS = [
    { link: "/home", label: "Home", Icon: IconHome },
    { link: "/search", label: "Search", Icon: IconSearch },
    { link: "/bookmarks", label: "Bookmarks", Icon: IconBookmark },
    { link: "/liked", label: "Liked", Icon: IconHeart },
] as const;

/**
 * Horizontal sticky top nav bar (D-NAV): logo on the left, condensed icon
 * links, and a Logout button on the right.
 * Replaces the old left nav column + collapse burger.
 */
export function TopNav() {
    const router = useRouter();
    const pathname = usePathname();

    const handleLogOut = async () => {
        const accessToken =
            typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
        if (!accessToken) {
            router.push("/");
            return;
        }
        try {
            await fetch(`${MastodonInstanceUrl}/oauth/revoke`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: clientId,
                    client_secret: clientSecret,
                    token: accessToken,
                }),
            });
        } catch (error) {
            console.error("Failed to log out:", error);
        } finally {
            localStorage.removeItem("accessToken");
            router.push("/");
        }
    };

    return (
        <Box
            component="nav"
            data-testid="top-nav"
            style={{
                position: "sticky",
                top: 0,
                zIndex: 200,
                height: TOP_NAV_HEIGHT,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 16px",
                background: "#FCFBF5",
                borderBottom: "1px solid rgba(0,0,0,0.08)",
            }}
        >
            <button
                onClick={() => router.push("/home")}
                aria-label="Home"
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 0,
                }}
            >
                <CrossweaveLogo height={28} />
            </button>

            <Group gap={4} style={{ marginLeft: "auto" }}>
                {LINKS.map(({ link, label, Icon }) => {
                    const active = pathname === link;
                    return (
                        <Tooltip key={link} label={label} withArrow>
                            <ActionIcon
                                variant={active ? "light" : "subtle"}
                                color={active ? "blue" : "gray"}
                                size="lg"
                                aria-label={label}
                                data-active={active || undefined}
                                onClick={() => router.push(link)}
                            >
                                <Icon size={20} stroke={1.8} />
                            </ActionIcon>
                        </Tooltip>
                    );
                })}

                <ExperimentPanel />

                <Tooltip label="Logout" withArrow>
                    <ActionIcon
                        variant="subtle"
                        color="red"
                        size="lg"
                        aria-label="Logout"
                        data-testid="nav-logout"
                        onClick={handleLogOut}
                    >
                        <IconLogout size={20} stroke={1.8} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        </Box>
    );
}
