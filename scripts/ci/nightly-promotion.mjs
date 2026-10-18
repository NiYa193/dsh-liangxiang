import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const REPOSITORY = 'liang-today/dsh-liangxiang';
export const REQUIRED = [
  'verify-locked (ubuntu-latest)', 'verify-locked (windows-latest)',
  'verify-locked (macos-latest)', 'smoke-installed', 'privacy',
];
const STATE = '.git/nightly-promotion.json';
const sha = value => {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('Expected a complete commit SHA');
  return value;
};
const summary = text => {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
};

export function apiClient(token, fetcher = fetch) {
  if (!token) throw new Error('GitHub authentication is missing');
  return async (path, method = 'GET', body) => {
    const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 204) return null;
    if (!response.ok) {
      const error = new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}

export async function plan(api) {
  const [baseRef, headRef] = await Promise.all([api('git/ref/heads/main'), api('git/ref/heads/dev')]);
  const base = sha(baseRef.object.sha), head = sha(headRef.object.sha);
  const comparison = await api(`compare/${base}...${head}`);
  if (!Number.isInteger(comparison.ahead_by)) throw new Error('Invalid comparison response');
  return { base, head, changed: comparison.ahead_by > 0 };
}

export function assertPull(pr, state) {
  if (pr.state !== 'open' || pr.draft || pr.base.ref !== 'main' ||
      pr.base.repo.full_name !== REPOSITORY || pr.head.repo?.full_name !== REPOSITORY ||
      pr.head.ref !== state.branch || pr.head.sha !== state.candidate) {
    throw new Error('Batch PR changed; refusing to merge or alter it');
  }
}

export function checkResult(runs, expectedSha) {
  // Never accept skipped/neutral checks or checks for a different batch/app.
  const selected = REQUIRED.map(name => runs.find(run => run.name === name && run.app?.id === 15368
    && (expectedSha === undefined || run.head_sha === expectedSha)));
  for (const check of selected) {
    if (check?.status === 'completed' && check.conclusion !== 'success') {
      throw new Error(`Required check failed: ${check.name} (${check.conclusion})`);
    }
  }
  return selected.every(check => check?.status === 'completed' && check.conclusion === 'success');
}

export async function waitAndMerge(api, checksApi, state, {
  sleep = delay, attempts = 140,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const [pr, baseRef] = await Promise.all([
      api(`pulls/${state.pr}`), api('git/ref/heads/main'),
    ]);
    assertPull(pr, state);
    if (baseRef.object.sha !== state.base || pr.base.sha !== state.base) {
      throw new Error('main advanced during verification; a new batch must be tested');
    }
    if (pr.mergeable === false) throw new Error('Batch conflicts with main');
    // API 2026-03-10 removed merge_commit_sha from PR payloads. Read the
    // exact test-merge ref; GET pulls above requests its background calculation.
    let mergeRef;
    try {
      mergeRef = await api(`git/ref/pull/${state.pr}/merge`);
    } catch (error) {
      // A test merge may not exist yet. Authentication and other failures abort.
      if (error.status !== 404) throw error;
    }
    if (mergeRef) {
      if (mergeRef.ref !== `refs/pull/${state.pr}/merge` || mergeRef.object?.type !== 'commit') {
        throw new Error('GitHub returned an unexpected test-merge reference');
      }
      const mergeSha = sha(mergeRef.object.sha);
      // Validate the test merge's parents before accepting checks attached to it.
      const commit = await api(`git/commits/${mergeSha}`);
      if (commit.parents?.[0]?.sha !== state.base || commit.parents?.[1]?.sha !== state.candidate) {
        throw new Error('GitHub test merge does not match this frozen batch');
      }
      // Actions attaches PR check runs to the PR head, even though checkout uses
      // the test merge. Our head already merges frozen main + dev; prove that
      // its complete integration tree is exactly the test merge's tree.
      const candidateCommit = await api(`git/commits/${state.candidate}`);
      if (candidateCommit.parents?.[0]?.sha !== state.base || candidateCommit.parents?.[1]?.sha !== state.head
          || !commit.tree?.sha || commit.tree.sha !== candidateCommit.tree?.sha) {
        throw new Error('Batch ancestry or integration tree changed');
      }
      const checks = await checksApi(`commits/${state.candidate}/check-runs?filter=latest&per_page=100`);
      if (checkResult(checks.check_runs, state.candidate) && pr.mergeable_state === 'clean') {
        // Strict branch protection rechecks the base and required checks atomically.
        // The sha parameter also rejects a changed head. No admin/bypass flag exists here.
        const result = await api(`pulls/${state.pr}/merge`, 'PUT', {
          sha: state.candidate, merge_method: 'merge',
          commit_title: `Merge nightly dev batch (${state.head.slice(0, 7)})`,
        });
        if (!result.merged) throw new Error('GitHub refused the protected merge');
        return result.sha;
      }
    }
    await sleep(15_000);
  }
  throw new Error('Timed out waiting for all required PR checks');
}

export async function cleanup(api, state) {
  if (!/^automation\/promote-\d+-\d+$/.test(state.branch ?? '')) throw new Error('Unexpected cleanup ref');
  sha(state.candidate);
  if (state.pr) {
    const pr = await api(`pulls/${state.pr}`);
    if (pr.state === 'open') {
      assertPull(pr, state);
      await api(`pulls/${state.pr}`, 'PATCH', { state: 'closed' });
    }
  }
  const ref = await api(`git/ref/heads/${state.branch}`);
  if (ref.object.sha !== state.candidate) throw new Error('Temporary branch changed; keeping it for inspection');
  await api(`git/refs/heads/${state.branch}`, 'DELETE');
}

function git(args, cwd, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv, GIT_TERMINAL_PROMPT: '0' };
  delete env.GH_TOKEN;
  delete env.CHECKS_TOKEN;
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
  }).trim();
}

