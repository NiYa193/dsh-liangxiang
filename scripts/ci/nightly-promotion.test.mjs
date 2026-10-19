import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiClient, assertPull, checkResult, cleanup, plan, promote, REQUIRED, REPOSITORY, waitAndPromote } from './nightly-promotion.mjs';

const base = 'a'.repeat(40), head = 'b'.repeat(40), merge = 'c'.repeat(40), tree = 'd'.repeat(40);
const state = { base, head, repositoryId: 'R_example', pr: 42, branch: 'automation/promote-123-1' };
const pull = () => ({ state: 'open', draft: false, mergeable: true, mergeable_state: 'clean',
  base: { ref: 'main', sha: base, repo: { full_name: REPOSITORY } },
  head: { ref: state.branch, sha: head, repo: { full_name: REPOSITORY } },
});
const passing = () => REQUIRED.map(name => ({ name, head_sha: head, app: { id: 15368 }, status: 'completed', conclusion: 'success' }));
function scenario({ pr = pull(), main = base, checks = passing(), parents = [base, head],
  headTree = tree, dev = head, devBehind = 0, accepted = true } = {}) {
  const writes = [];
  let updated = false;
  const api = async (path, method = 'GET', body) => {
    if (method !== 'GET') {
      writes.push({ path, method, body });
      if (path === 'graphql') {
        updated = accepted;
        return accepted ? { data: { updateRefs: { clientMutationId: 'nightly-42' } } } : { errors: [{}] };
      }
      if (path === 'pulls') return { number: 42, html_url: 'https://github.com/example/repo/pull/42' };
      return null;
    }
    if (path === '') return { full_name: REPOSITORY, node_id: state.repositoryId };
    if (path === 'pulls/42') return pr;
    if (path === 'git/ref/pull/42/merge') return { ref: 'refs/pull/42/merge', object: { type: 'commit', sha: merge } };
    if (path === 'git/ref/heads/main') return { object: { sha: updated ? head : main } };
    if (path === 'git/ref/heads/dev') return { object: { sha: dev } };
    if (path === `git/commits/${merge}`) return { parents: parents.map(sha => ({ sha })), tree: { sha: tree } };
    if (path === `git/commits/${head}`) return { tree: { sha: headTree } };
    if (path === `git/commits/${base}`) return { tree: { sha: 'e'.repeat(40) } };
    if (path === `compare/${base}...${head}`) return { ahead_by: 2, behind_by: 0 };
    if (path === `compare/${head}...${dev}`) return { ahead_by: dev === head ? 0 : 1, behind_by: devBehind };
    if (path.startsWith('commits/')) return { check_runs: checks };
    throw new Error('Unexpected request: ' + path);
  };
  return { api, writes };
}
const once = { attempts: 1, sleep: async () => {} };

test('unchanged tips create no batch', async () => {
  const calls = [];
  const result = await plan(async path => {
    calls.push(path);
    if (path === 'git/ref/heads/main') return { object: { sha: base } };
    if (path === 'git/ref/heads/dev') return { object: { sha: head } };
    assert.equal(path, `compare/${base}...${head}`);
    return { ahead_by: 0, behind_by: 0 };
  });
  assert.deepEqual(result, { base, head, changed: false });
  assert.equal(calls.length, 3);
});

test('plan freezes exact heads and requires dev to include main', async () => {
  assert.deepEqual(await plan(scenario().api), { base, head, changed: true });
  const { api } = scenario();
  await assert.rejects(plan(path => path.startsWith('compare/') ? { ahead_by: 2, behind_by: 1 } : api(path)), /dev must contain all main history/);
});

test('history-only updates do not create a batch', async () => {
  assert.equal((await plan(scenario({ headTree: 'e'.repeat(40) }).api)).changed, false);
});

test('untrusted or malformed snapshot metadata fails before mutation', async () => {
  await assert.rejects(plan(async () => ({ object: { sha: 'dev; echo bad' } })), /complete commit SHA/);
  const { api } = scenario();
  await assert.rejects(plan(path => path.startsWith('compare/') ? { ahead_by: 1 } : api(path)), /Invalid comparison/);
});

