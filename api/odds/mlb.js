// Vercel serverless function — The Odds API proxy, MLB ONLY.
//
// Route:  GET /api/odds/mlb
//
// Hard scope:
//   - Only baseball_mlb is allowed. Any other sport / path returns 400.
//   - ODDS_API_KEY is read from process.env (set in Vercel env). Never
//     exposed to the browser. Never hardcoded.
//
// Cache behavior:
//   - 10-minute TTL on successful responses (TTL_MS).
//   - In-flight dedupe: concurrent identical requests share one upstream
//     fetch promise so a burst of traffic does not multiply quota usage.
//   - Stale fallback: if upstream is unavailable, quota-exhausted (401/
//     402/429), or 5xx, we serve the last cached payload with
//     `X-Cache: STALE` and never blank the sportsbook.
//
// Response headers:
//   X-Cache:           HIT  | MISS | STALE
//   X-Games-Count:     <int>            (count of games in returned payload)
//   X-Cache-Age:       <seconds>        (age of payload served; 0 on MISS)
//   X-Upstream-Status: <int>            (TEMP DEBUG, only on errors)
//   X-Upstream-Error:  <short string>   (TEMP DEBUG, only on errors)
//   X-Cache-Flush:     ok               (TEMP DEBUG, when ?flush=1 used)
//   Cache-Control:     public, max-age=<ttl>  on HIT/MISS,  no-store on STALE
//
// This file owns:
//   - Sportsbook lines for MLB.
// This file does NOT own:
//   - Live tab data (SportsDataIO via /api/sportsdataio/mlb).
//   - Grading, settlement, balance math, or anything else.

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports';
const SPORT_KEY     = 'baseball_mlb';
const REGIONS       = 'us';
const MARKETS       = 'h2h,spreads,totals';
const ODDS_FORMAT   = 'american';
const DATE_FORMAT   = 'iso';

const TTL_MS        = 10 * 60 * 1000;   // 10 minutes
const MAX_CACHE_AGE_FOR_STALE_MS = 24 * 60 * 60 * 1000; // refuse to serve stale older than 24h

// Process-local state. Survives within a warm Lambda invocation; cold starts
// rebuild it. This is acceptable: cache miss on cold start, hits everywhere
// else, and bounded memory per instance.
const _cache    = new Map(); // key -> { expiresAt, storedAt, status, body, gamesCount }
const _inFlight = new Map(); // key -> Promise<{ status, body, gamesCount, contentType }>

function _cacheKey() {
  // Only one shape of request is allowed, so the key is constant for MLB.
  // Encoded as a URL to make logs/debug obvious.
  return ODDS_API_BASE + '/' + SPORT_KEY + '/odds?regions=' + REGIONS +
         '&markets=' + MARKETS + '&oddsFormat=' + ODDS_FORMAT +
         '&dateFormat=' + DATE_FORMAT;
}

function _countGames(body) {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed.length;
    return 0;
  } catch (_e) {
    return 0;
  }
}

function _isQuotaOrAuth(status) {
  return status === 401 || status === 402 || status === 429;
}

// TEMP DEBUG — extract upstream error_code from response body without
// logging the full body. The Odds API returns shapes like:
//   { "error_code": "OUT_OF_USAGE_CREDITS", "message": "..." }
//   { "message": "Missing api key" }
function _extractUpstreamErrorCode(body) {
  if (!body || typeof body !== 'string') return '-';
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      if (parsed.error_code) return String(parsed.error_code);
      if (parsed.message)    return String(parsed.message).slice(0, 120);
    }
  } catch (_e) {
    // not JSON — fall through
  }
  return body.slice(0, 120);
}

// TEMP DEBUG — fingerprint a secret without leaking it. Returns last 6
// chars + length. Never the prefix; never the full value.
function _keyFingerprint(key) {
  if (!key || typeof key !== 'string') return '(missing)';
  const len  = key.length;
  const tail = len <= 6 ? key : key.slice(-6);
  return 'len=' + len + ' tail=' + tail;
}

async function _fetchUpstream(url, apiKey) {
  const u = url + '&apiKey=' + encodeURIComponent(apiKey);
  let res;
  try {
    res = await fetch(u, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'pocketbooks-sports-vercel/1.0'
      }
    });
  } catch (err) {
    // Network-level failure
    return { ok: false, status: 0, body: '', contentType: 'application/json', err: String(err && err.message || err) };
  }
  const ct   = res.headers.get('content-type') || 'application/json';
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text, contentType: ct, err: null };
}

