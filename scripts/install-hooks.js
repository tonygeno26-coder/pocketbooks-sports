#!/usr/bin/env node
'use strict';
const fs   = require('fs');
const path = require('path');

const hookContent = `#!/bin/sh
# PocketBooks Sports pre-commit hook
# Stamps build.json + SHA into HTML before every commit
node scripts/stamp-build.js
git add build.json player.html index.html dev.html lobby.html admin.html 2>/dev/null || true
`;

const hookPath = path.resolve(__dirname, '../.git/hooks/pre-commit');
fs.writeFileSync(hookPath, hookContent);
fs.chmodSync(hookPath, '755');
console.log('✅ pre-commit hook installed');
