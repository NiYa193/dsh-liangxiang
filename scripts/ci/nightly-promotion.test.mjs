import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiClient, assertPull, checkResult, cleanup, plan, promote, REQUIRED, REPOSITORY, waitAndMerge } from './nightly-promotion.mjs';

const base = 'a'.repeat(40), head = 'b'.repeat(40), candidate = 'c'.repeat(40), merge = 'd'.repeat(40);
const state = { base, head, candidate, pr: 42, branch: 'automation/promote-123-1' };
const pull = () => ({ state: 'open', draft: false, mergeable: true, mergeable_state: 'clean',
  merge_commit_sha: merge,
  base: { ref: 'main', sha: base, repo: { full_name: REPOSITORY } },
  head: { ref: state.branch, sha: candidate, repo: { full_name: REPOSITORY } },
});
const passing = () => REQUIRED.map(name => ({ name, app: { id: 15368 }, status: 'completed', conclusion: 'success' }));
function scenario({ pr = pull(), main = base, checks = passing(), parents = [base, candidate], merged = true } = {}) {
  const writes = [];
  const api = async (path, method = 'GET', body) => {
    if (method !== 'GET') { writes.push({ path, method, body }); return { merged, sha: merge }; }
    if (path === 'pulls/42') return pr;
    if (path === 'git/ref/heads/main') return { object: { sha: main } };
    if (path === `git/commits/${merge}`) return { parents: parents.map(value => ({ sha: value })) };
    if (path.startsWith('commits/')) return { check_runs: checks };
    throw new Error('Unexpected request: ' + path);
  };
  return { api, writes };
}
const once = { attempts: 1, sleep: async () => {} };

test('different branch tips with no dev-only commits do not create a batch', async () => {
  const calls = [];
  const result = await plan(async path => {
    calls.push(path);
    if (path === 'git/ref/heads/main') return { object: { sha: base } };
    if (path === 'git/ref/heads/dev') return { object: { sha: head } };
    assert.equal(path, `compare/${base}...${head}`);
    return { ahead_by: 0 };
  });
  assert.deepEqual(result, { base, head, changed: false });
  assert.equal(calls.length, 3);
});

test('plan freezes exact heads and identifies new dev commits', async () => {
  const result = await plan(async path => path.startsWith('compare/') ? { ahead_by: 2 } :
    { object: { sha: path.endsWith('main') ? base : head } });
  assert.deepEqual(result, { base, head, changed: true });
});

test('untrusted commit input fails before comparison or mutation', async () => {
  await assert.rejects(plan(async () => ({ object: { sha: 'dev; echo bad' } })), /complete commit SHA/);
});

test('only the frozen batch with all real successful merge checks can merge', async () => {
  const { api, writes } = scenario();
  assert.equal(await waitAndMerge(api, api, state, once), merge);
  assert.deepEqual(writes, [{ path: 'pulls/42/merge', method: 'PUT', body: {
    sha: candidate, merge_method: 'merge', commit_title: 'Merge nightly dev batch (bbbbbbb)',
  } }]);
});

test('advancing main aborts without issuing a merge request', async () => {
  const { api, writes } = scenario({ main: 'e'.repeat(40) });
  await assert.rejects(waitAndMerge(api, api, state, once), /main advanced/);
  assert.deepEqual(writes, []);
});

test('a changed PR head, repository or target is never merged', async () => {
  for (const mutate of [
    pr => { pr.head.sha = head; }, pr => { pr.head.repo.full_name = 'other/fork'; },
    pr => { pr.base.ref = 'dev'; }, pr => { pr.draft = true; },
  ]) {
    const pr = pull(); mutate(pr);
    assert.throws(() => assertPull(pr, state), /Batch PR changed/);
    const { api, writes } = scenario({ pr });
    await assert.rejects(waitAndMerge(api, api, state, once), /Batch PR changed/);
    assert.deepEqual(writes, []);
  }
});

test('passing checks from a different merge tree cannot promote the batch', async () => {
  const { api, writes } = scenario({ parents: [head, candidate] });
  await assert.rejects(waitAndMerge(api, api, state, once), /test merge does not match/);
  assert.deepEqual(writes, []);
});

test('failure, skipped and neutral checks are not accepted as success', () => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'neutral', 'timed_out']) {
    const checks = passing(); checks[0].conclusion = conclusion;
    assert.throws(() => checkResult(checks), /Required check failed/);
  }
});

