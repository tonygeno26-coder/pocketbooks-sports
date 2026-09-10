/**
 * Props heavy-list perf fixtures (100 / 300 / 500).
 * Measures filter + HTML string build + deferred DOM savings.
 * Run: node scripts/props-perf-bench.js
 */
'use strict';

var PROP_TYPES = [
  'Hits', 'Home Runs', 'Total Bases', 'RBIs', 'Stolen Bases',
  'Strikeouts', 'Walks', 'Pitcher Outs', 'Earned Runs', 'Singles'
];

function makeProps(n) {
  var props = [];
  for (var i = 0; i < n; i++) {
    var side = i % 2 === 0 ? 'over' : 'under';
    props.push({
      playerName: 'Player ' + (i % 40),
      team: i % 2 ? 'Away FC' : 'Home United',
      propType: PROP_TYPES[i % PROP_TYPES.length],
      side: side,
      line: 0.5 + (i % 5),
      odds: i % 3 === 0 ? -110 : (i % 3 === 1 ? 120 : -130),
      pick: 'Player ' + (i % 40) + ' ' + side + ' ' + (0.5 + (i % 5)),
      gameId: 'mlb:Away@Home-20260909',
      sport: 'mlb'
    });
  }
  return props;
}

function sectionize(props) {
  var sections = {};
  props.forEach(function (p) {
    var t = p.propType || 'Other';
    if (!sections[t]) sections[t] = [];
    sections[t].push(p);
  });
  return Object.keys(sections).map(function (title) {
    return { title: title, props: sections[title] };
  });
}

function filterTab(props, tabId) {
  if (tabId === 'popular') return props.slice(0, Math.min(40, props.length));
  if (tabId === 'all') return props;
  return props.filter(function (p) { return p.propType === tabId; });
}

function estimateEagerDomRows(sections, eagerSections, sectionLimit) {
  var rows = 0;
  sections.forEach(function (sec, idx) {
    if (idx >= eagerSections) return;
    rows += Math.min(sec.props.length, sectionLimit);
  });
  return rows;
}

function estimateFullDomRows(sections, sectionLimit) {
  var rows = 0;
  sections.forEach(function (sec) {
    rows += Math.min(sec.props.length, sectionLimit);
  });
  return rows;
}

function bench(n) {
  var props = makeProps(n);
  var t0 = process.hrtime.bigint();
  var filtered = filterTab(props, 'all');
  var t1 = process.hrtime.bigint();
  var sections = sectionize(filtered);
  var t2 = process.hrtime.bigint();
  var htmlBits = [];
  sections.forEach(function (sec, idx) {
    var defer = n >= 100 && idx >= 4;
    htmlBits.push('<sec title="' + sec.title + '" defer="' + defer + '" n="' + sec.props.length + '">');
    if (!defer) {
      var limit = Math.min(5, sec.props.length);
      for (var i = 0; i < limit; i++) {
        var p = sec.props[i];
        htmlBits.push('<row>' + p.playerName + '|' + p.propType + '|' + p.odds + '</row>');
      }
    } else {
      htmlBits.push('<slot rows="' + sec.props.length + '"></slot>');
    }
  });
  var html = htmlBits.join('');
  var t3 = process.hrtime.bigint();

  var eager = estimateEagerDomRows(sections, 4, 5);
  var full = estimateFullDomRows(sections, 5);
  return {
    n: n,
    sections: sections.length,
    filterMs: Number(t1 - t0) / 1e6,
    sectionizeMs: Number(t2 - t1) / 1e6,
    renderMs: Number(t3 - t2) / 1e6,
    totalMs: Number(t3 - t0) / 1e6,
    htmlBytes: Buffer.byteLength(html, 'utf8'),
    eagerDomRows: eager,
    fullDomRows: full,
    deferredSections: Math.max(0, sections.length - 4),
    marketsPreserved: filtered.length === props.length
  };
}

function main() {
  console.log('\n-- props heavy perf bench --\n');
  var sizes = [100, 300, 500];
  var results = sizes.map(bench);
  results.forEach(function (r) {
    console.log(
      'N=' + r.n +
      '  filter=' + r.filterMs.toFixed(2) + 'ms' +
      '  sectionize=' + r.sectionizeMs.toFixed(2) + 'ms' +
      '  render=' + r.renderMs.toFixed(2) + 'ms' +
      '  total=' + r.totalMs.toFixed(2) + 'ms' +
      '  html=' + r.htmlBytes + 'B' +
      '  DOM rows eager/full=' + r.eagerDomRows + '/' + r.fullDomRows +
      '  deferredSecs=' + r.deferredSections +
      '  preserved=' + r.marketsPreserved
    );
  });
  console.log('');
  return results;
}

if (require.main === module) {
  main();
}

module.exports = { makeProps: makeProps, sectionize: sectionize, filterTab: filterTab, bench: bench, main: main };
