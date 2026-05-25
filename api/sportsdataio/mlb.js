// Vercel serverless function — SportsDataIO MLB proxy.
//
// Route:  GET /api/sportsdataio/mlb
//         GET /api/sportsdataio/mlb?path=scores/json/GamesByDate/2026-MAY-08
//         GET /api/sportsdataio/mlb?endpoint=today          (alias for today's games)
//         GET /api/sportsdataio/mlb?endpoint=current-season (alias for current season)
//         GET /api/sportsdataio/mlb?diag=1                  (config-only diagnostics)
//
// - Reads SPORTSDATAIO_API_KEY from process.env (set in Vercel project env vars).
// - Attaches Ocp-Apim-Subscription-Key header server-side.
// - In-memory cache: 120s default, capped to 300s via ?ttl=<seconds>.
// - Refuses absolute / off-host paths so the endpoint can't be abused as an
//   open proxy.
//
// Error model (Patch SDIO-diag):
//   Every non-2xx response carries a JSON body with:
//     { error: <stable_code>, http: <status>, upstream?: { status, codeFamily, snippet }, message }
//   Stable codes the CLIENT can switch on:
//     sportsdataio_key_missing      \u2014 env var not set on Vercel
//     bad_path / bad_diag           \u2014 client-side request shape problem
//     upstream_fetch_failed         \u2014 network error reaching SportsDataIO
//     upstream_unauthorized         \u2014 SDIO returned 401
//     upstream_forbidden            \u2014 SDIO returned 403
//     upstream_not_found            \u2014 SDIO returned 404
//     upstream_quota_exceeded       \u2014 SDIO returned 429
//     upstream_5xx                  \u2014 SDIO returned >=500
//     upstream_unexpected           \u2014 anything else >=400
//   The proxy never silently maps an upstream error to its own 500 anymore.

const SPORTSDATAIO_BASE = 'https://api.sportsdata.io/v3/mlb';
const DEFAULT_TTL_S = 120;
const MAX_TTL_S     = 300;
const PROXY_VERSION = 'sdio-diag-1';

// Process-local in-memory cache. Survives within a single warm Lambda;
// independent caches per cold instance are fine for hit-rate purposes and
// avoids burning the 1000-call free quota under bursty traffic.
const _cache = new Map(); // key -> { expiresAt, status, body, contentType }

function _today() {
  // SportsDataIO date format: 2026-MAY-08 (year-MMM-DD, uppercase). MLB
  // games are keyed by stadium-local US date upstream. The Vercel lambda
  // runs in UTC; use UTC components so the alias endpoint is reproducible.
  // Clients that need device-local dates should pass an explicit `path`.
  const d = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return d.getUTCFullYear() + '-' + months[d.getUTCMonth()] + '-' + String(d.getUTCDate()).padStart(2,'0');
}

