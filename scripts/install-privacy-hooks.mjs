import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = process.argv[2] ? resolve(process.argv[2]) : root;
const git = args => execFileSync('git', args, { encoding: 'utf8', cwd: target }).trim();
const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
const gate = join(common, 'privacy-gate');
const hooks = join(gate, 'hooks');
const previousFile = join(gate, 'previous-hooks');
mkdirSync(join(gate, 'scripts', 'ci'), { recursive: true });
mkdirSync(hooks, { recursive: true });
if (!existsSync(previousFile)) {
  let previous;
  try { previous = resolve(target, git(['config', '--get', 'core.hooksPath'])); }
  catch { previous = join(common, 'hooks'); }
  writeFileSync(previousFile, previous);
}
const previous = readFileSync(previousFile, 'utf8');
if (previous === hooks) throw new Error('Refusing recursive hooks');
cpSync(join(root, 'scripts', 'ci', 'check-privacy.mjs'), join(gate, 'scripts', 'ci', 'check-privacy.mjs'));
cpSync(join(root, '.privacy-policy.json'), join(gate, '.privacy-policy.json'));
for (const [name, flag] of [['pre-commit', '--pre-commit'], ['commit-msg', '--message'], ['pre-push', '--pre-push']]) {
  const prologue = `#!/bin/sh\nset -eu\ncommon=$(git rev-parse --path-format=absolute --git-common-dir)\ngate="$common/privacy-gate"\nprevious=$(cat "$gate/previous-hooks")\n`;
  const run = name === 'pre-push'
    ? `input=$(cat)\nprintf '%s\\n' "$input" | node "$gate/scripts/ci/check-privacy.mjs" ${flag}\nif [ -x "$previous/${name}" ]; then printf '%s\\n' "$input" | "$previous/${name}" "$@"; fi\n`
    : `node "$gate/scripts/ci/check-privacy.mjs" ${flag} "$@"\nif [ -x "$previous/${name}" ]; then "$previous/${name}" "$@"; fi\n`;
  writeFileSync(join(hooks, name), prologue + run);
  chmodSync(join(hooks, name), 0o755);
}
git(['config', 'core.hooksPath', hooks]);
console.log('Privacy hooks installed for this repository and all its worktrees; existing hooks are chained.');