export async function promote(api, checksApi) {
  const base = sha(process.env.BASE_SHA), head = sha(process.env.HEAD_SHA);
  const run = process.env.GITHUB_RUN_ID, attempt = process.env.GITHUB_RUN_ATTEMPT;
  if (!/^\d+$/.test(run ?? '') || !/^\d+$/.test(attempt ?? '')) throw new Error('Invalid run identity');
  if ((await api('git/ref/heads/main')).object.sha !== base) throw new Error('main changed after snapshot');
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-nightly-'));
  let added = false;
  try {
    // Candidate files never replace the trusted controller checkout. No candidate
    // package/script is executed in a process with the installation token.
    git(['fetch', '--no-tags', 'origin', base, head]);
    git(['worktree', 'add', '--detach', directory, base]);
    added = true;
    const identity = ['-c', 'user.name=liangxiang-nightly', '-c', 'user.email=ci@users.noreply.github.com'];
    git([...identity, 'merge', '--no-ff', '--no-commit', head], directory);
    // Separate integration merges can have different histories but the same
    // resulting files. Preserve the no-change rule before creating any commit,
    // remote branch or PR, including when main contains extra changes.
    if (git(['write-tree'], directory) === git(['rev-parse', `${base}^{tree}`], directory)) {
      summary('Frozen dev produces no changes to main; no batch PR or merge was created.');
      return;
    }
    git([...identity, 'commit', '-m', `Prepare nightly batch from dev ${head}\n\nFrozen main: ${base}`], directory);
    const candidate = sha(git(['rev-parse', 'HEAD'], directory));
    const state = { base, head, candidate, branch: `automation/promote-${run}-${attempt}` };
    const auth = Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64');
    // Persist metadata before network writes so cancellation cleanup is recoverable.
    writeFileSync(STATE, JSON.stringify(state));
    git(['push', 'origin', `HEAD:refs/heads/${state.branch}`], directory, {
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
    });
    const runUrl = `https://github.com/${REPOSITORY}/actions/runs/${run}`;
    const pr = await api('pulls', 'POST', {
      title: `Nightly: dev → main (${head.slice(0, 7)})`, head: state.branch, base: 'main',
      body: `Frozen dev: ${head}\nFrozen main: ${base}\nCandidate: ${candidate}\n\nFull three-platform verification, packed installation, browser and isolated online checks must all succeed on this PR's test merge. New dev commits wait for the next batch.\n\nController: ${runUrl}\n\nThis merges source only; it does not publish packages, tags, releases or deployments.`,
    });
    state.pr = pr.number;
    writeFileSync(STATE, JSON.stringify(state));
    summary(`### Nightly batch\n- main: ${base}\n- dev: ${head}\n- Candidate: ${candidate}\n- PR: ${pr.html_url}`);
    const merged = await waitAndMerge(api, checksApi, state);
    summary(`- Merged commit: ${merged}`);
  } finally {
    if (added) git(['worktree', 'remove', '--force', directory]);
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Promotion is restricted to the upstream default branch');
  }
  const api = apiClient(process.env.GH_TOKEN);
  switch (process.argv[2]) {
    case 'plan': {
      const result = await plan(api);
      appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
      summary(`### Frozen nightly snapshot\n- main: ${result.base}\n- dev: ${result.head}\n- New commits: ${result.changed}\nNo-change batches do not create PRs or merge commits.`);
      break;
    }
    case 'promote':
      await promote(api, apiClient(process.env.CHECKS_TOKEN));
      break;
    case 'cleanup':
      if (existsSync(STATE)) {
        await cleanup(api, JSON.parse(readFileSync(STATE, 'utf8')));
        rmSync(STATE);
      }
      break;
    default: throw new Error('Expected plan, promote or cleanup');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
