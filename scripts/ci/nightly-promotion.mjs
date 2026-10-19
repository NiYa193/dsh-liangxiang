import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    const response = await fetcher(path === 'graphql' ? 'https://api.github.com/graphql'
      : `https://api.github.com/repos/${REPOSITORY}${path ? '/' + path : ''}`, {
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
    const result = await response.json();
    if (path === 'graphql' && result.errors?.length) throw new Error('GitHub rejected the protected atomic ref update');
    return result;
  };
}

function assertOrder(comparison) {
  if (!Number.isInteger(comparison.ahead_by) || !Number.isInteger(comparison.behind_by)) {
    throw new Error('Invalid comparison response');
  }
  if (comparison.behind_by !== 0) throw new Error('dev must contain all main history before promotion');
}

async function snapshotChanged(api, base, head) {
  const comparison = await api(`compare/${base}...${head}`);
  assertOrder(comparison);
  if (comparison.ahead_by === 0) return false;
  const [main, dev] = await Promise.all([api(`git/commits/${base}`), api(`git/commits/${head}`)]);
  return sha(main.tree?.sha) !== sha(dev.tree?.sha);
}

export async function plan(api) {
  const [baseRef, headRef] = await Promise.all([api('git/ref/heads/main'), api('git/ref/heads/dev')]);
  const base = sha(baseRef.object.sha), head = sha(headRef.object.sha);
  return { base, head, changed: await snapshotChanged(api, base, head) };
}

export function assertPull(pr, state) {
  if (pr.state !== 'open' || pr.draft || pr.base.ref !== 'main' ||
      pr.base.repo.full_name !== REPOSITORY || pr.head.repo?.full_name !== REPOSITORY ||
      pr.head.ref !== state.branch || pr.head.sha !== state.head) {
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

export async function waitAndPromote(api, checksApi, state, {
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
      if (commit.parents?.[0]?.sha !== state.base || commit.parents?.[1]?.sha !== state.head) {
        throw new Error('GitHub test merge does not match this frozen batch');
      }
      // main is an ancestor of frozen dev. The PR test merge must therefore
      // contain exactly the files of that existing dev commit, with no changes.
      const frozenCommit = await api(`git/commits/${state.head}`);
      if (!commit.tree?.sha || commit.tree.sha !== frozenCommit.tree?.sha) {
        throw new Error('Frozen dev and PR integration tree differ');
      }
      const checks = await checksApi(`commits/${state.head}/check-runs?filter=latest&per_page=100`);
      if (checkResult(checks.check_runs, state.head) && pr.mergeable_state === 'clean') {
        const dev = sha((await api('git/ref/heads/dev')).object.sha);
        assertOrder(await api(`compare/${state.head}...${dev}`));
        const clientMutationId = `nightly-${state.pr}`;
        const result = await api('graphql', 'POST', {
          query: 'mutation($input:UpdateRefsInput!) { updateRefs(input:$input) { clientMutationId } }',
          variables: { input: { repositoryId: state.repositoryId, clientMutationId, refUpdates: [{
            name: 'refs/heads/main', beforeOid: state.base, afterOid: state.head, force: false,
          }] } },
        });
        if (result.errors?.length || result.data?.updateRefs?.clientMutationId !== clientMutationId) {
          throw new Error('GitHub refused the protected fast-forward');
        }
        if ((await api('git/ref/heads/main')).object.sha !== state.head) {
          throw new Error('main did not advance to the verified dev commit');
        }
        return state.head;
      }
    }
    await sleep(15_000);
  }
  throw new Error('Timed out waiting for all required PR checks');
}

export async function cleanup(api, state, { sleep = delay, attempts = 10 } = {}) {
  if (!/^automation\/promote-\d+-\d+$/.test(state.branch ?? '')) throw new Error('Unexpected cleanup ref');
  sha(state.head);
  if (state.pr) {
    let pr = await api(`pulls/${state.pr}`);
    if (pr.state === 'open') {
      assertPull(pr, state);
      if ((await api('git/ref/heads/main')).object.sha === state.head) {
        // GitHub records an indirect fast-forward merge asynchronously. Do not
        // race it by closing a successfully promoted PR as an abandoned batch.
        for (let attempt = 0; attempt < attempts && pr.state === 'open'; attempt++) {
          await sleep(1000);
          pr = await api(`pulls/${state.pr}`);
        }
        if (pr.state === 'open') throw new Error('Fast-forward complete; PR bookkeeping pending, preserving its temporary ref');
      } else {
        await api(`pulls/${state.pr}`, 'PATCH', { state: 'closed' });
      }
    }
  }
  let ref;
  try { ref = await api(`git/ref/heads/${state.branch}`); }
  catch (error) { if (error.status === 404) return; throw error; }
  if (ref.object.sha !== state.head) throw new Error('Temporary branch changed; keeping it for inspection');
  await api(`git/refs/heads/${state.branch}`, 'DELETE');
}

export async function promote(api, checksApi) {
  const base = sha(process.env.BASE_SHA), head = sha(process.env.HEAD_SHA);
  const run = process.env.GITHUB_RUN_ID, attempt = process.env.GITHUB_RUN_ATTEMPT;
  if (!/^\d+$/.test(run ?? '') || !/^\d+$/.test(attempt ?? '')) throw new Error('Invalid run identity');
  if ((await api('git/ref/heads/main')).object.sha !== base) throw new Error('main changed after snapshot');
  if (!await snapshotChanged(api, base, head)) { summary('No file changes; no batch branch or PR was created.'); return; }
  const repository = await api('');
  if (repository.full_name !== REPOSITORY || !repository.node_id) throw new Error('Unexpected repository');
  const state = { base, head, repositoryId: repository.node_id, branch: `automation/promote-${run}-${attempt}` };
  // No candidate code is checked out or executed with the App token. A frozen
  // ref points to the existing dev commit; promotion never creates a commit.
  writeFileSync(STATE, JSON.stringify(state));
  await api('git/refs', 'POST', { ref: `refs/heads/${state.branch}`, sha: head });
  const runUrl = `https://github.com/${REPOSITORY}/actions/runs/${run}`;
  const pr = await api('pulls', 'POST', {
    title: `Nightly: dev → main (${head.slice(0, 7)})`, head: state.branch, base: 'main',
    body: `Frozen dev: ${head}\nFrozen main: ${base}\n\nFull three-platform verification, packed installation, browser and isolated online checks must all succeed on this PR's test merge. Its file tree must equal frozen dev. Then main fast-forwards to this existing commit with an atomic old-SHA check and force=false. New dev commits wait for the next batch. No promotion or reverse-sync commits are created.\n\nController: ${runUrl}\n\nThis promotes source only; it does not publish packages, tags, releases or deployments.`,
  });
  state.pr = pr.number;
  writeFileSync(STATE, JSON.stringify(state));
  summary(`### Nightly batch\n- main: ${base}\n- Frozen dev: ${head}\n- PR: ${pr.html_url}`);
  const promoted = await waitAndPromote(api, checksApi, state);
  summary(`- Fast-forwarded main: ${promoted}\n- New commits created: 0`);
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
