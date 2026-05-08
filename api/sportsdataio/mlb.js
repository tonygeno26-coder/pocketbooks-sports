// Vercel serverless function — SportsDataIO MLB proxy.
//
// Route:  GET /api/sportsdataio/mlb
//         GET /api/sportsdataio/mlb?path=scores/json/GamesByDate/2026-MAY-08
//         GET /api/sportsdataio/mlb?endpoint=today          (alias for today's games)
//         GET /api/sportsdataio/mlb?endpoint=current-season (alias for current season)
//
// - Reads SPORTSDATAIO_API_KEY from process.env (set in Vercel project env vars).
// - Attaches Ocp-Apim-Subscription-Key header server-side.
// - In-memory cache: 120s default, capped to 300s via ?ttl=<seconds>.
// - Refuses absolute / off-host paths so the endpoint can't be abused as an
//   open proxy.
//
// The frontend calls this endpoint; the API key is never exposed to the
// browser.

const SPORTSDATAIO_BASE = 'https://api.sportsdata.io/v3/mlb';
const DEFAULT_TTL_S = 120;
const MAX_TTL_S     = 300;

// Process-local in-memory cache. Survives within a single warm Lambda;
// independent caches per cold instance are fine for hit-rate purposes and
// avoids burning the 1000-call free quota under bursty traffic.
const _cache = new Map(); // key -> { expiresAt: number, status: number, body: string, contentType: string }

function _today() {
  // SportsDataIO date format: 2026-MAY-08 (year-MMM-DD, uppercase).
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
  // Otherwise, friendly endpoint alias — default 'today' when nothing set.
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

module.exports = async function handler(req, res) {
  // Method gate
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = (process.env.SPORTSDATAIO_API_KEY || '').trim();
  if (!key) {
    return res.status(500).json({
      error: 'sportsdataio_key_missing',
      message: 'SPORTSDATAIO_API_KEY is not set in the deployment environment.'
    });
  }

  const query = (req.query && typeof req.query === 'object') ? req.query : {};
  const subPath = _resolvePath(query);
  if (!subPath) {
    return res.status(400).json({ error: 'bad_path', message: 'path must be relative to api.sportsdata.io/v3/mlb' });
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
    res.setHeader('Cache-Control', 'public, max-age=' + ttlS);
    res.setHeader('Content-Type', cached.contentType || 'application/json');
    return res.status(cached.status).send(cached.body);
  }

  // Upstream fetch
  let upstream;
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
    return res.status(502).json({
      error: 'upstream_fetch_failed',
      message: String(err && err.message || err)
    });
  }

  const ct = upstream.headers.get('content-type') || 'application/json';
  const text = await upstream.text();

  // Only cache successful responses (avoid pinning rate-limit / auth errors).
  if (upstream.ok && ttlS > 0) {
    _cache.set(cacheKey, {
      expiresAt: now + ttlS * 1000,
      status: upstream.status,
      body: text,
      contentType: ct
    });
    // Bound the cache size so a misbehaving caller can't OOM the lambda.
    if (_cache.size > 64) {
      const firstKey = _cache.keys().next().value;
      _cache.delete(firstKey);
    }
  }

  res.setHeader('X-Cache', upstream.ok ? 'MISS' : 'BYPASS');
  res.setHeader('Cache-Control', upstream.ok ? ('public, max-age=' + ttlS) : 'no-store');
  res.setHeader('Content-Type', ct);
  res.status(upstream.status).send(text);
};
