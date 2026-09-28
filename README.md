# Repro: a redirect returned from `proxy.ts` drops the `_rsc` search param

Minimal reproduction, built from
[`reproduction-template`](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template).
Three pages, one `proxy.ts`, and a single `next.config` redirect used only as a comparison.

Verified on **16.4.0-canary.46** (`next dev` and `next start`), and on **16.3.4**.

## Run

```bash
npm install
npm run build
npm start
```

## What `proxy.ts` does

```ts
if (pathname === '/redirect-source') return NextResponse.redirect(new URL('/target', request.url), { status: 307 });
if (pathname === '/rewrite-source')  return NextResponse.rewrite(new URL('/target', request.url));

// every other response is publicly cacheable, as in a CDN-fronted app
const response = NextResponse.next();
response.headers.set('Cache-Control', 'public, max-age=60');
return response;
```

## A. A redirect drops `_rsc`

```bash
curl -sI -H 'RSC: 1' 'http://localhost:3000/redirect-source?_rsc=abc123'
```
```
HTTP/1.1 307 Temporary Redirect
location: /target                          ← _rsc=abc123 is gone
```

## B. The same navigation as a rewrite keeps it

```bash
curl -sI -H 'RSC: 1' 'http://localhost:3000/rewrite-source?_rsc=abc123'
```
```
x-middleware-rewrite: /target?_rsc=abc123  ← preserved
```

## B2. The same redirect declared in `next.config` keeps it too

```ts
// next.config.ts
redirects: async () => [{ source: "/config-redirect-source", destination: "/target", permanent: false }]
```

```bash
curl -sI -H 'RSC: 1' 'http://localhost:3000/config-redirect-source?_rsc=abc123'
```
```
HTTP/1.1 307 Temporary Redirect
location: /target?_rsc=abc123            ← preserved
```

So within the same app, a redirect keeps `_rsc` when it comes from `next.config` and loses it when it comes
from `proxy.ts`.

## Where it happens

`server/web/adapter.ts` re-appends `_rsc` after a rewrite and has no equivalent
in the redirect branch below it, although `rscHash` is still in scope there.

Application code cannot compensate: `stripInternalSearchParams` removes `_rsc`
from `request.url` / `nextUrl`, and the flight headers are removed from
`request.headers`, before `proxy` runs.

## C. The follow-up request has `RSC: 1` and no `_rsc`

The browser follows the redirect from A while keeping the `RSC` header, so the
next request is an RSC request on a bare document URL:

```bash
curl -sI -H 'RSC: 1' 'http://localhost:3000/target'
```
```
HTTP/1.1 307 Temporary Redirect
cache-control: public, max-age=60          ← the app's header
location: /target?_rsc                     ← hash from THIS client's headers
```

No `Vary` on this response. Every other response from the same route has one:

```bash
curl -sI 'http://localhost:3000/target'                    # document → 200
curl -sI -H 'RSC: 1' 'http://localhost:3000/target?_rsc'   # RSC      → 200
```
```
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
```

Removing the `Cache-Control` line from `proxy.ts` yields the same 307 with no
`Cache-Control` at all, and still no `Vary`.

## `next info`

```
Operating System:
  Platform: darwin
  Arch: arm64
  Version: Darwin Kernel Version 27.0.0: Tue Aug 11 21:05:27 PDT 2026; root:xnu-13432.1.9~1/RELEASE_ARM64_T8103
  Available memory (MB): 16384
  Available CPU cores: 8
Binaries:
  Node: 24.14.1
  npm: 11.11.0
  Yarn: 4.18.0
  pnpm: 12.4.1
Relevant Packages:
  next: 16.4.0-canary.46 // Latest available version is detected (16.4.0-canary.46).
  eslint-config-next: N/A
  react: 19.3.0
  react-dom: 19.3.0
  typescript: 5.9.3
Next.js Config:
  output: N/A
```

## Related

[#79346](https://github.com/vercel/next.js/issues/79346) reported the same
dropped parameter and was closed by reinstating the `Vary` header in 15.3.3
([#79939](https://github.com/vercel/next.js/pull/79939)).
