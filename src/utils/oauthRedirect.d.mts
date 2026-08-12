export interface OAuthRedirectOriginOptions {
  requestOrigin: string;
  configuredOrigin?: string;
}

export function resolveOAuthRedirectOrigin(options: OAuthRedirectOriginOptions): string;
export function mastodonOAuthRedirectUri(options: OAuthRedirectOriginOptions): string;
