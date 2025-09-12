#!/usr/bin/env node
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get the absolute path of the current script file
const __filename = fileURLToPath(import.meta.url);

// Get the absolute path of the directory containing the current script
const __dirname = path.dirname(__filename);
const scriptDir = __dirname;
const webAppDir = path.resolve(scriptDir, 'web-app');

console.log(`
    ============================
      FIREBASE CREATE TEMPLATE
    ============================
`)
await fs.copy(webAppDir, '.');
console.log(`
    ============================
    Template Created. Please run
    $ npm install
    ============================
    `)