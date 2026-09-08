"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { HoverTooltip } from "../../components/HoverTooltip";
import { TopNav, TOP_NAV_HEIGHT } from "../../components/NavBar/TopNav";
import { RelatedStacksProvider } from "./related-stacks-context";
import { ResizableDivider } from "./ResizableDivider";
import { FEED_RATIO_MAX, FEED_RATIO_MIN, useFeedRatio } from "./useFeedRatio";
import WeaveBridge, { type WeaveBridgeVariant } from "../../components/WeaveBridge";

/**
 * Max width of the centered (feed + related) group on wide screens — ~13in,
 * sized for comfortable eyes-only reading without head rotation (R-RESIZE-6).
 * CSS physical `in` is unreliable across displays, so this approximates it in px.
 */
const MAX_CONTENT_WIDTH = 1280;
const SLIDER_W = 8;
// Both bridge treatments share the tighter spacing introduced by the open
// design; the toggle changes the connector treatment, not pane layout.
const WEAVE_RUNWAY = 48;
const PANE_GUTTER = 8;
const FEED_WEAVE_INSET = WEAVE_RUNWAY - PANE_GUTTER - (SLIDER_W / 2);
const BRIDGE_EXIT_GRACE_MS = 240;
const OPEN_BRIDGE_SUSPEND_SPEED_PX_PER_SECOND = 2000;
const OPEN_BRIDGE_SCROLL_SETTLE_MS = 150;
const BRIDGE_VARIANT_STORAGE_KEY = "stacky:weave-bridge-variant";
type FocusConnectionVariant = WeaveBridgeVariant | "border";
const BRIDGE_VARIANT_CYCLE: FocusConnectionVariant[] = ["open", "classic", "border"];

const BRIDGE_VARIANT_LABEL: Record<FocusConnectionVariant, string> = {
    open: "Open bridge design",
    classic: "Classic bridge design",
    border: "Border-only focus design",
};

