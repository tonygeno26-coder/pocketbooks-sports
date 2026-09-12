(function (global) {
  'use strict';

  var entries = [
    { id:'nfl', label:'NFL' },
    { id:'mlb', label:'MLB' },
    { id:'nba', label:'NBA' },
    { id:'nhl', label:'NHL' },
    { id:'ncaaf', label:'NCAAF' },
    { id:'ncaab', label:'NCAAB' },
    { id:'soccer', label:'Soccer' },
    { id:'tennis', label:'Tennis' },
    { id:'golf', label:'Golf' },
    { id:'boxing', label:'Boxing' },
    { id:'mma', label:'MMA' },
    { id:'nascar', label:'NASCAR' },
    { id:'rugby', label:'Rugby' }
  ];

  global.PB_SPORTSBOOK_REGISTRY = Object.freeze(entries.map(function (entry) {
    return Object.freeze({ id:entry.id, label:entry.label });
  }));
})(window);
