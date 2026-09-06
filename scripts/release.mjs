#!/usr/bin/env node
/**
 * One-command release.
 *
 * Bumps the version, drafts a CHANGELOG.md entry from the commits since the last tag (grouped
 * into Keep a Changelog sections, same format as the rest of the file), pauses so you can review
 * or hand-edit that entry, then commits, tags, pushes, cuts a GitHub release (reusing the exact
 * same changelog text as the release notes), and publishes to npm.
 *
 * Usage:
 *   npm run release -- patch|minor|major     bump from the current version
 *   npm run release -- 1.2.3                 or set an explicit version
 *   npm run release -- minor --dry-run       draft the changelog only, touch nothing else
 *   npm run release -- minor --yes           skip the review pause (non-interactive)
 *   npm run release -- minor --otp=123456    forward a 2FA code to `npm publish`
 *
 * Conventional-commit prefixes (feat/fix/perf/refactor/docs/build/revert) are sorted into
 * Added/Changed/Fixed; chore/ci/test/style commits are left out of the changelog by default.
 * Anything else (no recognized prefix) lands under "Changed" verbatim so nothing is silently
 * dropped — the review pause is there so you can fix wording or move entries before it's final.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');
const PACKAGE_PATH = join(ROOT, 'package.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipConfirm = args.includes('--yes');
const otp = args.find((a) => a.startsWith('--otp='))?.slice('--otp='.length);
const bumpArg = args.find((a) => !a.startsWith('--'));

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}
function capture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}
function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

// ---------- 1. preconditions ----------
if (!bumpArg) {
  fail('Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run] [--yes] [--otp=123456]');
}

const branch = capture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'master' && branch !== 'main') {
  fail(`Refusing to release from branch "${branch}" (expected master/main).`);
}

if (capture('git status --porcelain')) {
  fail('Working tree is not clean. Commit or stash your changes first.');
}

run('git fetch origin');
if (capture(`git rev-list --count ${branch}..origin/${branch}`) !== '0') {
  fail(`Local ${branch} is behind origin/${branch} — pull first.`);
}

try {
  capture('gh auth status');
} catch {
  fail('gh is not authenticated — run `gh auth login` first.');
}
try {
  capture('npm whoami');
} catch {
  fail('npm is not authenticated — run `npm login` first.');
}

// ---------- 2. fail fast, before anything touches git state ----------
console.log('\n▸ Running lint, typecheck, tests, build…\n');
run('npm run lint');
run('npm run typecheck');
run('npm run test');
run('npm run build');

// ---------- 3. compute next version ----------
function resolveVersion(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = current.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  fail(`Don't know how to bump "${bump}" — use patch, minor, major, or an explicit x.y.z.`);
}

const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
const nextVersion = resolveVersion(pkg.version, bumpArg);
console.log(`\n▸ ${pkg.version} → ${nextVersion}`);

// ---------- 4. gather commits since the last tag ----------
let lastTag = '';
try {
  lastTag = capture('git describe --tags --abbrev=0');
} catch {
  // no tags yet — the changelog will cover the full history
}
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
const SEP = '';
let log = '';
try {
  log = capture(`git log ${range} --no-merges --pretty=format:%s${SEP}%H`);
} catch {
  // empty repo — nothing to log
}
const commits = log ? log.split('\n').map((line) => line.split(SEP)[0]) : [];

// ---------- 5. categorize by conventional-commit prefix ----------
const SECTION_BY_TYPE = {
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Changed',
  refactor: 'Changed',
  docs: 'Changed',
  build: 'Changed',
  revert: 'Changed',
};
const SKIP_TYPES = new Set(['chore', 'ci', 'test', 'style']);
const SECTION_ORDER = ['Added', 'Changed', 'Fixed', 'Deprecated', 'Removed', 'Security'];

const sections = {};
for (const subject of commits) {
  if (/^release:/i.test(subject)) continue; // don't fold prior releases into this one
  const match = subject.match(/^(\w+)(\([^)]*\))?!?:\s*(.+)$/);
  let section = 'Changed';
  let text = subject;
  if (match) {
    const [, type, , rest] = match;
    if (SKIP_TYPES.has(type)) continue;
    section = SECTION_BY_TYPE[type] ?? 'Changed';
    text = rest;
  }
  text = text.charAt(0).toUpperCase() + text.slice(1);
  (sections[section] ??= []).push(text);
}

if (Object.keys(sections).length === 0) {
  console.warn(
    '\n⚠ No categorizable commits found since the last tag — the drafted entry will be' +
      ' empty. Edit it by hand during the review pause below.',
  );
}

// ---------- 6. build the changelog entry ----------
const today = new Date().toISOString().slice(0, 10);
const bodyLines = [];
for (const section of SECTION_ORDER) {
  if (!sections[section]?.length) continue;
  bodyLines.push(`### ${section}`, '');
  for (const text of sections[section]) bodyLines.push(`- ${text}`);
  bodyLines.push('');
}
const notesBody = bodyLines.join('\n').trim();
const changelogEntry = `## [${nextVersion}] - ${today}\n\n${notesBody}\n`;

console.log(`\n${'—'.repeat(60)}\nDrafted CHANGELOG.md entry:\n${'—'.repeat(60)}\n`);
console.log(changelogEntry);
console.log('—'.repeat(60));

if (dryRun) {
  console.log('\n(dry run — nothing was written, committed, or published)');
  process.exit(0);
}

// ---------- 7. write CHANGELOG.md + bump package.json (not committed yet) ----------
const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
const marker = '\n## [';
const insertAt = changelog.indexOf(marker);
const updatedChangelog =
  insertAt === -1
    ? `${changelog.trimEnd()}\n\n${changelogEntry}\n`
    : `${changelog.slice(0, insertAt).trimEnd()}\n\n${changelogEntry}\n${changelog.slice(insertAt + 1)}`;
writeFileSync(CHANGELOG_PATH, updatedChangelog);
run(`npm version ${nextVersion} --no-git-tag-version`);

// ---------- 8. pause for review ----------
if (!skipConfirm) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    '\nCHANGELOG.md and package.json have been updated on disk (nothing committed yet).\n' +
      'Edit CHANGELOG.md now if the drafted entry needs fixing, then press Enter to commit,\n' +
      'tag, push, cut a GitHub release, and publish to npm — or Ctrl+C to abort.\n',
  );
  rl.close();
}

// ---------- 9. commit, tag, push (commit first, then tag — never re-point an already-tagged
//              commit once a GitHub release might reference it) ----------
run('git add CHANGELOG.md package.json package-lock.json');
run(`git commit -m "release: v${nextVersion}"`);
run(`git tag -a v${nextVersion} -m "v${nextVersion}"`);
run(`git push origin ${branch}`);
run(`git push origin v${nextVersion}`);

// ---------- 10. GitHub release — re-read the changelog so any manual edits during the pause
//               are reflected in the release notes too ----------
const finalChangelog = readFileSync(CHANGELOG_PATH, 'utf8');
const escapedVersion = nextVersion.replace(/\./g, '\\.');
const finalEntryMatch = finalChangelog.match(
  new RegExp(`## \\[${escapedVersion}\\][^\\n]*\\n\\n([\\s\\S]*?)(?=\\n## \\[|$)`),
);
const finalNotes = (finalEntryMatch?.[1] ?? notesBody).trim();
const notesFile = join(tmpdir(), `wdyf-release-notes-${nextVersion}.md`);
writeFileSync(notesFile, finalNotes);
try {
  run(`gh release create v${nextVersion} --title "v${nextVersion}" --notes-file "${notesFile}"`);
} finally {
  unlinkSync(notesFile);
}

// ---------- 11. publish ----------
console.log('\n▸ Publishing to npm…\n');
run(`npm publish${otp ? ` --otp=${otp}` : ''}`);

console.log(`\n✔ Released v${nextVersion}.`);
console.log(`  https://github.com/kuttim/why-did-you-fetch/releases/tag/v${nextVersion}`);
console.log(`  https://www.npmjs.com/package/why-did-you-fetch/v/${nextVersion}`);
