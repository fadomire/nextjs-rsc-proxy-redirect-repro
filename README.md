# Next.js — proxy redirects drop `_rsc`, and the `validateRSCRequestHeaders` 307 is publicly cacheable

Minimal reproduction for two related App Router issues that allow shared-cache poisoning on CDNs that key on the
URL only — the scenario the `_rsc` cache-busting param and `experimental.validateRSCRequestHeaders` exist for.

Reproduced on **16.3.4** and on **16.4.0-canary.38**, with default config (no `next.config`).

## Run

```bash
npm install
npm run build
npm start        # next start -p 3999
```

## 1. A redirect returned from `proxy.ts` drops `_rsc`

```bash
curl -sI -H 'RSC: 1' 'http://localhost:3999/redirect-source?_rsc=abc123'
```
```
HTTP/1.1 307 Temporary Redirect
location: /target                      ← _rsc=abc123 is gone
```

The same navigation expressed as a **rewrite** keeps it:

```bash
curl -sI -H 'RSC: 1' 'http://localhost:3999/rewrite-source?_rsc=abc123'
```
```
x-middleware-rewrite: /target?_rsc=abc123      ← preserved
```

`server/web/adapter.ts` re-appends `_rsc` after a rewrite ("necessary to ensure that RSC hash validation works
correctly after a rewrite") and has no equivalent in the redirect branch, which only relativizes `Location`.

Application code cannot compensate: `stripInternalSearchParams` removes `_rsc` from `request.url` / `nextUrl`,
and `FLIGHT_HEADERS` (`RSC`, `Next-Router-State-Tree`, `Next-Router-Prefetch`, `Next-Url`) are deleted from
`request.headers` before `proxy` runs — the proxy can neither read the hash nor detect an RSC request.

## 2. The validation 307 is publicly cacheable and carries no `Vary`

The browser follows the redirect above while keeping the `RSC: 1` header, so the next request is an RSC request
on a bare document URL. `validateRSCRequestHeaders` (default `true` since 16.3) catches it:

```bash
curl -sI -H 'RSC: 1' 'http://localhost:3999/target'
```
```
HTTP/1.1 307 Temporary Redirect
cache-control: public, max-age=60       ← inherited from the app's own headers
location: /target?_rsc                  ← and no Vary header at all
```

Every normal response in this app does carry the variance information:

```bash
curl -sI 'http://localhost:3999/target'                      # document
curl -sI -H 'RSC: 1' 'http://localhost:3999/target?_rsc'     # RSC, correct hash
```
```
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
```

## Impact

On a shared cache keyed by URL, step 2 stores a **redirect** under the *document* URL. Later document
navigations are answered `307 → /page?_rsc=<hash>`, which is where RSC payloads are cached — visitors land on a
blank page rendering the Flight payload, with `?_rsc=` in the address bar.

`validateRSCRequestHeaders` therefore does not remove the poisoning on this class of CDN, it changes its shape.
The redirect is arguably worse than the payload it replaces: carrying no `Vary` at all, it is stored
unpartitioned even by caches that honour `Vary`.

Seen in production (Next 16.2.6, App Router, `output: 'standalone'`, Akamai + nginx, both keying on URL only):
intermittent blank pages showing the RSC payload, and ~1,000 RUM page views over 30 days whose top-level URL
contains `?_rsc=<hash>`.

## Expected

1. Carry `_rsc` forward on redirects returned from proxy/middleware, as the rewrite branch already does — or
   expose the hash / the RSC-request flag to proxy code.
2. Emit the validation 307 as `Cache-Control: private, no-store` (it is a per-request correction, not a
   resource), and/or with the same `Vary` as the responses it guards.

## Related

- GHSA-r2fc-ccr8-96c4 / CVE-2025-49005 — RSC payloads cached and served as HTML "under specific conditions
  involving middleware and redirects" (15.3.0–15.3.2, fixed 15.3.3).
- GHSA-wfc6-r584-vfw7 / CVE-2026-44576 — cache poisoning in RSC responses (14.2.0–15.5.15, 16.0.0–16.2.4, fixed
  15.5.16 / 16.2.5); its fix is the header validation discussed here.
