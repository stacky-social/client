"use client";

import { AppShell, Burger, Drawer, Group } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "../../components/NavBar/Navbar";
import StackLogo from "../../utils/StackLogo";
import { HoverTooltip } from "../../components/HoverTooltip";
import { RelatedStacksProvider, useRelatedStacks } from "./related-stacks-context";
import { ResizableDivider } from "./ResizableDivider";
import {
    CENTER_MAX,
    CENTER_MIN,
    DEFAULT_RELATED,
    useResizableColumns,
} from "./useResizableColumns";

const LG_QUERY = "(min-width: 1200px)";

export default function Shell({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
    const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure();
    const [navCollapsed, { toggle: toggleNav }] = useDisclosure(false);

    const isDesktop = useMediaQuery(LG_QUERY) ?? false;

    return (
        <RelatedStacksProvider>
            {isDesktop ? (
                <DesktopShell
                    aside={aside}
                    navCollapsed={navCollapsed}
                    toggleNav={toggleNav}
                    drawerOpened={drawerOpened}
                    closeDrawer={closeDrawer}
                >
                    {children}
                </DesktopShell>
            ) : (
                <MobileShell
                    aside={aside}
                    drawerOpened={drawerOpened}
                    toggleDrawer={toggleDrawer}
                    closeDrawer={closeDrawer}
                    navCollapsed={navCollapsed}
                    toggleNav={toggleNav}
                >
                    {children}
                </MobileShell>
            )}
            <HoverTooltip />
        </RelatedStacksProvider>
    );
}

/* ---------- Mobile / tablet branch: unchanged AppShell behavior ---------- */

function MobileShell({
    children,
    aside,
    drawerOpened,
    toggleDrawer,
    closeDrawer,
    navCollapsed,
    toggleNav,
}: {
    children: React.ReactNode;
    aside: React.ReactNode;
    drawerOpened: boolean;
    toggleDrawer: () => void;
    closeDrawer: () => void;
    navCollapsed: boolean;
    toggleNav: () => void;
}) {
    const { activePostId } = useRelatedStacks();
    const asideRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        asideRef.current?.scrollTo({ top: 0 });
    }, [activePostId]);

    return (
        <>
            <AppShell
                header={{ height: { base: 64, sm: 0 } }}
                navbar={{
                    width: navCollapsed ? 0 : "clamp(200px, 22vw, 300px)",
                    breakpoint: "sm",
                    collapsed: { mobile: !drawerOpened, desktop: navCollapsed },
                }}
                aside={{
                    width: navCollapsed ? "clamp(400px, 32vw, 600px)" : "clamp(360px, 26vw, 520px)",
                    breakpoint: "lg",
                    collapsed: { mobile: true },
                }}
                padding="md"
            >
                <AppShell.Header hiddenFrom="sm" bg="#FCFBF5">
                    <Group h="100%" px="md">
                        <Burger opened={drawerOpened} onClick={toggleDrawer} hiddenFrom="sm" size="sm" />
                        <StackLogo size={30} />
                    </Group>
                </AppShell.Header>
                <AppShell.Navbar
                    p="md"
                    visibleFrom="sm"
                    style={{
                        backgroundColor: "#FCFBF5",
                        overflow: "hidden",
                        opacity: navCollapsed ? 0 : 1,
                        transition: "opacity 200ms ease",
                    }}
                >
                    <Navbar />
                </AppShell.Navbar>
                <AppShell.Aside
                    ref={asideRef}
                    p="md"
                    pt="0"
                    withBorder
                    style={{
                        background: "#FCFBF5",
                        overflowY: "auto",
                        overscrollBehavior: "contain",
                        scrollbarWidth: "none",
                    }}
                >
                    {aside ?? null}
                </AppShell.Aside>
                <Drawer
                    opened={drawerOpened}
                    onClose={closeDrawer}
                    padding="md"
                    size="xs"
                    styles={{
                        content: { backgroundColor: "#FCFBF5" },
                        header: { backgroundColor: "#FCFBF5" },
                    }}
                    lockScroll={false}
                >
                    <Navbar />
                </Drawer>
                <AppShell.Main miw={500}>{children}</AppShell.Main>
            </AppShell>
            <Burger
                opened={!navCollapsed}
                onClick={toggleNav}
                visibleFrom="sm"
                size="sm"
                aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
                style={{
                    position: "fixed",
                    left: navCollapsed ? 16 : "calc(clamp(200px, 22vw, 300px) - 42px)",
                    top: 16,
                    zIndex: 300,
                    transition: "left 200ms ease",
                }}
            />
        </>
    );
}

/* ---------- Desktop branch: custom three-column layout with resizable borders ---------- */

