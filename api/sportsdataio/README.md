# SportsDataIO Vercel proxy

Serverless function at `/api/sportsdataio/mlb`. Reads
`SPORTSDATAIO_API_KEY` from the Vercel project's environment variables
and forwards requests to `https://api.sportsdata.io/v3/mlb/...` with the
`Ocp-Apim-Subscription-Key` header attached server-side. The API key is
never sent to or visible from the browser.

## Required env var

In Vercel → Project → Settings → Environment Variables:

```
SPORTSDATAIO_API_KEY = <your-key>
```

For local `vercel dev`, put the same key in `.env.local` at repo root
(this file is gitignored). Never commit the key.

## Endpoints

```
GET /api/sportsdataio/mlb
GET /api/sportsdataio/mlb?endpoint=today           (default; today's games)
GET /api/sportsdataio/mlb?endpoint=current-season
GET /api/sportsdataio/mlb?endpoint=teams
GET /api/sportsdataio/mlb?endpoint=stadiums
GET /api/sportsdataio/mlb?path=scores/json/GamesByDate/2026-MAY-08
GET /api/sportsdataio/mlb?ttl=120                  (override cache TTL, max 300s)
```

The `path` form is relative to `api.sportsdata.io/v3/mlb/`. Absolute
URLs and `..` are rejected.

## Caching

In-memory per-lambda cache. Default TTL 120s, capped at 300s (`?ttl=`
query). Cache key is the resolved upstream URL. The cache only stores
successful responses; rate-limit / auth errors are not cached. Cache
size is bounded to 64 entries (oldest evicted) so a misbehaving caller
can't OOM the lambda.

Response headers expose cache state:

```
X-Cache: HIT | MISS | BYPASS
X-Cache-Expires-In: <seconds>   (HIT only)
Cache-Control: public, max-age=<ttl>
```

## Routing note

The repo's `vercel.json` rewrites `/api/:path*` to a Railway backend.
On Vercel, filesystem routes (this serverless function) take priority
over rewrites, so requests to `/api/sportsdataio/mlb` resolve to this
function before the rewrite is considered.
