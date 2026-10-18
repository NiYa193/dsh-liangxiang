import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd();
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const policyPath = process.env.LIANGXIANG_PRIVACY_POLICY || join(root, '.privacy-policy.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const blocked = new Map();
for (const item of policy.blocked_phrase_hashes) {
  if (!blocked.has(item.length)) blocked.set(item.length, new Set());
  blocked.get(item.length).add(item.sha256);
}

export function inspectText(value, phrasePolicy = blocked) {
  const text = value.normalize('NFKC');
  const findings = new Set();
  // The policy stores digests only: private conversation labels never become
  // public fixtures, regular expressions or diagnostic excerpts themselves.
  for (const run of text.match(/\p{Script=Han}+/gu) ?? []) {
    const chars = [...run];
    for (const [length, hashes] of phrasePolicy) {
      for (let i = 0; i + length <= chars.length; i++) {
        const digest = createHash('sha256').update(chars.slice(i, i + length).join('')).digest('hex');
        if (hashes.has(digest)) findings.add('private-context');
      }
    }
  }
  if (/(?:\/Users\/|\/home\/)(?!runner(?:\/|\b))[a-zA-Z0-9._-]+(?:\/|\b)|[A-Z]:\\Users\\[a-zA-Z0-9._-]+/i.test(text)) findings.add('personal-path');
  if (/\/var\/folders\/|codex:\/\/threads\/|\.codex\/sessions\/|\b01[0-9a-f]{6}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text)) findings.add('private-session');
  if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,})\b/.test(text)) findings.add('credential');
  for (const email of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
    if (!safeEmail(email)) findings.add('personal-email');
  }
  return [...findings];
}

export function safeEmail(email) {
  return /^[^@\s]+@users\.noreply\.github\.com$/i.test(email) ||
    ['noreply@github.com', 'noreply@anthropic.com', 'noreply@openai.com'].includes(email.toLowerCase()) ||
    /@(?:example\.(?:com|org|net)|[^@]+\.invalid)$/i.test(email);
}

export function assertMetadata(email) {
  if (!safeEmail(email) || /@(?:example\.(?:com|org|net)|[^@]+\.invalid)$/i.test(email)) {
    throw new Error('Commit identity must use a GitHub noreply email');
  }
}

function inspectFiles(staged, errors, ref = 'HEAD') {
  const names = git(staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-tree', '-r', '--name-only', '-z', ref]).split('\0').filter(Boolean);
  for (const name of names) {
    if (/(?:^|\/)\.env(?:\.|$)/.test(name) && !/\.(?:example|sample|template)$/.test(name) ||
        /\.(?:pem|p12|pfx|sqlite|sqlite3|db)(?:-wal|-shm)?$|(?:^|\/)id_(?:rsa|ed25519)$|(?:^|\/)\.dsh-home\//i.test(name)) {
      errors.push({ location: 'tracked-file', categories: ['private-file'] });
      continue;
    }
    const buffer = execFileSync('git', ['show', staged ? `:${name}` : `${ref}:${name}`], { maxBuffer: 32 * 1024 * 1024 });
    if (buffer.includes(0)) continue;
    const categories = inspectText(buffer.toString('utf8'));
    if (categories.length) errors.push({ location: 'tracked-file', categories });
  }
}

function inspectRange(range, errors) {
  for (const commit of git(['rev-list', range]).split('\n').filter(Boolean)) {
    const fields = git(['show', '-s', '--format=%ae%x00%ce%x00%an%n%cn%n%B', commit]).split('\0');
    for (const email of fields.slice(0, 2)) {
      try { assertMetadata(email); } catch { errors.push({ location: 'commit-metadata', categories: ['personal-email'] }); }
    }
    const categories = inspectText(fields[2] ?? '');
    if (categories.length) errors.push({ location: 'commit-message', categories });
    // Scan each introduced snapshot, not only added lines: a secret introduced
    // and then deleted before the final head is still public in commit history.
    const patch = git(['show', '--format=', '--no-ext-diff', '--no-textconv', '--diff-merges=first-parent', commit]);
    const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
    const additions = inspectText(added);
    if (additions.length) errors.push({ location: 'commit-content', categories: additions });
  }
}

export function run(args) {
  const errors = [];
  if (args[0] === '--message') {
    const categories = inspectText(readFileSync(args[1], 'utf8'));
    if (categories.length) errors.push({ location: 'commit-message', categories });
  } else if (args[0] === '--pre-commit') {
    const ident = git(['var', 'GIT_AUTHOR_IDENT']);
    assertMetadata(ident.match(/<([^>]+)>/)?.[1] ?? '');
    inspectFiles(true, errors);
  } else {
    const refIndex = args.indexOf('--ref');
    const ref = refIndex === -1 ? 'HEAD' : args[refIndex + 1];
    if (ref !== 'HEAD' && !/^[0-9a-f]{40}$/.test(ref ?? '')) throw new Error('Invalid scan ref');
    inspectFiles(false, errors, ref);
    if (args[0] === '--range') inspectRange(args[1], errors);
    if (args[0] === '--pre-push') {
      const input = readFileSync(0, 'utf8');
      for (const line of input.trim().split('\n').filter(Boolean)) {
        const [, local, , remote] = line.split(' ');
        if (/^0+$/.test(local)) continue;
        const base = /^0+$/.test(remote) ? git(['merge-base', local, 'upstream/main']) : remote;
        inspectRange(`${base}..${local}`, errors);
      }
    }
    for (const key of ['PR_TITLE', 'PR_BODY']) {
      const categories = inspectText(process.env[key] ?? '');
      if (categories.length) errors.push({ location: 'pr-description', categories });
    }
  }
  if (errors.length) {
    // Do not echo matched content, filenames, identities, tokens or PR bodies.
    console.error('Privacy gate rejected publication: ' + JSON.stringify(errors));
    console.error('Remove private context, paths or credentials; use a GitHub noreply identity. Do not bypass hooks.');
    return 1;
  }
  console.log('Privacy gate passed.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = run(process.argv.slice(2)); }
  catch { console.error('Privacy gate could not complete; publication is blocked.'); process.exitCode = 1; }
}
