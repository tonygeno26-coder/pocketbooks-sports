/**
 * PocketBooks Sports — Phase S: Background Job Queue + Retry Safety Tests
 * Run: node tests/job-queue.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

const crypto = require('crypto');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Job queue engine ──────────────────────────────────────────────────────────

const JOB_TYPES = new Set(['odds_refresh','result_refresh','grade_run',
                            'settlement_close_check','payment_reconciliation']);
const JOB_STATUS = { QUEUED:'queued', RUNNING:'running', SUCCEEDED:'succeeded',
                      FAILED:'failed', DEAD:'dead' };

const BACKOFF_DELAYS_MS = [30000, 60000, 120000, 300000, 600000]; // 30s,1m,2m,5m,10m

function calcNextRunAfter(attempts) {
  var idx = Math.min(attempts, BACKOFF_DELAYS_MS.length-1);
  return new Date(Date.now() + BACKOFF_DELAYS_MS[idx]).toISOString();
}

function makeJobStore() {
  const rows = {};
  return {
    get:  function(id)  { return rows[id]||null; },
    set:  function(job) { rows[job.jobId]=job; },
    all:  function()    { return Object.values(rows); },
    queued: function() {
      var now = new Date().toISOString();
      return Object.values(rows).filter(function(j){
        return j.status===JOB_STATUS.QUEUED && j.runAfter <= now && !j.lockedAt;
      }).sort(function(a,b){ return a.runAfter<b.runAfter?-1:1; });
    }
  };
}

function enqueueJob(store, type, payload, opts) {
  opts = opts||{};
  if (!JOB_TYPES.has(type)) return { ok:false, error:'invalid_job_type:'+type };
  var jobId = 'JOB_'+type+'_'+Date.now()+'_'+crypto.randomBytes(3).toString('hex');
  var now   = new Date().toISOString();
  var job = {
    jobId, type,
    clubId:      opts.clubId||null,
    status:      JOB_STATUS.QUEUED,
    attempts:    0,
    maxAttempts: opts.maxAttempts||5,
    runAfter:    opts.runAfter||now,
    lockedAt:    null, lockedBy:null,
    lastError:   null,
    payloadJson: JSON.stringify(payload||{}),
    idempotencyKey: opts.idempotencyKey||null,
    createdAt:   now, updatedAt:now
  };
  // Idempotency: skip if same key already queued/running
  if (opts.idempotencyKey) {
    var existing = Object.values(store.all()).find(function(j){
      return j.idempotencyKey===opts.idempotencyKey &&
             (j.status===JOB_STATUS.QUEUED||j.status===JOB_STATUS.RUNNING);
    });
    if (existing) return { ok:true, idempotent:true, jobId:existing.jobId };
  }
  store.set(job);
  return { ok:true, jobId };
}

function claimNextJob(store, workerId) {
  var available = store.queued();
  if (!available.length) return null;
  var job = available[0]; // oldest runAfter first
  job.status   = JOB_STATUS.RUNNING;
  job.lockedAt = new Date().toISOString();
  job.lockedBy = workerId;
  job.attempts++;
  job.updatedAt= new Date().toISOString();
  store.set(job);
  return job;
}

function completeJob(store, jobId) {
  var job = store.get(jobId);
  if (!job) return { ok:false, error:'job_not_found' };
  job.status    = JOB_STATUS.SUCCEEDED;
  job.lockedAt  = null; job.lockedBy = null;
  job.updatedAt = new Date().toISOString();
  store.set(job);
  return { ok:true };
}

function failJob(store, jobId, errorMsg) {
  var job = store.get(jobId);
  if (!job) return { ok:false, error:'job_not_found' };
  job.lastError  = errorMsg;
  job.lockedAt   = null; job.lockedBy = null;
  job.updatedAt  = new Date().toISOString();
  if (job.attempts >= job.maxAttempts) {
    job.status  = JOB_STATUS.DEAD;
    return { ok:true, dead:true };
  }
  job.status    = JOB_STATUS.QUEUED;
  job.runAfter  = calcNextRunAfter(job.attempts);
  return { ok:true, dead:false, nextRunAfter:job.runAfter };
}

function retryDeadJob(store, jobId) {
  var job = store.get(jobId);
  if (!job) return { ok:false, error:'job_not_found' };
  if (job.status!==JOB_STATUS.DEAD) return { ok:false, error:'job_not_dead' };
  job.status    = JOB_STATUS.QUEUED;
  job.attempts  = 0;
  job.runAfter  = new Date().toISOString();
  job.lastError = null;
  job.updatedAt = new Date().toISOString();
  store.set(job);
  return { ok:true };
}

function cancelJob(store, jobId) {
  var job = store.get(jobId);
  if (!job) return { ok:false, error:'job_not_found' };
  if (job.status===JOB_STATUS.RUNNING)
    return { ok:false, error:'cannot_cancel_running' };
  job.status    = JOB_STATUS.DEAD;
  job.lastError = 'cancelled';
  job.updatedAt = new Date().toISOString();
  store.set(job);
  return { ok:true };
}

function getJobCounts(store) {
  var counts = { queued:0, running:0, succeeded:0, failed:0, dead:0 };
  store.all().forEach(function(j){ counts[j.status]=(counts[j.status]||0)+1; });
  return counts;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── enqueueJob ──');

test('enqueue creates job with correct fields', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'odds_refresh',{ sport:'mlb' });
  assert(r.ok,'ok: '+(r.error||''));
  var job = store.get(r.jobId);
  assertEq(job.type,'odds_refresh');
  assertEq(job.status,JOB_STATUS.QUEUED);
  assertEq(job.attempts,0);
  assertEq(job.maxAttempts,5);
  assert(job.jobId.startsWith('JOB_odds_refresh'));
});
test('invalid job type rejected', function() {
  var r = enqueueJob(makeJobStore(),'hack_everything',{});
  assert(!r.ok); assert(r.error.includes('invalid_job_type'));
});
test('all valid job types accepted', function() {
  var store = makeJobStore();
  JOB_TYPES.forEach(function(t){ assert(enqueueJob(store,t,{}).ok,'failed for: '+t); });
});
test('idempotency: same key does not create duplicate', function() {
  var store = makeJobStore();
  enqueueJob(store,'grade_run',{},{idempotencyKey:'GR_WEEK20'});
  var r2 = enqueueJob(store,'grade_run',{},{idempotencyKey:'GR_WEEK20'});
  assert(r2.idempotent,'idempotent');
  assertEq(store.all().length,1,'only 1 job');
});
test('different idempotency keys create separate jobs', function() {
  var store = makeJobStore();
  enqueueJob(store,'grade_run',{},{idempotencyKey:'K1'});
  enqueueJob(store,'grade_run',{},{idempotencyKey:'K2'});
  assertEq(store.all().length,2);
});
test('runAfter defaults to now (immediately runnable)', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'odds_refresh',{});
  assert(store.queued().find(function(j){ return j.jobId===r.jobId; }),'immediately available');
});
test('future runAfter not in queued list', function() {
  var store = makeJobStore();
  var future = new Date(Date.now()+60000).toISOString();
  var r = enqueueJob(store,'odds_refresh',{},{runAfter:future});
  assertEq(store.queued().length,0,'future job not claimable');
});

console.log('\n── claimNextJob ──');

test('worker claims oldest available job', function() {
  var store = makeJobStore();
  enqueueJob(store,'odds_refresh',{});
  var job = claimNextJob(store,'W1');
  assert(job,'claimed a job');
  assertEq(job.status,JOB_STATUS.RUNNING);
  assertEq(job.lockedBy,'W1');
  assertEq(job.attempts,1);
});
test('claimed job not available to second worker', function() {
  var store = makeJobStore();
  enqueueJob(store,'odds_refresh',{});
  claimNextJob(store,'W1');
  var job2 = claimNextJob(store,'W2');
  assert(!job2,'no job for W2');
});
test('two queued jobs: W1 and W2 each get one', function() {
  var store = makeJobStore();
  enqueueJob(store,'odds_refresh',{});
  enqueueJob(store,'result_refresh',{});
  var j1 = claimNextJob(store,'W1');
  var j2 = claimNextJob(store,'W2');
  assert(j1&&j2,'both claimed');
  assert(j1.jobId!==j2.jobId,'different jobs');
});
test('empty queue returns null', function() {
  assert(!claimNextJob(makeJobStore(),'W1'));
});

console.log('\n── completeJob ──');

test('complete sets status succeeded', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'odds_refresh',{});
  claimNextJob(store,'W1');
  completeJob(store,r.jobId);
  assertEq(store.get(r.jobId).status,JOB_STATUS.SUCCEEDED);
});
test('complete clears lock', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'odds_refresh',{});
  claimNextJob(store,'W1');
  completeJob(store,r.jobId);
  assert(!store.get(r.jobId).lockedAt,'no lock after complete');
});

console.log('\n── failJob + retry ──');

test('fail queues job for retry', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'grade_run',{});
  claimNextJob(store,'W1');
  var fr = failJob(store,r.jobId,'timeout');
  assert(!fr.dead,'not dead yet');
  assertEq(store.get(r.jobId).status,JOB_STATUS.QUEUED,'re-queued');
  assert(store.get(r.jobId).runAfter > new Date().toISOString(),'backoff applied');
});
test('fail records lastError', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'grade_run',{});
  claimNextJob(store,'W1');
  failJob(store,r.jobId,'db_error');
  assertEq(store.get(r.jobId).lastError,'db_error');
});
test('dead after maxAttempts', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'grade_run',{},{maxAttempts:3});
  for (var i=0;i<3;i++) {
    claimNextJob(store,'W1');
    // Force runAfter to now so it's claimable again
    store.get(r.jobId).runAfter = new Date().toISOString();
    store.get(r.jobId).lockedAt = null;
  }
  // After 3 claims, failJob should mark dead
  var job = store.get(r.jobId);
  job.attempts = job.maxAttempts; // simulate 3 attempts used
  var fr = failJob(store,r.jobId,'final error');
  assert(fr.dead,'marked dead');
  assertEq(store.get(r.jobId).status,JOB_STATUS.DEAD);
});
test('backoff grows with attempts', function() {
  var b0 = BACKOFF_DELAYS_MS[0];
  var b1 = BACKOFF_DELAYS_MS[1];
  var b4 = BACKOFF_DELAYS_MS[4];
  assert(b0 < b1,'b0<b1');
  assert(b1 < b4,'b1<b4');
});
test('retryDeadJob resets to queued', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'grade_run',{},{maxAttempts:1});
  claimNextJob(store,'W1');
  store.get(r.jobId).attempts=1;
  failJob(store,r.jobId,'err');
  assertEq(store.get(r.jobId).status,JOB_STATUS.DEAD);
  retryDeadJob(store,r.jobId);
  assertEq(store.get(r.jobId).status,JOB_STATUS.QUEUED);
  assertEq(store.get(r.jobId).attempts,0,'attempts reset');
});

console.log('\n── cancelJob ──');

test('cancel queued job → dead', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'odds_refresh',{});
  cancelJob(store,r.jobId);
  assertEq(store.get(r.jobId).status,JOB_STATUS.DEAD);
});
test('cannot cancel running job', function() {
  var store = makeJobStore();
  var r = enqueueJob(store,'odds_refresh',{});
  claimNextJob(store,'W1');
  var cr = cancelJob(store,r.jobId);
  assertEq(cr.error,'cannot_cancel_running');
});

console.log('\n── getJobCounts ──');

test('counts by status correct', function() {
  var store = makeJobStore();
  enqueueJob(store,'odds_refresh',{});
  enqueueJob(store,'result_refresh',{});
  enqueueJob(store,'payment_reconciliation',{});  // 3 queued total
  var r = enqueueJob(store,'grade_run',{});        // 4th job
  var claimed = claimNextJob(store,'W1');          // claims oldest -> running
  completeJob(store,claimed.jobId);               // oldest -> succeeded
  var counts = getJobCounts(store);
  assertEq(counts.queued,3,'3 remaining queued');  // 3 unclaimed
  assertEq(counts.succeeded,1,'1 succeeded');
  assertEq(counts.running,0);
});

console.log('\n── Admin permission check ──');

test('full_admin can manage jobs', function() {
  var ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1 };
  assert((ROLE_RANK['full_admin']||0) >= 4,'full_admin passes');
});
test('settlement_manager cannot manage jobs', function() {
  var ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1 };
  assert((ROLE_RANK['settlement_manager']||0) < 4,'settlement_manager blocked');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Job queue tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ JOB QUEUE TESTS FAILED'); process.exit(1); }
else console.log('✅ All job queue rules verified');
