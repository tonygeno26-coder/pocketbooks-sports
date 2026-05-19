/**
 * PocketBooks Sports — Phase U: Admin System Panel Tests
 * Run: node tests/admin-panel.test.js
 * Tests pure data-shaping/render logic (no DOM).
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Admin visibility gate ─────────────────────────────────────────────────────

const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

function canSeeAdminPanel(role, platformRole) {
  if (platformRole === 'platform_admin') return true;
  return (ROLE_RANK[role]||0) >= ROLE_RANK.full_admin;
}

// ── Health card view model ────────────────────────────────────────────────────

function buildHealthCardVM(health) {
  const ok     = !!(health && health.ok);
  const dbOk   = health && health.dbStatus === 'connected';
  const uptime = health ? health.uptime : null;
  return {
    ok,
    statusLabel:    ok ? '✅ Healthy'   : '❌ Degraded',
    statusColor:    ok ? '#10b981'      : '#ef4444',
    dbStatus:       health ? health.dbStatus : 'unknown',
    dbStatusLabel:  dbOk ? '🟢 Connected' : '🔴 ' + (health&&health.dbStatus||'unknown'),
    oddsStatus:     health ? health.oddsStatus : 'unknown',
    uptimeLabel:    uptime != null ? Math.floor(uptime/60) + 'm' : '—',
    version:        health ? (health.version||'—') : '—',
    lastOdds:       health ? health.lastOddsSuccessAt : null
  };
}

// ── Diagnostics card view model ───────────────────────────────────────────────

function buildDiagnosticsCardVM(diag) {
  if (!diag || !diag.ok) return { ok:false };
  const jc  = diag.jobCounts||{};
  const sc  = diag.sessionCounts||{};
  const sp  = diag.settlementStats||{};
  const aec = diag.auditEventCounts||{};
  const rlTotal = (diag.rateLimitStats&&diag.rateLimitStats.totalKeys)||0;
  const warnings = [];
  if (jc.dead>0)        warnings.push(jc.dead+' dead jobs');
  if (jc.failed>0)      warnings.push(jc.failed+' failed jobs');
  if (diag.rpcFailCount>0) warnings.push(diag.rpcFailCount+' RPC failures');
  if (aec.rate_limited>0)  warnings.push(aec.rate_limited+' rate limited');
  return {
    ok: true,
    jobCounts:        jc,
    sessionCounts:    sc,
    settlementStats:  sp,
    rateLimitKeys:    rlTotal,
    rpcFailCount:     diag.rpcFailCount||0,
    auditWarnings:    aec,
    warnings,
    hasWarnings:      warnings.length > 0
  };
}

// ── Job list view model ───────────────────────────────────────────────────────

function buildJobsVM(jobs) {
  return (jobs||[]).map(function(j) {
    var statusColor = {
      queued:'#3b82f6', running:'#f59e0b',
      succeeded:'#10b981', failed:'#ef4444', dead:'#6b7280'
    }[j.status]||'#555';
    return {
      jobId:       j.job_id||j.jobId,
      type:        j.type,
      status:      j.status,
      statusColor,
      attempts:    j.attempts,
      maxAttempts: j.max_attempts||j.maxAttempts||5,
      lastError:   j.last_error||j.lastError||null,
      updatedAt:   j.updated_at||j.updatedAt||null,
      canRetry:    j.status==='dead',
      canCancel:   j.status==='queued'||j.status==='failed'
    };
  });
}

// ── Event list view model ─────────────────────────────────────────────────────

function buildEventsVM(events, limit) {
  limit = limit||25;
  return (events||[]).slice(-limit).reverse().map(function(ev) {
    var payload = ev.payload_json||ev.payloadJson||{};
    var preview = Object.keys(payload).slice(0,2).map(function(k){
      return k+':'+JSON.stringify(payload[k]);
    }).join(', ');
    return {
      eventId:   ev.event_id||ev.eventId,
      type:      ev.type,
      playerId:  ev.player_id||ev.playerId||null,
      createdAt: ev.created_at||ev.createdAt,
      preview:   preview ? preview.slice(0,60) : '—'
    };
  });
}

// ── Enqueue payload builder ───────────────────────────────────────────────────

function buildEnqueuePayload(type, clubId, opts) {
  var VALID = new Set(['odds_refresh','result_refresh','grade_run',
                       'settlement_close_check','payment_reconciliation']);
  if (!VALID.has(type)) return { ok:false, error:'invalid_type' };
  return { ok:true, payload:{ type, payload:opts&&opts.payload||{}, clubId:clubId||null,
                               maxAttempts:opts&&opts.maxAttempts||5 } };
}

// ── Toast message mapping ─────────────────────────────────────────────────────

function mapAdminJobError(code) {
  return { job_not_found:'Job not found',
           cannot_cancel_running:'Cannot cancel a running job',
           job_not_dead:'Job is not dead — only dead jobs can be retried',
           insufficient_role:'Insufficient permissions' }[code]
         || 'Error: '+(code||'unknown');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Admin panel visibility ──');

test('owner sees admin panel', function() {
  assert(canSeeAdminPanel('owner'));
});
test('full_admin sees admin panel', function() {
  assert(canSeeAdminPanel('full_admin'));
});
test('platform_admin sees admin panel', function() {
  assert(canSeeAdminPanel('view_only','platform_admin'));
});
test('settlement_manager cannot see admin panel', function() {
  assert(!canSeeAdminPanel('settlement_manager'));
});
test('risk_viewer cannot see admin panel', function() {
  assert(!canSeeAdminPanel('risk_viewer'));
});
test('player cannot see admin panel', function() {
  assert(!canSeeAdminPanel('player'));
});

console.log('\n── Health card view model ──');

test('healthy response → ok=true, green label', function() {
  var vm = buildHealthCardVM({ ok:true, dbStatus:'connected', uptime:3600, version:'1.0', oddsStatus:'healthy' });
  assert(vm.ok); assertEq(vm.statusLabel,'✅ Healthy');
  assertEq(vm.dbStatusLabel,'🟢 Connected');
  assertEq(vm.uptimeLabel,'60m');
});
test('degraded response → ok=false, red label', function() {
  var vm = buildHealthCardVM({ ok:false, dbStatus:'error', uptime:0, oddsStatus:'unknown' });
  assert(!vm.ok); assertEq(vm.statusLabel,'❌ Degraded');
  assert(vm.dbStatusLabel.includes('🔴'));
});
test('null health → safe defaults', function() {
  var vm = buildHealthCardVM(null);
  assert(!vm.ok); assertEq(vm.dbStatus,'unknown'); assertEq(vm.uptimeLabel,'—');
});
test('uptime in minutes', function() {
  var vm = buildHealthCardVM({ ok:true, dbStatus:'connected', uptime:125 }); // 2min5s
  assertEq(vm.uptimeLabel,'2m');
});

console.log('\n── Diagnostics card view model ──');

test('clean diagnostics → no warnings', function() {
  var vm = buildDiagnosticsCardVM({ ok:true, jobCounts:{ queued:1,running:0,succeeded:10,failed:0,dead:0 },
    sessionCounts:{ active:5,revoked:1 }, settlementStats:{ openPeriods:1,closedPeriods:3 },
    rpcFailCount:0, auditEventCounts:{}, rateLimitStats:{ totalKeys:2 } });
  assert(vm.ok); assert(!vm.hasWarnings,'no warnings');
});
test('dead jobs → warning', function() {
  var vm = buildDiagnosticsCardVM({ ok:true, jobCounts:{ dead:2,failed:0 }, rpcFailCount:0,
    auditEventCounts:{}, rateLimitStats:{} });
  assert(vm.hasWarnings,'has warnings');
  assert(vm.warnings.some(function(w){ return w.includes('dead'); }));
});
test('rpc failures → warning', function() {
  var vm = buildDiagnosticsCardVM({ ok:true, jobCounts:{ dead:0,failed:0 }, rpcFailCount:3,
    auditEventCounts:{}, rateLimitStats:{} });
  assert(vm.warnings.some(function(w){ return w.includes('RPC'); }));
});
test('rate limit hits → warning', function() {
  var vm = buildDiagnosticsCardVM({ ok:true, jobCounts:{ dead:0,failed:0 }, rpcFailCount:0,
    auditEventCounts:{ rate_limited:5 }, rateLimitStats:{} });
  assert(vm.warnings.some(function(w){ return w.includes('rate limited'); }));
});
test('null diagnostics → ok:false', function() {
  assert(!buildDiagnosticsCardVM(null).ok);
});

console.log('\n── Jobs view model ──');

test('queued job: canRetry=false canCancel=true', function() {
  var vms = buildJobsVM([{ job_id:'J1',type:'grade_run',status:'queued',attempts:0,max_attempts:5 }]);
  assert(!vms[0].canRetry,'no retry on queued');
  assert(vms[0].canCancel,'can cancel queued');
});
test('dead job: canRetry=true canCancel=false', function() {
  var vms = buildJobsVM([{ job_id:'J1',type:'grade_run',status:'dead',attempts:5,max_attempts:5 }]);
  assert(vms[0].canRetry,'can retry dead');
  assert(!vms[0].canCancel,'cannot cancel dead');
});
test('succeeded job: neither', function() {
  var vms = buildJobsVM([{ job_id:'J1',type:'odds_refresh',status:'succeeded',attempts:1,max_attempts:5 }]);
  assert(!vms[0].canRetry); assert(!vms[0].canCancel);
});
test('status colors correct', function() {
  var vms = buildJobsVM([
    { job_id:'J1',type:'odds_refresh',status:'running',attempts:1,max_attempts:5 },
    { job_id:'J2',type:'grade_run',status:'dead',attempts:5,max_attempts:5 }
  ]);
  assertEq(vms[0].statusColor,'#f59e0b','running=amber');
  assertEq(vms[1].statusColor,'#6b7280','dead=gray');
});
test('lastError preserved', function() {
  var vms = buildJobsVM([{ job_id:'J1',type:'grade_run',status:'dead',
    attempts:5,max_attempts:5,last_error:'connection timeout' }]);
  assertEq(vms[0].lastError,'connection timeout');
});

console.log('\n── Events view model ──');

test('events shown newest first (up to limit)', function() {
  var evs = [
    { event_id:'E1',type:'ticket_placed',created_at:'2026-05-01T01:00:00Z',payload_json:{ ticketId:'T1' } },
    { event_id:'E2',type:'balance_changed',created_at:'2026-05-01T02:00:00Z',payload_json:{ amount:100 } }
  ];
  var vm = buildEventsVM(evs, 25);
  assertEq(vm[0].eventId,'E2','newest first');
  assertEq(vm[1].eventId,'E1');
});
test('payload preview truncated to 60 chars', function() {
  var ev = { event_id:'E1',type:'job_failed',created_at:'2026-05-01T00:00:00Z',
    payload_json:{ jobId:'JOB_grade_run_very_long_name_here', type:'grade_run', someExtraKey:'value123' } };
  var vm = buildEventsVM([ev]);
  assert(vm[0].preview.length<=60,'preview: '+vm[0].preview.length+' chars');
});
test('empty events → empty list', function() {
  assertEq(buildEventsVM([]).length,0);
});
test('limit respected', function() {
  var evs = [];
  for (var i=0;i<30;i++) evs.push({ event_id:'E'+i,type:'job_completed',created_at:'2026-05-01T00:00:0'+Math.min(i,9)+'Z',payload_json:{} });
  assertEq(buildEventsVM(evs,25).length,25,'limited to 25');
});

console.log('\n── Enqueue payload builder ──');

test('valid grade_run payload', function() {
  var r = buildEnqueuePayload('grade_run','C1',{ payload:{ daysBack:3 } });
  assert(r.ok); assertEq(r.payload.type,'grade_run');
  assertEq(r.payload.clubId,'C1');
});
test('invalid type → error', function() {
  assert(!buildEnqueuePayload('hack_db','C1').ok);
});
test('all valid job types accepted', function() {
  ['odds_refresh','result_refresh','grade_run','settlement_close_check','payment_reconciliation'].forEach(function(t){
    assert(buildEnqueuePayload(t,'C1').ok,'failed for: '+t);
  });
});

console.log('\n── Toast messages ──');

test('job_not_dead maps to readable message', function() {
  assert(mapAdminJobError('job_not_dead').includes('dead'));
});
test('cannot_cancel_running maps correctly', function() {
  assert(mapAdminJobError('cannot_cancel_running').includes('running'));
});
test('unknown code → fallback', function() {
  assert(mapAdminJobError('some_mystery_code').includes('some_mystery_code'));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Admin panel tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ ADMIN PANEL TESTS FAILED'); process.exit(1); }
else console.log('✅ All admin panel rules verified');
