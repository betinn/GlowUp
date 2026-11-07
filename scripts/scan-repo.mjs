#!/usr/bin/env node
/**
 * Public-repo hygiene scan. Run before every commit and on the final build.
 * Looks for local absolute paths, secrets, e-mails and third-party product names
 * in tracked files, untracked non-ignored files, commit messages and `dist/`.
 * The product-name list is stored in ROT13 so this file does not contain the words.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const rot13 = (s) =>
  s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

const PRODUCTS = [
  'nveoehfu',
  'snprghar',
  'cubgbfubc',
  'yvtugebbz',
  'fancfrrq',
  'ifpb',
  'cvpfneg',
  'crexl',
  'lbhpnz',
  'zrvghf',
  'erzvav',
  'cvkryzngbe',
].map(rot13);

const RULES = [
  { name: 'windows-path', re: /\b[A-Za-z]:[\\/](?:Users|Windows|Program Files)[\\/]/ },
  { name: 'unix-home', re: /(?<![\w.-])\/(?:home|Users)\/[A-Za-z0-9._-]+/ },
  { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'token',
    re: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{24,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
  },
  {
    name: 'email',
    re: /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org)\b|glowup\.invalid\b|anthropic\.com\b)[A-Za-z0-9-]+\.[A-Za-z]{2,}\b/,
  },
  {
    name: 'ipv4',
    re: /(?<![\d.])(?!127\.0\.0\.1\b|0\.0\.0\.0\b)(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])\.\d{1,3}\.\d{1,3}\.\d{1,3}(?![\d.])/,
  },
  { name: 'product', re: new RegExp(`\\b(?:${PRODUCTS.join('|')})\\b`, 'i') },
];

const TEXT =
  /\.(ts|js|mjs|cjs|svelte|html|css|json|md|glsl|frag|vert|yml|yaml|toml|txt|webmanifest|svg|conf|example)$|(^|[\\/])(Caddyfile|\.gitignore)$/;
const SKIP_RULES = { 'package-lock.json': ['ipv4', 'email'] };

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
if (existsSync('dist')) files.push(...walk('dist'));

const hits = [];
const check = (label, text, skip = []) => {
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) {
      if (skip.includes(rule.name)) continue;
      const m = rule.re.exec(line);
      if (m) hits.push(`${label}:${i + 1} [${rule.name}] ${m[0].slice(0, 60)}`);
    }
  });
};

for (const file of files) {
  if (!existsSync(file) || !TEXT.test(file)) continue;
  const base = file.split(/[\\/]/).pop();
  check(file, readFileSync(file, 'utf8'), SKIP_RULES[base] ?? []);
}

let log = '';
try {
  log = git('log', '--all', '--format=%an <%ae>%n%B');
} catch {
  log = '';
}
check('git-log', log);

if (hits.length) {
  console.error(`scan: ${hits.length} problema(s) encontrado(s):`);
  for (const h of hits.slice(0, 80)) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`scan: ok (${files.length} arquivos, histórico incluído)`);
