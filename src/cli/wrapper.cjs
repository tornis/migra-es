#!/usr/bin/env node

// Wrapper CommonJS para executar o código ES Module
// Necessário para compatibilidade com pkg

const { spawn } = require('child_process');
const path = require('path');

// Executar o código real com Node.js
const child = spawn(process.execPath, [
  '--loader', 'tsx',
  path.join(__dirname, 'index.jsx')
], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
