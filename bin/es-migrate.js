#!/usr/bin/env node

/**
 * Global entry-point for `migra-es`.
 *
 * Uses tsx's programmatic ESM loader so the JSX source files are executed
 * directly by the installed Node.js runtime — no separate build step needed,
 * no spawn of a child process.
 *
 * tsx is in `dependencies` so it is always present when the package is
 * installed globally via `npm install -g migra-es`.
 */

import { register } from 'tsx/esm/api';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

register();

const __dirname  = dirname(fileURLToPath(import.meta.url));
const entryPoint = join(__dirname, '..', 'src', 'cli', 'index.jsx');

await import(entryPoint);
