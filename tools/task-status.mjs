#!/usr/bin/env node
// Usage: node tools/task-status.mjs T001 PASS "evidence text"
// Updates the status and evidence columns of one task row in task-plan.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [id, status, evidence = ''] = process.argv.slice(2);
if (!/^T\d{3}$/.test(id ?? '') || !status) {
  console.error('usage: task-status.mjs T### STATUS "evidence"');
  process.exit(1);
}
const file = fileURLToPath(new URL('../task-plan.md', import.meta.url));
const lines = readFileSync(file, 'utf8').split('\n');
const i = lines.findIndex((l) => l.startsWith(`| ${id} |`));
if (i < 0) {
  console.error(`task ${id} not found`);
  process.exit(1);
}
const cells = lines[i].split(' | ');
const desc = cells[1];
lines[i] = `| ${id} | ${desc} | ${status} | ${evidence.replace(/\|/g, '\|').replace(/\n/g, ' ')} |`;
writeFileSync(file, lines.join('\n'));
console.log(lines[i]);
