'use strict';

var fs = require('fs');
var path = require('path');

var pass = 0;
var fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK ' + name);
    pass++;
  } catch (e) {
    console.error('  FAIL ' + name + '\n     ' + e.message);
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'expected true');
}

var html = fs.readFileSync(path.join(__dirname, '..', 'dev.html'), 'utf8');

console.log('\n-- Dev Preview join requests --');

test('Dev Preview has a real Join Requests panel', function() {
  assert(html.indexOf('JOIN REQUESTS') !== -1 || html.indexOf('Join Requests') !== -1,
    'missing join requests panel title');
  assert(html.indexOf('Test Club · TEST123 · pending only') !== -1,
    'panel must be scoped to the beta club');
  assert(html.indexOf('id="jrp-list"') !== -1,
    'missing join request list container');
});

test('panel fetches only pending requests for the host club', function() {
  assert(html.indexOf('/api/club/pending-requests?clubId=') !== -1,
    'must use host-scoped pending request endpoint');
  assert(html.indexOf('HOST_BYPASS.clubId') !== -1,
    'must scope requests to configured beta club id');
  assert(html.indexOf('pending only') !== -1,
    'UI should make pending-only behavior explicit');
});

test('panel renders player identity, status, approve, and deny', function() {
  assert(html.indexOf('requestDisplayName') !== -1,
    'missing player display name helper');
  assert(html.indexOf('Requested club: Test Club') !== -1,
    'missing requested club label');
  assert(html.indexOf('<span class="jrp-status">Pending</span>') !== -1,
    'missing pending status badge');
  assert(html.indexOf('data-jrp-action="approve"') !== -1,
    'missing approve button action');
  assert(html.indexOf('data-jrp-action="deny"') !== -1,
    'missing deny button action');
});

test('actions verify actual membership state before success', function() {
  assert(html.indexOf('async function verifyMembershipStatus') !== -1,
    'missing membership verification helper');
  assert(html.indexOf("'/api/auth/token'") !== -1 && html.indexOf('actorId: String(playerId)') !== -1,
    'verification must ask backend to resolve actual membership');
  assert(html.indexOf('returned ok, but membership verification failed.') !== -1,
    'actions must fail visibly if verification fails');
});

test('actions use existing backend approval system', function() {
  assert(html.indexOf("'/api/club/members/approve'") !== -1,
    'approve must use backend membership transition endpoint');
  assert(html.indexOf("'/api/club/members/deny'") !== -1,
    'deny must use backend membership transition endpoint');
  assert(html.indexOf('and verified membership state for') !== -1,
    'success message must follow verification');
});

console.log('\nDev Preview join request tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