test('missing, pending or impersonated checks block merging', async () => {
  for (const mutate of [checks => checks.pop(), checks => { checks[0].status = 'in_progress'; },
    checks => { checks[0].app.id = 999; }]) {
    const checks = passing(); mutate(checks);
    const { api, writes } = scenario({ checks });
    await assert.rejects(waitAndMerge(api, api, state, once), /Timed out/);
    assert.deepEqual(writes, []);
  }
});

test('checks can finish later without changing the frozen dev snapshot', async () => {
  const { api, writes } = scenario();
  let polls = 0;
  const checksApi = async path => { assert.ok(path.includes(merge)); return { check_runs: ++polls === 1 ? [] : passing() }; };
  assert.equal(await waitAndMerge(api, checksApi, state, { ...once, attempts: 2 }), merge);
  assert.equal(writes.length, 1);
  assert.equal(polls, 2);
});

test('GitHub remains the final authority when protection rejects the merge', async () => {
  const { api } = scenario({ merged: false });
  await assert.rejects(waitAndMerge(api, api, state, once), /refused the protected merge/);
});

test('cleanup closes an unsuccessful batch and deletes only its unchanged branch', async () => {
  const writes = [];
  await cleanup(async (path, method = 'GET') => {
    if (method !== 'GET') { writes.push([path, method]); return null; }
    return path.startsWith('pulls/') ? pull() : { object: { sha: candidate } };
  }, state);
  assert.deepEqual(writes, [['pulls/42', 'PATCH'], [`git/refs/heads/${state.branch}`, 'DELETE']]);
});

test('cleanup never deletes main, dev or a branch someone else changed', async () => {
  await assert.rejects(cleanup(async () => assert.fail('must not access API'), { ...state, branch: 'dev' }), /Unexpected cleanup ref/);
  const writes = [];
  await assert.rejects(cleanup(async (path, method = 'GET') => {
    if (method !== 'GET') writes.push(method);
    return path.startsWith('pulls/') ? { state: 'closed' } : { object: { sha: head } };
  }, state), /Temporary branch changed/);
  assert.deepEqual(writes, []);
});

test('API errors omit credentials and response bodies', async () => {
  const api = apiClient('private-test-token', async () => ({ ok: false, status: 403, json: () => ({ secret: 'do not log' }) }));
  await assert.rejects(api('pulls'), error => error.message === 'GitHub GET pulls: HTTP 403');
});

test('a dev-only history change with no resulting file changes creates no commit, branch or PR', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'promotion-empty-'));
  const previousDirectory = process.cwd();
  const variables = ['BASE_SHA', 'HEAD_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_STEP_SUMMARY'];
  const previousEnvironment = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@users.noreply.github.com');
    writeFileSync(join(directory, 'fixture.txt'), 'initial\n');
    git('add', '.'); git('commit', '-m', 'Initial fixture');
    const common = git('rev-parse', 'HEAD');
    writeFileSync(join(directory, 'fixture.txt'), 'main-only change\n');
    git('commit', '-am', 'Main change');
    const frozenMain = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'dev', common);
    git('commit', '--allow-empty', '-m', 'Dev history checkpoint');
    const frozenDev = git('rev-parse', 'HEAD');
    git('checkout', 'main');
    git('remote', 'add', 'origin', directory);
    const refsBefore = git('show-ref');
    const objectsBefore = git('rev-list', '--all', '--count');
    process.chdir(directory);
    Object.assign(process.env, { BASE_SHA: frozenMain, HEAD_SHA: frozenDev,
      GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_STEP_SUMMARY: join(directory, 'summary.md') });
    const calls = [];
    await promote(async path => {
      calls.push(path);
      assert.equal(path, 'git/ref/heads/main');
      return { object: { sha: frozenMain } };
    }, async () => assert.fail('No remote checks should be requested'));
    assert.deepEqual(calls, ['git/ref/heads/main']);
    assert.equal(git('show-ref'), refsBefore);
    assert.equal(git('rev-list', '--all', '--count'), objectsBefore);
    assert.equal(git('rev-parse', 'HEAD'), frozenMain);
    assert.equal(git('worktree', 'list', '--porcelain').split('worktree ').length - 1, 1);
    assert.equal(existsSync(join(directory, '.git/nightly-promotion.json')), false);
  } finally {
    process.chdir(previousDirectory);
    for (const key of variables) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnvironment[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