function DesktopShell({
    children,
    aside,
    navCollapsed,
    toggleNav,
    drawerOpened,
    closeDrawer,
}: {
    children: React.ReactNode;
    aside: React.ReactNode;
    navCollapsed: boolean;
    toggleNav: () => void;
    drawerOpened: boolean;
    closeDrawer: () => void;
}) {
    const { widths, setCenterWidth, setRelatedWidth } = useResizableColumns();
    const { activePostId } = useRelatedStacks();

    const asideRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        asideRef.current?.scrollTo({ top: 0 });
    }, [activePostId]);

    const navRef = useRef<HTMLDivElement | null>(null);
    const [navW, setNavW] = useState<number>(260);
    useLayoutEffect(() => {
        const el = navRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.getBoundingClientRect().width;
            if (w > 0) setNavW(w);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const [viewportW, setViewportW] = useState<number>(() =>
        typeof window === "undefined" ? 1440 : window.innerWidth
    );
    useEffect(() => {
        const onResize = () => setViewportW(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const effectiveNavW = navCollapsed ? 0 : navW;
    const effectiveRelatedW = widths.relatedWidth ?? DEFAULT_RELATED;
    const viewportCenterMax = viewportW - 2 * Math.max(effectiveNavW, effectiveRelatedW);
    const defaultCenter = Math.max(
        CENTER_MIN,
        Math.min(900, viewportCenterMax > 0 ? viewportCenterMax : 900)
    );
    const effectiveCenterW = Math.max(
        CENTER_MIN,
        Math.min(
            widths.centerWidth ?? defaultCenter,
            Math.min(CENTER_MAX, viewportCenterMax > 0 ? viewportCenterMax : CENTER_MAX)
        )
    );

    const onBorderB = (delta: number) => {
        setCenterWidth(effectiveCenterW - 2 * delta, viewportCenterMax);
    };
    const onBorderC = (delta: number) => {
        setCenterWidth(effectiveCenterW + 2 * delta, viewportCenterMax);
    };
    const onBorderD = (delta: number) => {
        setRelatedWidth(effectiveRelatedW + delta);
    };

    const resetCenter = () => setCenterWidth(undefined);
    const resetRelated = () => setRelatedWidth(undefined);

    const wrapperStyle = useMemo(
        () =>
            ({
                "--center-w": `${effectiveCenterW}px`,
                "--related-w": `${effectiveRelatedW}px`,
                "--nav-w": `${effectiveNavW}px`,
            }) as React.CSSProperties,
        [effectiveCenterW, effectiveRelatedW, effectiveNavW]
    );

    return (
        <div style={{ ...wrapperStyle, position: "relative", minHeight: "100vh" }}>
            <div
                ref={navRef}
                style={{
                    position: "fixed",
                    top: 0,
                    bottom: 0,
                    left: "calc(50vw - var(--center-w) / 2 - var(--nav-w))",
                    width: "clamp(200px, 22vw, 300px)",
                    backgroundColor: "#FCFBF5",
                    padding: 16,
                    overflow: "hidden",
                    opacity: navCollapsed ? 0 : 1,
                    pointerEvents: navCollapsed ? "none" : "auto",
                    transition: "opacity 200ms ease",
                    zIndex: 100,
                }}
            >
                <Navbar />
            </div>

            <div
                style={{
                    position: "relative",
                    marginLeft: "calc(50vw - var(--center-w) / 2)",
                    width: "var(--center-w)",
                    minWidth: CENTER_MIN,
                    padding: 16,
                    minHeight: "100vh",
                }}
            >
                {children}
            </div>

            <div
                ref={asideRef}
                style={{
                    position: "fixed",
                    top: 0,
                    bottom: 0,
                    left: "calc(50vw + var(--center-w) / 2)",
                    width: "var(--related-w)",
                    backgroundColor: "#FCFBF5",
                    borderLeft: "1px solid rgba(0,0,0,0.08)",
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                    scrollbarWidth: "none",
                    padding: 16,
                    paddingTop: 0,
                    zIndex: 100,
                }}
            >
                {aside ?? null}
            </div>

            <ResizableDivider
                ariaLabel="Resize center column (left edge)"
                onResize={onBorderB}
                onDoubleClick={resetCenter}
                style={{ left: "calc(50vw - var(--center-w) / 2)", position: "fixed" }}
            />

            <ResizableDivider
                ariaLabel="Resize center column (right edge)"
                onResize={onBorderC}
                onDoubleClick={resetCenter}
                style={{ left: "calc(50vw + var(--center-w) / 2)", position: "fixed" }}
            />

            <ResizableDivider
                ariaLabel="Resize related column"
                onResize={onBorderD}
                onDoubleClick={resetRelated}
                style={{ left: "calc(50vw + var(--center-w) / 2 + var(--related-w))", position: "fixed" }}
            />

            <Burger
                opened={!navCollapsed}
                onClick={toggleNav}
                size="sm"
                aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
                style={{
                    position: "fixed",
                    left: navCollapsed
                        ? 16
                        : "calc(50vw - var(--center-w) / 2 - var(--nav-w) + 16px)",
                    top: 16,
                    zIndex: 300,
                    transition: "left 200ms ease",
                }}
            />

            <Drawer
                opened={drawerOpened}
                onClose={closeDrawer}
                padding="md"
                size="xs"
                styles={{
                    content: { backgroundColor: "#FCFBF5" },
                    header: { backgroundColor: "#FCFBF5" },
                }}
                lockScroll={false}
            >
                <Navbar />
            </Drawer>
        </div>
    );
}
