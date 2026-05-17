# Deployment Workflow — PocketBooks Sports

## One-time Setup (run once per machine)

```bash
cd /path/to/pocketbooks-sports

# Install dev dependencies
npm install

# Install git pre-commit hook (stamps SHA before every commit)
node scripts/install-hooks.js

# Login to Vercel (opens browser)
npx vercel login

# Link to existing Vercel project
npx vercel link
# → Select: tonygeno26-coder/pocketbooks-sports
# → Production branch: main
```

---

## Daily Dev Workflow

### 1. Start local dev server
```bash
npm run dev
# Opens: http://localhost:3000/player.html
# /api/* → proxied to Railway backend automatically
# No-cache headers on all HTML — always serves latest file
```

### 2. Make changes to HTML/JS files

### 3. Run tests before committing
```bash
npm run verify
# Runs lifecycle.test.js (18 tests) + run.js (23 tests)
# Must be 100% green before deploy
```

### 4. Commit (hook auto-stamps SHA)
```bash
git add -A
git commit -m "your message"
# pre-commit hook runs automatically:
#   → stamps build.json with current SHA
#   → patches window.PBS_BUILD_SHA in all HTML files
#   → git adds the stamped files
git push origin main
```

---

## Deploy to Production

```bash
npm run deploy:prod
# Runs in order:
#   1. npm run verify (tests must pass)
#   2. node scripts/build.js (stamp + syntax check + manifest)
#   3. npx vercel --prod --force
```

Or separately:
```bash
npm run verify    # tests
npm run build     # stamp + validate
npx vercel --prod --force  # deploy
```

---

## Verify Deployment After Deploy

```bash
# Check live SHA
curl -s https://pocketbooks-sports.vercel.app/build.json
# Expected: {"sha":"<your-sha>","builtAt":"..."}

# Check player.html has correct SHA
curl -s https://pocketbooks-sports.vercel.app/player.html | grep PBS_BUILD_SHA
# Expected: PBS_BUILD_SHA = '<your-sha>'
```

In browser console:
```js
window.PBS_BUILD_SHA
// Must match: git rev-parse --short HEAD

fetch('/build.json?_='+Date.now()).then(r=>r.json()).then(console.log)
// Must show same sha as above

typeof resetTicketStateForFreshTesting  // "function"
typeof reconcileInvalidGrades           // "function"
typeof revertFutureGrades               // "function"
```

**If stale banner appears** → `npm run deploy:prod` and verify again.

---

## Fixing Broken Vercel Webhook

If Vercel stops auto-deploying on push:

1. Go to https://vercel.com → pocketbooks-sports → Settings → Git
2. Disconnect GitHub repo
3. Reconnect: tonygeno26-coder/pocketbooks-sports, branch: main
4. Run `npx vercel --prod --force` to force first deploy
5. Subsequent pushes will auto-deploy

---

## File Structure

```
pocketbooks-sports/
├── package.json          ← npm scripts
├── vercel.json           ← Vercel config (no-cache headers, /api/* rewrite)
├── build.json            ← auto-generated: current sha + builtAt
├── build-manifest.json   ← auto-generated: full build report
├── DEPLOYMENT_WORKFLOW.md← this file
├── STABILIZATION.md      ← stabilization checklist
├── scripts/
│   ├── build.js          ← full build pipeline (stamp + validate)
│   ├── stamp-build.js    ← stamps SHA into build.json + HTML files
│   ├── dev-server.js     ← local dev server with /api/* proxy
│   └── install-hooks.js  ← installs git pre-commit hook
├── tests/
│   ├── lifecycle.test.js ← 18 ticket lifecycle rule tests
│   └── run.js            ← 23 core logic tests (balance/grading/results/stake)
├── player.html           ← player sportsbook UI
├── index.html            ← host dashboard UI
├── dev.html              ← dev/preview entry
├── admin.html            ← admin panel
└── lobby.html            ← club lobby
```

---

## npm run commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start local dev server at localhost:3000 |
| `npm run verify` | Run all tests (must pass before deploy) |
| `npm run build` | Stamp SHA + syntax check + write manifest |
| `npm run stamp` | Stamp SHA only (no validation) |
| `npm run deploy:prod` | verify → build → vercel --prod --force |
| `npm run deploy:preview` | verify → build → vercel (preview URL) |

---

## Rules

1. **Never manually patch SHA** — let `stamp-build.js` do it
2. **Never deploy without `npm run verify` passing**
3. **Never test on Vercel if `PBS_BUILD_SHA` doesn't match `build.json`**
4. **Use `localhost:3000` for local testing** — always serves latest file
5. **The stale banner is the canary** — if it appears, the deploy didn't work
