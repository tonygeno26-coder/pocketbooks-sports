'use strict';

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'survivor.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)[1];
let pass = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK ' + name);
    pass++;
  } catch (error) {
    console.error('  FAIL ' + name + '\n     ' + error.message);
    process.exitCode = 1;
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message || 'expected true');
}
function extract(name, nextName) {
  const start = script.indexOf('function ' + name);
  const end = script.indexOf('function ' + nextName, start + 1);
  assert(start >= 0 && end > start, 'could not extract ' + name);
  return script.slice(start, end);
}

console.log('\n-- survivor read-only regression --');

test('premium home keeps create and join actions', function () {
  assert(html.includes('id="view-home"'));
  assert(html.includes("openModal('modal-create')"));
  assert(html.includes("openModal('modal-join')"));
  assert(html.includes('One pick. Every week. Stay alive.'));
});

test('pool and player text is escaped before HTML rendering', function () {
  const escDef = script.match(/function esc\(s\)\{[\s\S]*?\n\}/);
  assert(escDef && escDef[0].includes("replace(/[&<>\"']/g"), 'escape helper missing');
  assert(/esc\(p\.name\)/.test(script), 'pool name must use esc');
  assert(/esc\(displayName\(p\)\)/.test(script), 'standings name must use esc');
});

test('used-team identity remains scoped by entry and phase', function () {
  const body = extract('usedListForEntry', 'usedMapForWeek');
  assert(body.includes('entryNumber'));
  assert(body.includes('survivorPhase'));
  assert(body.includes('pn !== n'));
});

test('pick submission sends pool week and entry number', function () {
  const body = extract('submitPick', 'gradeWeek');
  assert(body.includes('week: week'));
  assert(body.includes('team: team'));
  assert(body.includes('entryNumber: currentEntryNumber || 1'));
  assert(body.includes('picksAreLocked(currentDetail)'));
});

test('host controls depend on server detail host flag', function () {
  assert(script.includes("!detail.isHost || pool.status!=='active'"));
  assert(script.includes("if (detail.isHost)"));
  assert(script.includes("if (tab === 'requests' && !(currentDetail && currentDetail.isHost))"));
});

test('mobile controls keep 44px targets and single-column actions', function () {
  assert(/@media \(max-width:400px\)[\s\S]*?\.row-btns\{grid-template-columns:1fr\}/.test(html));
  assert(html.includes('min-height:44px'));
});

console.log('\nSurvivor regression tests: ' + pass + ' passed');