test('successful verification atomically fast-forwards only main to frozen dev', async () => {
  const { api, writes } = scenario();
  assert.equal(await waitAndPromote(api, api, state, once), head);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, 'graphql');
  assert.deepEqual(writes[0].body.variables.input, {
    repositoryId: state.repositoryId, clientMutationId: 'nightly-42', refUpdates: [{
      name: 'refs/heads/main', beforeOid: base, afterOid: head, force: false,
    }],
  });
});

test('advancing main aborts without updating any ref', async () => {
  const { api, writes } = scenario({ main: 'e'.repeat(40) });
  await assert.rejects(waitAndPromote(api, api, state, once), /main advanced/);
  assert.deepEqual(writes, []);
});

test('changed PR heads, forks, targets and drafts never promote', async () => {
  for (const mutate of [pr => { pr.head.sha = base; }, pr => { pr.head.repo.full_name = 'other/fork'; },
    pr => { pr.base.ref = 'dev'; }, pr => { pr.draft = true; }]) {
    const pr = pull(); mutate(pr);
    assert.throws(() => assertPull(pr, state), /Batch PR changed/);
    const { api, writes } = scenario({ pr });
    await assert.rejects(waitAndPromote(api, api, state, once), /Batch PR changed/);
    assert.deepEqual(writes, []);
  }
});

test('checks from a different test merge or file tree cannot promote', async () => {
  for (const options of [{ parents: [head, base] }, { headTree: 'f'.repeat(40) }]) {
    const { api, writes } = scenario(options);
    await assert.rejects(waitAndPromote(api, api, state, once), /test merge does not match|integration tree differ/);
    assert.deepEqual(writes, []);
  }
});

test('failure, skipped and neutral checks never count as success', () => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'neutral', 'timed_out']) {
    const checks = passing(); checks[0].conclusion = conclusion;
    assert.throws(() => checkResult(checks), /Required check failed/);
  }
});

test('missing, pending, impersonated and wrong-SHA checks block promotion', async () => {
  for (const mutate of [checks => checks.pop(), checks => { checks[0].status = 'in_progress'; },
    checks => { checks[0].app.id = 999; }, checks => { checks[0].head_sha = base; }]) {
    const checks = passing(); mutate(checks);
    const { api, writes } = scenario({ checks });
    await assert.rejects(waitAndPromote(api, api, state, once), /Timed out/);
    assert.deepEqual(writes, []);
  }
});

test('new dev commits remain on dev while only the frozen head promotes', async () => {
  const { api, writes } = scenario({ dev: 'f'.repeat(40) });
  let polls = 0;
  const checks = async () => ({ check_runs: ++polls === 1 ? [] : passing() });
  assert.equal(await waitAndPromote(api, checks, state, { ...once, attempts: 2 }), head);
  assert.equal(writes[0].body.variables.input.refUpdates[0].afterOid, head);
});

test('dev losing the frozen history blocks main without touching dev', async () => {
  const { api, writes } = scenario({ dev: base, devBehind: 1 });
  await assert.rejects(waitAndPromote(api, api, state, once), /dev must contain all main history/);
  assert.deepEqual(writes, []);
});

test('protection and atomic old-SHA rejections remain authoritative', async () => {
  const { api, writes } = scenario({ accepted: false });
  await assert.rejects(waitAndPromote(api, api, state, once), /refused the protected fast-forward/);
  assert.equal(writes.length, 1);
});

test('cleanup closes failed receipts and deletes only its unchanged temporary ref', async () => {
  const writes = [];
  await cleanup(async (path, method = 'GET') => {
    if (method !== 'GET') { writes.push([path, method]); return null; }
    return path.startsWith('pulls/') ? pull() : { object: { sha: path === 'git/ref/heads/main' ? base : head } };
  }, state);
  assert.deepEqual(writes, [['pulls/42', 'PATCH'], [`git/refs/heads/${state.branch}`, 'DELETE']]);
});

test('cleanup never deletes long-lived branches or changed temporary refs', async () => {
  await assert.rejects(cleanup(async () => assert.fail('must not access API'), { ...state, branch: 'dev' }), /Unexpected cleanup ref/);
  const writes = [];
  await assert.rejects(cleanup(async (path, method = 'GET') => {
    if (method !== 'GET') writes.push(method);
    return path.startsWith('pulls/') ? { state: 'closed' } : { object: { sha: base } };
  }, state), /Temporary branch changed/);
  assert.deepEqual(writes, []);
  await cleanup(async () => { throw Object.assign(new Error('Missing'), { status: 404 }); }, { ...state, pr: undefined });
});

