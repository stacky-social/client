export interface SessionUrlEntry {
  url: string;
  visitedAt: string;
}

export interface SessionUrlTrail {
  id: string;
  startedAt: string;
  lastSeenAt: string;
  urls: SessionUrlEntry[];
}

export interface SessionTrailStore {
  version: 1;
  sessions: SessionUrlTrail[];
}

export interface SessionUrlProperties {
  url: string;
  pathname: string;
  postId: string | null;
  filters: Record<string, string>;
}

export declare const SESSION_TRAIL_VERSION: 1;
export declare const SESSION_TRAIL_MAX_SESSIONS: number;
export declare const SESSION_TRAIL_MAX_URLS: number;

export function isTrackableSessionPath(pathname: string): boolean;
export function sessionUrlProperties(relativeUrl: string): SessionUrlProperties;
export function appendSessionUrl(
  value: unknown,
  entry: { sessionId: string; url: string; visitedAt: string },
  options?: { maxSessions?: number; maxUrls?: number },
): { appended: boolean; store: SessionTrailStore };
