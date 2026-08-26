"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { AuthorStats } from "../types/PostType";
import { getUserProfile } from "../utils/localStore";
import { MASTODON_INSTANCE_URL } from "../utils/mastodonApi";
import { hideTooltip, showTooltip } from "./HoverTooltip";

type AuthorHoverInfoProps = {
  displayName: string;
  account: string;
  stats?: AuthorStats;
  children: React.ReactNode;
};

const TOOLTIP_COLORS = { text: "#1c2b4a", border: "#a8b3c5" };

function finiteCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : undefined;
}

function localInstanceHost(): string {
  try {
    return new URL(MASTODON_INSTANCE_URL).hostname;
  } catch {
    return "CrossWeave";
  }
}

function identityFromAccount(account: string): { username: string; source: string } {
  const normalized = account.trim().replace(/^@/, "");
  const separator = normalized.indexOf("@");
  if (separator < 0) {
    return { username: normalized || "unknown", source: localInstanceHost() };
  }
  return {
    username: normalized.slice(0, separator) || "unknown",
    source: normalized.slice(separator + 1) || localInstanceHost(),
  };
}

function statLabel(value: number, singular: string): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : `${singular}s`}`;
}

/** Adds a compact identity/activity tooltip to an existing username control. */
export default function AuthorHoverInfo({
  displayName,
  account,
  stats,
  children,
}: AuthorHoverInfoProps) {
  const [localStats, setLocalStats] = useState<AuthorStats>({});
  const identity = useMemo(() => identityFromAccount(account), [account]);

  useEffect(() => {
    const profile = getUserProfile(account);
    setLocalStats({
      posts: finiteCount(profile.statuses_count),
      followers: finiteCount(profile.followers_count),
      following: finiteCount(profile.following_count),
    });
  }, [account]);

  const resolvedStats = {
    posts: finiteCount(stats?.posts) ?? localStats.posts ?? 0,
    followers: finiteCount(stats?.followers) ?? localStats.followers,
    following: finiteCount(stats?.following) ?? localStats.following,
  };

  const tooltip = (
    <div data-author-tooltip style={{ width: 214, padding: "5px 2px 4px" }}>
      <div
        style={{
          color: "#011445",
          fontSize: 12,
          fontWeight: 750,
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {displayName}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 5,
          marginTop: 2,
          color: "#607086",
          fontSize: 10,
          fontWeight: 600,
          overflow: "hidden",
        }}
      >
        <span data-author-username style={{ color: "#334155", flexShrink: 0 }}>
          @{identity.username}
        </span>
        <span aria-hidden>·</span>
        <span data-author-source style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {identity.source}
        </span>
      </div>
      <div
        data-author-stats
        style={{
          display: "flex",
          gap: 10,
          marginTop: 7,
          paddingTop: 6,
          borderTop: "1px solid #e2e8f0",
          color: "#536176",
          fontSize: 10,
          fontWeight: 650,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span data-author-stat="posts">{statLabel(resolvedStats.posts, "post")}</span>
        {resolvedStats.followers !== undefined && resolvedStats.followers > 0 && (
          <span data-author-stat="followers">{statLabel(resolvedStats.followers, "follower")}</span>
        )}
        {resolvedStats.following !== undefined && resolvedStats.following > 0 && (
          <span data-author-stat="following">{resolvedStats.following.toLocaleString()} following</span>
        )}
      </div>
    </div>
  );

  const reveal = (x: number, y: number) => {
    showTooltip({ content: tooltip, colors: TOOLTIP_COLORS, x, y });
  };

  return (
    <span
      data-author-hover
      style={{ display: "inline-flex", minWidth: 0, maxWidth: "100%", flex: "0 1 auto" }}
      onMouseEnter={(event) => reveal(event.clientX, event.clientY)}
      onMouseLeave={hideTooltip}
      onFocus={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        reveal(rect.left + rect.width / 2, rect.bottom);
      }}
      onBlur={hideTooltip}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") hideTooltip();
      }}
    >
      {children}
    </span>
  );
}