test('successful fast-forwards wait for GitHub to mark the receipt merged', async () => {
  const writes = [];
  let reads = 0;
  await cleanup(async (path, method = 'GET') => {
    if (method !== 'GET') { writes.push([path, method]); return null; }
    if (path.startsWith('pulls/')) return ++reads === 1 ? pull() : { state: 'closed', merged: true };
    return { object: { sha: head } };
  }, state, once);
  assert.deepEqual(writes, [[`git/refs/heads/${state.branch}`, 'DELETE']]);
});

test('REST and GraphQL errors omit credentials and response bodies', async () => {
  const api = apiClient('private-test-token', async () => ({ ok: false, status: 403 }));
  await assert.rejects(api('pulls'), error => error.message === 'GitHub GET pulls: HTTP 403');
  const graphql = apiClient('private-test-token', async () => ({ ok: true, json: () => ({ errors: [{ message: 'private body' }] }) }));
  await assert.rejects(graphql('graphql', 'POST', {}), error => error.message === 'GitHub rejected the protected atomic ref update');
});

test('clients use the current REST contract and the GraphQL endpoint', async () => {
  const urls = [];
  const api = apiClient('private-test-token', async (url, options) => {
    urls.push(url);
    assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10');
    return { ok: true, json: () => pull() };
  });
  assert.equal(Object.hasOwn(await api('pulls/42'), 'merge_commit_sha'), false);
  await api(''); await api('graphql', 'POST', {});
  assert.deepEqual(urls, [`https://api.github.com/repos/${REPOSITORY}/pulls/42`,
    `https://api.github.com/repos/${REPOSITORY}`, 'https://api.github.com/graphql']);
});

test('a missing test merge waits, but unexpected refs or access failures stop', async () => {
  const { api } = scenario();
  let reads = 0;
  const pending = (...args) => {
    if (args[0] === 'git/ref/pull/42/merge' && ++reads === 1) throw Object.assign(new Error('Pending'), { status: 404 });
    return api(...args);
  };
  assert.equal(await waitAndPromote(pending, api, state, { ...once, attempts: 2 }), head);
  const next = scenario();
  const wrongRef = (...args) => args[0] === 'git/ref/pull/42/merge'
    ? { ref: 'refs/heads/main', object: { type: 'commit', sha: merge } } : next.api(...args);
  await assert.rejects(waitAndPromote(wrongRef, next.api, state, once), /unexpected test-merge reference/);
  const denied = (...args) => {
    if (args[0] === 'git/ref/pull/42/merge') throw Object.assign(new Error('Denied'), { status: 403 });
    return next.api(...args);
  };
  await assert.rejects(waitAndPromote(denied, next.api, state, once), /Denied/);
});

test('promotion creates a frozen ref and receipt, never a candidate commit or dev write', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'promotion-'));
  const cwd = process.cwd();
  const variables = ['BASE_SHA', 'HEAD_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_STEP_SUMMARY'];
  const previous = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  try {
    mkdirSync(join(directory, '.git')); process.chdir(directory);
    Object.assign(process.env, { BASE_SHA: base, HEAD_SHA: head, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' });
    delete process.env.GITHUB_STEP_SUMMARY;
    const { api, writes } = scenario({ dev: 'f'.repeat(40) });
    await promote(api, api);
    assert.deepEqual(writes.map(write => write.path), ['git/refs', 'pulls', 'graphql']);
    assert.deepEqual(writes[0].body, { ref: `refs/heads/${state.branch}`, sha: head });
    assert.equal(JSON.parse(readFileSync('.git/nightly-promotion.json')).head, head);
    rmSync('.git/nightly-promotion.json');
    const empty = scenario({ headTree: 'e'.repeat(40) });
    await promote(empty.api, empty.api);
    assert.deepEqual(empty.writes, []);
    assert.equal(existsSync('.git/nightly-promotion.json'), false);
  } finally {
    process.chdir(cwd);
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
