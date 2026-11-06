# Security Policy

Deep Cuts is a publicly hosted portfolio app with invite-only, passkey accounts. Account data is
stored in Cloudflare D1; the demo account keeps its sample data in the browser. The app sends TMDB
requests through a same-origin server proxy so the TMDB credential is never exposed to browsers.

Security controls include a restrictive Content Security Policy and other response headers, an
allowlist and per-client rate limiting on the TMDB proxy, same-origin checks on state-changing
requests, Zod validation at trust boundaries, passkey-only authentication, and secret scanning in
CI. The application and its infrastructure are designed to stay within free service tiers rather
than incur usage-based charges.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** ("Report a vulnerability" under the Security tab). Do not open a public issue. Expect an acknowledgement within 7 days.

## Supported versions

Only the latest `main` is supported.
