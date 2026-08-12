import test from "node:test";
import assert from "node:assert/strict";

import {
  mastodonOAuthRedirectUri,
  resolveOAuthRedirectOrigin,
} from "../../src/utils/oauthRedirect.mjs";

test("OAuth returns to the origin that started login instead of a legacy APP_URL", () => {
  assert.equal(
    mastodonOAuthRedirectUri({ requestOrigin: "https://crossweave.example" }),
    "https://crossweave.example/callback",
  );
});

test("a dedicated redirect origin supports reverse proxies and strips paths", () => {
  assert.equal(
    resolveOAuthRedirectOrigin({
      requestOrigin: "http://web:3000",
      configuredOrigin: "https://app.crossweave.example/old/path/",
    }),
    "https://app.crossweave.example",
  );
});

test("OAuth redirect origins reject non-web protocols", () => {
  assert.throws(
    () => resolveOAuthRedirectOrigin({ requestOrigin: "javascript:alert(1)" }),
    /http or https/,
  );
});
