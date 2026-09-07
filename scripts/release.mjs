#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');
const PACKAGE_PATH = join(ROOT, 'package.json');
const DEMO_HTML_PATH = join(ROOT, 'docs', 'index.html');

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

console.log('\n▸ Running lint, format check, typecheck, tests, build…\n');
run('npm run lint');
run('npm run format:check');
run('npm run typecheck');
run('npm run test');
run('npm run build');
run('npm run build:demo');

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

let lastTag = '';
try {
  lastTag = capture('git describe --tags --abbrev=0');
} catch {}
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
const SEP = '\x1f';
let log = '';
try {
  log = capture(`git log ${range} --no-merges --pretty=format:%s${SEP}%H`);
} catch {}
const commits = log ? log.split('\n').map((line) => line.split(SEP)[0]) : [];

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
  if (/^release:/i.test(subject)) continue;
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

const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
const marker = '\n## [';
const insertAt = changelog.indexOf(marker);
const updatedChangelog =
  insertAt === -1
    ? `${changelog.trimEnd()}\n\n${changelogEntry}\n`
    : `${changelog.slice(0, insertAt).trimEnd()}\n\n${changelogEntry}\n${changelog.slice(insertAt + 1)}`;
writeFileSync(CHANGELOG_PATH, updatedChangelog);
run(`npm version ${nextVersion} --no-git-tag-version`);

const demoHtml = readFileSync(DEMO_HTML_PATH, 'utf8');
const updatedDemoHtml = demoHtml.replace(/(class="version-pill">v)\d+\.\d+\.\d+(<\/span>)/, `$1${nextVersion}$2`);
writeFileSync(DEMO_HTML_PATH, updatedDemoHtml);

// docs/demo.ts imports from jsDelivr's unversioned URL (always latest), so there's no version
// string in it to bump — still rebuilt in case it changed for unrelated reasons this release.
run('npm run build:demo');

if (!skipConfirm) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    '\nCHANGELOG.md and package.json have been updated on disk (nothing committed yet).\n' +
      'Edit CHANGELOG.md now if the drafted entry needs fixing, then press Enter to commit,\n' +
      'tag, push, cut a GitHub release, and publish to npm — or Ctrl+C to abort.\n',
  );
  rl.close();
}

run('git add CHANGELOG.md package.json package-lock.json docs/index.html docs/demo.ts docs/demo.js');
run(`git commit -m "release: v${nextVersion}"`);

// npm publish before anything GitHub-facing: if it fails (2FA prompt, registry hiccup), the
// only cleanup needed is a local `git reset` — nothing public has been touched yet. Doing it
// last would leave a pushed tag and a public release pointing at a version that was never
// actually published, which isn't cleanly recoverable by re-running this script.
console.log('\n▸ Publishing to npm…\n');
run(`npm publish${otp ? ` --otp=${otp}` : ''}`);

run(`git tag -a v${nextVersion} -m "v${nextVersion}"`);
run(`git push origin ${branch}`);
run(`git push origin v${nextVersion}`);

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

console.log(`\n✔ Released v${nextVersion}.`);
console.log(`  https://github.com/kuttim/why-did-you-fetch/releases/tag/v${nextVersion}`);
console.log(`  https://www.npmjs.com/package/why-did-you-fetch/v/${nextVersion}`);
