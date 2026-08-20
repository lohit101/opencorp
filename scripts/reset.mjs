#!/usr/bin/env node
/**
 * OpenCorp full reset.
 *
 * Wipes all runtime state so you can start fresh:
 *   - Stops the running dev server(s)
 *   - Deletes the SQLite database (prisma/opencorp.db) + journal
 *   - Deletes agent workspace sandbox mounts (.workspaces/)
 *   - Recreates a clean, empty database with the current Prisma schema
 *   - Regenerates the Prisma client
 *
 * Only RUNTIME state is removed. Source code, packages, and config are untouched.
 *
 * Usage:
 *   npm run reset
 */
import { spawnSync } from 'node:child_process';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'prisma', 'opencorp.db');
const dbJournal = join(root, 'prisma', 'opencorp.db-journal');
const workspacesDir = join(root, '.workspaces');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
  if (res.status !== 0) {
    console.error(`\n✗ Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(res.status ?? 1);
  }
  return res;
}

console.log('🧹 OpenCorp reset — wiping runtime state...\n');

// 1. Stop any running Next.js dev server(s)
console.log('[1/5] Stopping dev server(s)...');
for (const port of [3000, 3002]) {
  const lsof = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
  const pids = (lsof.stdout ?? '').trim().split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
      console.log(`     stopped process ${pid} on port ${port}`);
    } catch {
      /* already gone */
    }
  }
}

// 2. Delete the SQLite database
console.log('\n[2/5] Deleting database...');
for (const p of [dbPath, dbJournal]) {
  if (existsSync(p)) {
    rmSync(p, { force: true });
    console.log(`     removed ${p.replace(root, '.')}`);
  }
}

// 3. Delete agent workspace sandbox mounts
console.log('\n[3/5] Deleting agent workspaces...');
if (existsSync(workspacesDir)) {
  rmSync(workspacesDir, { recursive: true, force: true });
  console.log('     removed .workspaces/');
}

// 4. Recreate the database with a clean schema
console.log('\n[4/5] Recreating empty database...');
run('npx', ['prisma', 'db', 'push', '--skip-generate']);

// 5. Regenerate the Prisma client
console.log('\n[5/5] Regenerating Prisma client...');
run('npx', ['prisma', 'generate']);

mkdirSync(dirname(dbPath), { recursive: true });
console.log('\n✅ Reset complete. Run `npm run dev` to start fresh.');
console.log('   Tip: your company and agents are gone; recreate them in the UI.');