export default function Shell({
    children,
    aside,
}: {
    children: React.ReactNode;
    aside: React.ReactNode;
}) {
    const { ratio, setRatio, reset } = useFeedRatio();
    const isNarrowViewport = useMediaQuery("(max-width: 48rem)", false);
    const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)", false);
    const [bridgeVariant, setBridgeVariant] = useState<FocusConnectionVariant>("open");
    const [openBridgeSuspended, setOpenBridgeSuspended] = useState(false);
    const openBridgeSuspendedRef = useRef(false);
    // Border-only mode draws no bridge. Retain the last drawn variant so the
    // bridge does not switch visual treatments during the single render before
    // its disabled-state effect removes the SVG.
    const lastDrawnBridgeVariant = useRef<WeaveBridgeVariant>("open");
    if (bridgeVariant !== "border") lastDrawnBridgeVariant.current = bridgeVariant;

    const groupRef = useRef<HTMLDivElement | null>(null);
    const feedRef = useRef<HTMLDivElement | null>(null);
    // Live width of the group minus the fixed divider and breathing room, so
    // pixel drag-deltas map to the two panes' actual available width.
    const groupInnerRef = useRef<number>(1);
    const asideRef = useRef<HTMLDivElement | null>(null);
    const [hasAside, setHasAside] = useState(false);
    const wantsAside = hasAside && !isNarrowViewport;
    const [showAside, setShowAside] = useState(false);

    useEffect(() => {
        const saved = window.localStorage.getItem(BRIDGE_VARIANT_STORAGE_KEY);
        if (saved === "classic" || saved === "open" || saved === "border") {
            setBridgeVariant(saved);
        }
    }, []);

    useEffect(() => {
        const toggleBridgeVariant = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented
                || event.repeat
                || event.key.toLowerCase() !== "b"
                || !event.shiftKey
                || event.altKey
                || event.ctrlKey
                || event.metaKey
            ) return;

            const target = event.target;
            if (
                target instanceof HTMLElement
                && (target.isContentEditable || !!target.closest("input, textarea, select, [contenteditable='true']"))
            ) return;

            event.preventDefault();
            setBridgeVariant((current) => {
                const currentIndex = BRIDGE_VARIANT_CYCLE.indexOf(current);
                const next = BRIDGE_VARIANT_CYCLE[(currentIndex + 1) % BRIDGE_VARIANT_CYCLE.length];
                window.localStorage.setItem(BRIDGE_VARIANT_STORAGE_KEY, next);
                return next;
            });
        };

        window.addEventListener("keydown", toggleBridgeVariant);
        return () => window.removeEventListener("keydown", toggleBridgeVariant);
    }, []);

    // The open bridge is meant for close reading. During a fast document
    // scroll, temporarily return to the ordinary bordered focus card instead
    // of asking fixed SVG geometry to compete with rapidly moving content.
    // Slow reading adjustments stay connected; once a fast scroll settles,
    // enabling the bridge again reuses its normal opening animation.
    useEffect(() => {
        let settleTimer = 0;
        let lastY = window.scrollY;
        let lastAt = performance.now();

        const setSuspended = (suspended: boolean) => {
            if (openBridgeSuspendedRef.current === suspended) return;
            openBridgeSuspendedRef.current = suspended;
            setOpenBridgeSuspended(suspended);
        };

        if (bridgeVariant !== "open" || !showAside) {
            setSuspended(false);
            return;
        }

        const onScroll = () => {
            const now = performance.now();
            const distance = Math.abs(window.scrollY - lastY);
            // Cap long idle gaps so the first large scroll gesture is measured
            // as motion rather than diluted by all the time spent stationary.
            const elapsedMs = Math.min(50, Math.max(8, now - lastAt));
            const speed = distance / (elapsedMs / 1000);
            lastY = window.scrollY;
            lastAt = now;

            if (speed >= OPEN_BRIDGE_SUSPEND_SPEED_PX_PER_SECOND) {
                setSuspended(true);
            }
            if (!openBridgeSuspendedRef.current) return;

            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(
                () => setSuspended(false),
                OPEN_BRIDGE_SCROLL_SETTLE_MS,
            );
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.clearTimeout(settleTimer);
            setSuspended(false);
        };
    }, [bridgeVariant, showAside]);

    // Keep the split geometry alive just long enough for the bridge to unweave.
    // Narrow and reduced-motion transitions collapse immediately.
    useEffect(() => {
        if (wantsAside) {
            setShowAside(true);
            return;
        }
        if (isNarrowViewport || reduceMotion) {
            setShowAside(false);
            return;
        }
        const timer = window.setTimeout(() => setShowAside(false), BRIDGE_EXIT_GRACE_MS);
        return () => window.clearTimeout(timer);
    }, [isNarrowViewport, reduceMotion, wantsAside]);

    // Measure the content group for the slider's px → ratio conversion.
    useEffect(() => {
        const el = groupRef.current;
        if (!el) return;
        const measure = () => {
            groupInnerRef.current = Math.max(1, el.clientWidth - SLIDER_W - (PANE_GUTTER * 2));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Detect whether the aside slot actually renders content. The parallel
    // route returns null when no post is focused (home/search/etc.); in that
    // case we collapse to a single centered column.
    useLayoutEffect(() => {
        const el = asideRef.current;
        if (!el) return;
        const update = () => setHasAside(el.childElementCount > 0);
        update();
        const mo = new MutationObserver(update);
        mo.observe(el, { childList: true });
        return () => mo.disconnect();
    }, []);

    useEffect(() => {
        if (!showAside) return;
        const routeRightGutterWheel = (event: WheelEvent) => {
            const aside = asideRef.current;
            if (!aside || event.defaultPrevented || event.clientY < TOP_NAV_HEIGHT) return;

            const rect = aside.getBoundingClientRect();
            const viewportRight = document.documentElement.clientWidth;
            const inRightGutter = event.clientX >= rect.right && event.clientX <= viewportRight;
            if (!inRightGutter) return;

            const unit =
                event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? 16
                    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                    ? aside.clientHeight
                    : 1;
            const deltaY = event.deltaY * unit;
            if (deltaY === 0) return;

            const maxScrollTop = Math.max(0, aside.scrollHeight - aside.clientHeight);
            const nextScrollTop = Math.min(maxScrollTop, Math.max(0, aside.scrollTop + deltaY));
            if (nextScrollTop === aside.scrollTop) return;

            event.preventDefault();
            aside.scrollTop = nextScrollTop;
        };

        window.addEventListener("wheel", routeRightGutterWheel, { passive: false });
        return () => window.removeEventListener("wheel", routeRightGutterWheel);
    }, [showAside]);

    const onSliderResize = (deltaPx: number) => {
        const inner = groupInnerRef.current || 1;
        setRatio((prev) => prev + deltaPx / inner);
    };

    return (
        <RelatedStacksProvider>
            <TopNav />

            <div
                data-testid="content-group"
                data-weave-split={showAside ? "true" : undefined}
                data-weave-variant={bridgeVariant}
                data-weave-suspended={openBridgeSuspended ? "fast-scroll" : undefined}
                data-weave-shortcut="Shift+B"
                aria-keyshortcuts="Shift+B"
                ref={groupRef}
                style={{
                    padding: "0 16px",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "stretch",
                    // The shell owns the stable split between panes. Grouping
                    // decorations must never resize or reposition this row; pane-local
                    // frames draw outward instead so the divider stays fixed.
                    maxWidth: MAX_CONTENT_WIDTH,
                    width: "100%",
                    margin: "0 auto",
                }}
            >
                <div
                    data-testid="feed"
                    ref={feedRef}
                    style={{
                        paddingTop: 16,
                        // With an aside, take the slider-controlled share of the row.
                        // Without one (liked / bookmarks / search, or on a narrow
                        // viewport), render a
                        // single centered reading column instead of a too-wide
                        // full-bleed feed — keeps the composer and posts aligned and
                        // consistent with the feed width when the aside is present.
                        ...(showAside
                            ? { flexGrow: ratio, flexBasis: 0, minWidth: 0 }
                            : { width: "100%", maxWidth: 760, margin: "0 auto" }),
                    }}
                >
                    <div
                        data-testid="feed-content"
                        style={{
                            width: showAside ? `calc(100% - ${FEED_WEAVE_INSET}px)` : "100%",
                            // The inset reserves a real drawing runway without
                            // moving the divider or stealing width from the
                            // related panel. It is also the nearest container-query
                            // context, so cards react to their true rendered width.
                            containerType: "inline-size",
                        }}
                    >
                        {children}
                    </div>
                </div>

                {showAside && (
                    <ResizableDivider
                        ariaLabel="Resize feed and related panels"
                        onResize={onSliderResize}
                        onDoubleClick={reset}
                        quietIdleLine
                        activeLineColor={bridgeVariant === "open" ? "var(--cw-teal)" : undefined}
                        valueNow={Math.round(ratio * 100)}
                        valueMin={Math.round(FEED_RATIO_MIN * 100)}
                        valueMax={Math.round(FEED_RATIO_MAX * 100)}
                        style={{
                            position: "relative",
                            top: "auto",
                            bottom: "auto",
                            marginLeft: PANE_GUTTER,
                            marginRight: PANE_GUTTER,
                            alignSelf: "stretch",
                            flex: `0 0 ${SLIDER_W}px`,
                        }}
                    />
                )}

                <div
                    data-testid="col-aside"
                    className="aside-scroll"
                    ref={asideRef}
                    style={{
                        ...(showAside
                            ? { flexGrow: 1 - ratio, flexBasis: 0 }
                            : { flexGrow: 0, flexBasis: 0 }),
                        minWidth: 0,
                        display: showAside ? "block" : "none",
                        alignSelf: "flex-start",
                        position: "sticky",
                        top: TOP_NAV_HEIGHT,
                        height: `calc(100vh - ${TOP_NAV_HEIGHT}px)`,
                        overflowY: "auto",
                        // We explicitly preserve a semantic card anchor when
                        // panel content changes. Disable the browser's separate
                        // scroll-anchoring heuristic so expanding a card cannot
                        // silently fight that restoration and shift the pane.
                        overflowAnchor: "none",
                        // NOT "visible": with overflow-y auto this is a scroll
                        // container, so a visible x-axis is impossible ("visible"
                        // computes to auto — which made the pane horizontally
                        // scrollable by the group frame's outward rail, letting the
                        // border scroll out of view). "clip" hard-disables sideways
                        // scrolling; the rail itself fits inside the card list's
                        // matching right gutter (see RelatedStacks).
                        overflowX: "clip",
                        overscrollBehavior: "contain",
                        // Visible, distinctly-styled scrollbar for the related panel
                        // (Firefox here; the custom webkit style is in globals.css
                        // under .aside-scroll). Deliberately different from the
                        // system scrollbar of the feed column so they don't confuse.
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(28,43,74,0.32) transparent",
                        // No paddingTop: the RelatedStacks header is `position:sticky;
                        // top:0`, so any top padding on this scroll container leaves a
                        // transparent strip above the header that scrolled cards show
                        // through. An opaque background keeps the panel solid.
                        background: "var(--cw-canvas)",
                        // Container-query context: related cards detect a narrow panel
                        // (its width depends on the slider ratio, not just the viewport).
                        containerType: "inline-size",
                    }}
                >
                    {aside ?? null}
                </div>
            </div>

            <div
                role="status"
                data-testid="weave-bridge-status"
                aria-live="polite"
                aria-atomic="true"
                style={{
                    position: "fixed",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0, 0, 0, 0)",
                    whiteSpace: "nowrap",
                    border: 0,
                }}
            >
                {BRIDGE_VARIANT_LABEL[bridgeVariant]}
            </div>

            <WeaveBridge
                enabled={showAside && bridgeVariant !== "border" && !openBridgeSuspended}
                feedRef={feedRef}
                asideRef={asideRef}
                variant={lastDrawnBridgeVariant.current}
            />

            <HoverTooltip />
        </RelatedStacksProvider>
    );
}
