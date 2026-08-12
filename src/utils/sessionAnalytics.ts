"use client";

import { getStudySession } from "./studyMode";
import {
  appendSessionUrl,
  isTrackableSessionPath,
  sessionUrlProperties,
  type SessionTrailStore,
} from "./sessionTrail.mjs";

export const SESSION_TRAILS_KEY = "crossweave:sessionTrails:v1";
const BROWSER_SESSION_ID_KEY = "crossweave:analyticsSessionId:v1";

type PostHogClient = import("posthog-js").PostHogInterface;
let posthogClientPromise: Promise<PostHogClient | null> | null = null;
let inMemoryBrowserSessionId: string | null = null;
let activePostHogStudySessionId: string | null = null;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function currentSessionId(): string {
  const study = getStudySession();
  if (study) return `study:${study.id}`;

  try {
    const existing = sessionStorage.getItem(BROWSER_SESSION_ID_KEY);
    if (existing) return existing;
    const created = `browser:${randomId()}`;
    sessionStorage.setItem(BROWSER_SESSION_ID_KEY, created);
    return created;
  } catch {
    if (!inMemoryBrowserSessionId) inMemoryBrowserSessionId = `browser:${randomId()}`;
    return inMemoryBrowserSessionId;
  }
}

function readLocalTrails(): unknown {
  try {
    const raw = localStorage.getItem(SESSION_TRAILS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function getPostHogClient(): Promise<PostHogClient | null> {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return null;
  if (posthogClientPromise) return posthogClientPromise;

  posthogClientPromise = import("posthog-js").then(({ default: posthog }) => {
    return new Promise<PostHogClient>((resolve) => {
      posthog.init(token, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        defaults: "2026-05-30",
        // The present study requirement is deliberately narrow: URL transitions
        // only. Do not collect clicks, form values, replay, heatmaps, exceptions,
        // surveys, or person profiles until the research protocol explicitly
        // expands and its consent/data-retention policy is ready.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        person_profiles: "never",
        persistence: "memory",
        request_batching: false,
        opt_out_useragent_filter: process.env.NEXT_PUBLIC_POSTHOG_E2E_ALLOW_BOTS === "1",
        loaded: resolve,
      });
    });
  }).catch(() => null);

  return posthogClientPromise;
}

function canSendRemoteAnalytics(): boolean {
  if (!getStudySession()) return false;
  if (navigator.doNotTrack === "1") return false;
  if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return false;
  return true;
}

/** Record one route/search transition locally and, when configured, in PostHog. */
export function recordSessionUrl(relativeUrl: string): void {
  if (typeof window === "undefined") return;
  const details = sessionUrlProperties(relativeUrl);
  if (!isTrackableSessionPath(details.pathname)) return;
  const sessionId = currentSessionId();
  const visitedAt = new Date().toISOString();
  const result = appendSessionUrl(readLocalTrails(), {
    sessionId,
    url: relativeUrl,
    visitedAt,
  });

  try {
    localStorage.setItem(SESSION_TRAILS_KEY, JSON.stringify(result.store));
  } catch {
    // Analytics must never block navigation, even in private mode or at quota.
  }

  if (!result.appended || !canSendRemoteAnalytics()) return;
  void getPostHogClient().then((posthog) => {
    if (!posthog) return;
    if (activePostHogStudySessionId !== sessionId) {
      // The same browser is reused between study participants. Rotate both
      // PostHog's anonymous person and device IDs so separate sessions cannot
      // be joined through its generated identifiers.
      posthog.reset(true);
      activePostHogStudySessionId = sessionId;
    }
    posthog.capture("$pageview", {
      $current_url: `${window.location.origin}${details.url}`,
      crossweave_session_id: sessionId,
      pathname: details.pathname,
      post_id: details.postId ?? undefined,
      filters: details.filters,
    });
  });
}

/** Read-only export seam for study collection and future server uploads. */
export function getSessionTrails(): SessionTrailStore | null {
  if (typeof window === "undefined") return null;
  const value = readLocalTrails();
  return value && typeof value === "object" ? value as SessionTrailStore : null;
}
