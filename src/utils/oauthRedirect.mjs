/**
 * Resolve the public CrossWeave origin used for Mastodon OAuth callbacks.
 *
 * APP_URL is intentionally not consulted here. It was shared with older
 * deployments and can outlive a frontend domain move, causing Mastodon to send
 * users back to a retired host. By default the OAuth attempt now returns to the
 * same origin that started it. Deployments whose reverse proxy rewrites the
 * request URL can opt in to a dedicated OAUTH_REDIRECT_ORIGIN instead.
 */
export function resolveOAuthRedirectOrigin({ requestOrigin, configuredOrigin }) {
  const candidate = configuredOrigin?.trim() || requestOrigin;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("OAuth redirect origin must use http or https");
  }

  return url.origin;
}

export function mastodonOAuthRedirectUri(options) {
  return `${resolveOAuthRedirectOrigin(options)}/callback`;
}
