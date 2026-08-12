"use client";

import { Group, ActionIcon, Tooltip, Box } from "@mantine/core";
import {
    IconHome,
    IconMessages,
    IconSearch,
    IconBookmark,
    IconHeart,
    IconLogout,
} from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";
import CrossweaveLogo from "./CrossweaveLogo";
import { ExperimentPanel } from "./ExperimentPanel";
import { endStudySession, useStudyMode } from "../../utils/studyMode";

/** Height of the sticky top nav bar (used by the shell for sticky offsets). */
export const TOP_NAV_HEIGHT = 56;

const LINKS = [
    { link: "/home", label: "Home", Icon: IconHome },
    { link: "/tag/ChineseEVs", label: "#ChineseEVs", Icon: IconMessages },
    { link: "/search", label: "Search", Icon: IconSearch },
    { link: "/bookmarks", label: "Bookmarks", Icon: IconBookmark },
    { link: "/liked", label: "Liked", Icon: IconHeart },
] as const;

/**
 * Horizontal sticky top nav bar (D-NAV): logo on the left, condensed icon
 * links, and a compact log-out action on the right.
 * Replaces the old left nav column + collapse burger.
 */
export function TopNav() {
    const router = useRouter();
    const pathname = usePathname();
    const studyMode = useStudyMode();

    const handleLogOut = async () => {
        const accessToken =
            typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
        try {
            if (accessToken) {
                await fetch('/api/auth/mastodon/revoke', {
                    method: "POST",
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
            }
        } catch (error) {
            console.error("Failed to log out:", error);
        } finally {
            // Clear the auth/user keys, but keep the intentionally-persistent
            // local demo state (stacky:localStore:v1, stacky:experimentFlags:v1,
            // stacky:feedRatio) — it survives logout by design.
            localStorage.removeItem("accessToken");
            localStorage.removeItem("currentUser");
            localStorage.removeItem("authCode");
            localStorage.removeItem("mastodonInstance");
            // Session-scoped scroll/back-navigation keys shouldn't outlive the
            // login either.
            sessionStorage.clear();
            router.push("/");
        }
    };

    const handleStudyLogOut = () => {
        endStudySession();
        router.push("/");
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
                background: "#ffffff",
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
                                color={active ? "crossweaveTeal" : "gray"}
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

                {!studyMode && <ExperimentPanel />}
                <Tooltip label="Log out" withArrow>
                    <ActionIcon
                        variant="subtle"
                        color="red"
                        size="lg"
                        aria-label="Log out"
                        data-testid="nav-logout"
                        onClick={studyMode ? handleStudyLogOut : handleLogOut}
                    >
                        <IconLogout size={20} stroke={1.8} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        </Box>
    );
}
