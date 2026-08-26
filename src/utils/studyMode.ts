"use client";

import { useSyncExternalStore } from "react";
import { resetExperimentFlags } from "./experimentFlags";
import { resetLocalStore, type Account } from "./localStore";

export const STUDY_SESSION_KEY = "crossweave:studySession:v1";
const FEED_RATIO_KEY = "stacky:feedRatio";
const STUDY_MODE_EVENT = "crossweave:study-mode-change";

export interface StudyParticipant extends Account {
  id: string;
}

export interface StudySession {
  id: string;
  startedAt: string;
  participant: StudyParticipant;
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyStudyModeChanged(): void {
  window.dispatchEvent(new Event(STUDY_MODE_EVENT));
}

function clearParticipantState(nextParticipant?: Account): void {
  resetLocalStore(nextParticipant);
  resetExperimentFlags();

  localStorage.removeItem(FEED_RATIO_KEY);
  localStorage.removeItem("stacky:centerWidth");
  localStorage.removeItem("stacky:relatedWidth");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("currentUser");
  localStorage.removeItem("authCode");
  localStorage.removeItem(STUDY_SESSION_KEY);

  // Navigation, scroll restoration, and temporary interaction intent are all
  // session-scoped and should never carry across study participants.
  sessionStorage.clear();
}

/** Start a clean, fully local participant session and return its identity. */
export function startStudySession(): StudySession {
  const id = makeSessionId();
  const participant: StudyParticipant = {
    id,
    acct: "study-participant",
    display_name: "Study participant",
    username: "study_participant",
    avatar: "/icon.svg",
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    note: "Local participant identity for this usability-study session.",
  };
  const session: StudySession = {
    id,
    startedAt: new Date().toISOString(),
    participant,
  };

  clearParticipantState(participant);
  localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify(session));
  // Some existing reply/profile paths consume Mastodon's currentUser shape.
  // The local participant includes the compatible fields they need.
  localStorage.setItem("currentUser", JSON.stringify(participant));
  notifyStudyModeChanged();
  return session;
}

/** End the active study session and leave a clean prototype for the next user. */
export function endStudySession(): void {
  if (typeof window === "undefined") return;
  clearParticipantState();
  notifyStudyModeChanged();
}

/** Leave Study Mode before beginning a real Mastodon OAuth login. */
export function prepareForMastodonLogin(): void {
  if (typeof window === "undefined") return;
  if (isStudyMode()) endStudySession();
}

export function getStudySession(): StudySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STUDY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudySession>;
    if (!parsed.id || !parsed.startedAt || !parsed.participant?.id) return null;
    return parsed as StudySession;
  } catch {
    return null;
  }
}

export function isStudyMode(): boolean {
  return getStudySession() !== null;
}

function subscribe(listener: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STUDY_SESSION_KEY) listener();
  };
  window.addEventListener(STUDY_MODE_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(STUDY_MODE_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Hydration-safe reactive Study Mode status for client navigation. */
export function useStudyMode(): boolean {
  return useSyncExternalStore(subscribe, isStudyMode, () => false);
}