module.exports = async function handler(req, res) {
  // ── Method gate ────────────────────────────────────────────────────────
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // ── Hard MLB-only scope ────────────────────────────────────────────────
  // Reject any attempt to widen scope via query params. We do not honor
  // arbitrary `sport`, `path`, `markets`, `regions`, etc.
  const q = (req.query && typeof req.query === 'object') ? req.query : {};
  if (q.sport && String(q.sport).toLowerCase() !== SPORT_KEY) {
    return res.status(400).json({
      error: 'sport_not_allowed',
      message: 'Only baseball_mlb is permitted on this endpoint.'
    });
  }

  // ── Env-only API key ───────────────────────────────────────────────────
  const apiKey = (process.env.ODDS_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({
      error: 'odds_api_key_missing',
      message: 'ODDS_API_KEY is not set in the deployment environment.'
    });
  }

  // TEMP DEBUG — prove which key the proxy is actually sending upstream.
  // Logs length + last-6 chars only. Never the full key.
  console.log('[odds proxy] key fingerprint ' + _keyFingerprint(apiKey));

  const url = _cacheKey();
  const now = Date.now();

  // ── Manual cache flush (TEMP DEBUG) ────────────────────────────────────
  // Hit /api/odds/mlb?flush=1 to drop the in-memory cache so the next
  // request forces a fresh upstream call. Useful after rotating keys to
  // prove the new key reaches upstream.
  // Note: error responses are NEVER cached, so a stale 402 cannot be
  // replayed from cache. Flushing only matters when a prior 200 was
  // cached and you want to re-verify upstream.
  if (q.flush === '1' || q.flush === 'true') {
    const sizeBefore = _cache.size;
    _cache.clear();
    _inFlight.clear();
    console.log('[odds proxy] cache flushed by ?flush=1 (entries cleared: ' + sizeBefore + ')');
    res.setHeader('X-Cache-Flush', 'ok');
  }

  // ── Cache lookup ───────────────────────────────────────────────────────
  const cached = _cache.get(url);
  if (cached && cached.expiresAt > now) {
    res.setHeader('X-Cache',       'HIT');
    res.setHeader('X-Games-Count', String(cached.gamesCount));
    res.setHeader('X-Cache-Age',   String(Math.round((now - cached.storedAt) / 1000)));
    res.setHeader('Cache-Control', 'public, max-age=' + Math.round(TTL_MS / 1000));
    res.setHeader('Content-Type',  'application/json');
    return res.status(cached.status).send(cached.body);
  }

  // ── In-flight dedupe ───────────────────────────────────────────────────
  // If another request is already fetching the same URL, await its result
  // instead of issuing a parallel upstream call.
  let upstreamPromise = _inFlight.get(url);
  let dedupeHit = false;
  if (upstreamPromise) {
    dedupeHit = true;
  } else {
    upstreamPromise = _fetchUpstream(url, apiKey).finally(function(){
      _inFlight.delete(url);
    });
    _inFlight.set(url, upstreamPromise);
  }

  const result = await upstreamPromise;

  // TEMP DEBUG — prove what upstream actually returned.
  console.log('[odds proxy] upstream status=' + (result.status || 0) +
              ' ok=' + (result.ok ? 'yes' : 'no') +
              ' error_code=' + _extractUpstreamErrorCode(result.body) +
              (result.err ? ' fetch_err=' + result.err : ''));

  // ── Success path ───────────────────────────────────────────────────────
  if (result.ok) {
    const gamesCount = _countGames(result.body);
    _cache.set(url, {
      expiresAt:  now + TTL_MS,
      storedAt:   now,
      status:     result.status,
      body:       result.body,
      gamesCount: gamesCount
    });
    res.setHeader('X-Cache',       'MISS');
    res.setHeader('X-Games-Count', String(gamesCount));
    res.setHeader('X-Cache-Age',   '0');
    res.setHeader('X-Dedupe',      dedupeHit ? '1' : '0');
    res.setHeader('Cache-Control', 'public, max-age=' + Math.round(TTL_MS / 1000));
    res.setHeader('Content-Type',  result.contentType);
    return res.status(result.status).send(result.body);
  }

  // ── Failure path → stale fallback if we have anything cached ──────────
  // We treat any non-2xx + network errors as "fall back to stale". We will
  // never blank the sportsbook because of a quota / upstream blip.
  const stale = _cache.get(url);
  const staleFresh = stale && (now - stale.storedAt) <= MAX_CACHE_AGE_FOR_STALE_MS;
  if (staleFresh) {
    res.setHeader('X-Cache',          'STALE');
    res.setHeader('X-Games-Count',    String(stale.gamesCount));
    res.setHeader('X-Cache-Age',      String(Math.round((now - stale.storedAt) / 1000)));
    res.setHeader('X-Upstream-Status', String(result.status || 0));
    res.setHeader('X-Upstream-Error',  _extractUpstreamErrorCode(result.body));
    res.setHeader('X-Stale-Reason',   _isQuotaOrAuth(result.status) ? 'quota_or_auth' : (result.status ? 'upstream_error' : 'network_error'));
    res.setHeader('Cache-Control',    'no-store');
    res.setHeader('Content-Type',     'application/json');
    return res.status(200).send(stale.body);
  }

  // No cache available — surface the underlying error so the client can
  // render a helpful message. The client should still avoid blanking.
  res.setHeader('X-Cache',           'MISS');
  res.setHeader('X-Games-Count',     '0');
  res.setHeader('X-Upstream-Status', String(result.status || 0));
  res.setHeader('X-Upstream-Error',  _extractUpstreamErrorCode(result.body));
  res.setHeader('Cache-Control',     'no-store');
  if (_isQuotaOrAuth(result.status)) {
    return res.status(503).json({
      error: 'odds_quota_or_auth',
      error_code: result.status === 402 ? 'OUT_OF_USAGE_CREDITS' : 'auth_or_rate_limit',
      upstream_status: result.status,
      upstream_error_code: _extractUpstreamErrorCode(result.body),
      key_fingerprint: _keyFingerprint(apiKey),
      message: 'Odds API is unavailable and no cached lines are available.'
    });
  }
  return res.status(result.status >= 500 ? 502 : (result.status || 502)).json({
    error: 'upstream_error',
    upstream_status: result.status || 0,
    upstream_error_code: _extractUpstreamErrorCode(result.body),
    key_fingerprint: _keyFingerprint(apiKey),
    message: result.err || ('Upstream returned ' + result.status)
  });
};