function _resolvePath(query) {
  // Explicit path takes precedence so callers can hit any sub-path.
  const rawPath = (query.path || '').toString().trim();
  if (rawPath) {
    if (/^https?:\/\//i.test(rawPath)) return null; // refuse off-host
    const p = rawPath.replace(/^\/+/, '');
    if (p.includes('..')) return null;             // refuse traversal
    return p;
  }
  // Otherwise, friendly endpoint alias \u2014 default 'today' when nothing set.
  const alias = (query.endpoint || 'today').toString().trim().toLowerCase();
  if (alias === 'today')          return 'scores/json/GamesByDate/' + _today();
  if (alias === 'current-season') return 'scores/json/CurrentSeason';
  if (alias === 'teams')          return 'scores/json/teams';
  if (alias === 'stadiums')       return 'scores/json/Stadiums';
  // Unknown alias: refuse rather than silently defaulting.
  return null;
}

function _ttlSeconds(query) {
  const raw = parseInt(query.ttl, 10);
  if (!isFinite(raw) || raw < 0) return DEFAULT_TTL_S;
  return Math.min(MAX_TTL_S, Math.max(0, raw));
}

function _classifyUpstream(status) {
  if (status === 401) return 'upstream_unauthorized';
  if (status === 403) return 'upstream_forbidden';
  if (status === 404) return 'upstream_not_found';
  if (status === 429) return 'upstream_quota_exceeded';
  if (status >= 500)  return 'upstream_5xx';
  if (status >= 400)  return 'upstream_unexpected';
  return null;
}

// Boolean-only env diagnostic. Never leaks the actual key.
function _envState() {
  const k = (process.env.SPORTSDATAIO_API_KEY || '').trim();
  return {
    sportsdataio_key_present: k.length > 0,
    sportsdataio_key_length:  k.length,
    node_env:                 process.env.NODE_ENV || null,
    vercel_env:               process.env.VERCEL_ENV || null,
    vercel_region:            process.env.VERCEL_REGION || null,
    vercel_deployment:        process.env.VERCEL_GIT_COMMIT_SHA || null,
    proxy_version:            PROXY_VERSION,
    upstream_base:            SPORTSDATAIO_BASE,
    ttl_default_s:            DEFAULT_TTL_S,
    ttl_max_s:                MAX_TTL_S
  };
}

module.exports = async function handler(req, res) {
  // Method gate
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'method_not_allowed', http: 405 });
  }

  const query = (req.query && typeof req.query === 'object') ? req.query : {};

  // \u2500\u2500 Diagnostics shortcut: ?diag=1 \u2500\u2500
  // Returns boolean-only env state so an operator (or the client-side
  // grading audit) can confirm the deployment is configured without
  // exposing secrets. Always 200 on success.
  if (query.diag === '1' || query.diag === 'true') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Proxy-Version', PROXY_VERSION);
    return res.status(200).json({
      ok: true,
      env: _envState(),
      ts: new Date().toISOString()
    });
  }

  // \u2500\u2500 Env-var presence check \u2500\u2500
  const key = (process.env.SPORTSDATAIO_API_KEY || '').trim();
  if (!key) {
    // 503 is the right shape: \"upstream is unavailable\" \u2014 we cannot
    // attempt the call because the proxy is not configured. Previously
    // we returned 500 here, which was indistinguishable from a real
    // upstream 500 in client logs.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Proxy-Version', PROXY_VERSION);
    return res.status(503).json({
      error: 'sportsdataio_key_missing',
      http: 503,
      message: 'SPORTSDATAIO_API_KEY is not set in the deployment environment. ' +
               'Set it in Vercel project settings \u2192 Environment Variables, then redeploy. ' +
               'Hit /api/sportsdataio/mlb?diag=1 to confirm.'
    });
  }

  const subPath = _resolvePath(query);
  if (!subPath) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Proxy-Version', PROXY_VERSION);
    return res.status(400).json({
      error: 'bad_path',
      http: 400,
      message: 'path must be relative to api.sportsdata.io/v3/mlb (no absolute URLs, no traversal)'
    });
  }

  const ttlS  = _ttlSeconds(query);
  const upstreamUrl = SPORTSDATAIO_BASE + '/' + subPath;
  const cacheKey = upstreamUrl;
  const now = Date.now();

  // Cache lookup
  const cached = _cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Expires-In', String(Math.round((cached.expiresAt - now) / 1000)));
    res.setHeader('X-Proxy-Version', PROXY_VERSION);
    res.setHeader('Cache-Control', 'public, max-age=' + ttlS);
    res.setHeader('Content-Type', cached.contentType || 'application/json');
    return res.status(cached.status).send(cached.body);
  }

  // Upstream fetch
  let upstream;
  const fetchStartedAt = Date.now();
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Accept': 'application/json',
        'User-Agent': 'pocketbooks-sports-vercel/1.0'
      }
    });
  } catch (err) {
    const msg = String(err && err.message || err);
    console.error('[sdio proxy] upstream fetch failed', { upstreamUrl, msg });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Proxy-Version', PROXY_VERSION);
    return res.status(502).json({
      error: 'upstream_fetch_failed',
      http: 502,
      message: 'Network error reaching SportsDataIO: ' + msg
    });
  }
  const fetchMs = Date.now() - fetchStartedAt;

  const ct   = upstream.headers.get('content-type') || 'application/json';
  const text = await upstream.text();

  // \u2500\u2500 Upstream success: cache and pass through \u2500\u2500
  if (upstream.ok) {
    if (ttlS > 0) {
      _cache.set(cacheKey, {
        expiresAt: now + ttlS * 1000,
        status: upstream.status,
        body: text,
        contentType: ct
      });
      if (_cache.size > 64) {
        const firstKey = _cache.keys().next().value;
        _cache.delete(firstKey);
      }
    }
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Upstream-Ms', String(fetchMs));
    res.setHeader('X-Proxy-Version', PROXY_VERSION);
    res.setHeader('Cache-Control', 'public, max-age=' + ttlS);
    res.setHeader('Content-Type', ct);
    return res.status(upstream.status).send(text);
  }

  // \u2500\u2500 Upstream error: classify and return a JSON envelope \u2500\u2500
  // We DO NOT echo the upstream body wholesale (it may include vendor
  // strings that aren't useful to the client). We DO include a short
  // snippet and the upstream status so the client can distinguish auth
  // vs quota vs server errors.
  const codeFamily = _classifyUpstream(upstream.status);
  const snippet = (text || '').slice(0, 240);
  console.error('[sdio proxy] upstream error', {
    upstreamUrl,
    upstreamStatus: upstream.status,
    upstreamMs: fetchMs,
    codeFamily,
    snippet
  });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Upstream-Status', String(upstream.status));
  res.setHeader('X-Upstream-Ms', String(fetchMs));
  res.setHeader('X-Proxy-Version', PROXY_VERSION);
  // Map upstream status to a proxy-side status that distinguishes
  // \"upstream said X\" from \"proxy itself is misconfigured\":
  //   401/403  \u2192  502 Bad Gateway (auth problem AT upstream, our key issue)
  //   404      \u2192  404 Not Found (passthrough; route not on upstream)
  //   429      \u2192  429 Too Many Requests (passthrough)
  //   5xx      \u2192  502 Bad Gateway (upstream broken)
  //   other 4xx \u2192 502 Bad Gateway
  const proxyStatus = (upstream.status === 404 || upstream.status === 429)
                        ? upstream.status
                        : 502;
  return res.status(proxyStatus).json({
    error: codeFamily || 'upstream_unexpected',
    http: proxyStatus,
    upstream: {
      status: upstream.status,
      codeFamily: codeFamily || 'upstream_unexpected',
      snippet: snippet
    },
    message: 'SportsDataIO returned HTTP ' + upstream.status +
             ' for path "' + subPath + '". See upstream.snippet for vendor detail.'
  });
};
