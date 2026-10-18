import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectText, assertMetadata } from './check-privacy.mjs';

test('private phrase digests reject context without publishing literal blocked labels', () => {
  const fixture = ['内', '部', '称', '谓'].join('');
  const policy = new Map([[fixture.length, new Set([createHash('sha256').update(fixture).digest('hex')])]]);
  assert.deepEqual(inspectText('说明：' + fixture, policy), ['private-context']);
  assert.deepEqual(inspectText('公开技术说明', policy), []);
});

test('home paths and conversation identifiers are rejected', () => {
  assert.ok(inspectText(['', 'Users', 'example-user', 'work'].join('/')).includes('personal-path'));
  assert.ok(inspectText(['C:', 'Users', 'example-user', 'work'].join('\\')).includes('personal-path'));
  const id = ['01' + 'a'.repeat(6), 'b'.repeat(4), '7' + 'c'.repeat(3), 'd'.repeat(4), 'e'.repeat(12)].join('-');
  assert.ok(inspectText(id).includes('private-session'));
});

test('provider tokens and private keys are blocked while public digests are allowed', () => {
  assert.ok(inspectText('gh' + 'p_' + 'a'.repeat(36)).includes('credential'));
  assert.ok(inspectText(['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' ')).includes('credential'));
  assert.deepEqual(inspectText(createHash('sha256').update('fixture').digest('hex')), []);
});

test('commit emails require a noreply identity, not a personal or placeholder mailbox', () => {
  assert.doesNotThrow(() => assertMetadata('123+contributor@users.noreply.github.com'));
  assert.doesNotThrow(() => assertMetadata('noreply@github.com'));
  assert.throws(() => assertMetadata('fixture@example.com'), /noreply/);
  assert.ok(inspectText('private-user@' + 'personal-domain.test').includes('personal-email'));
  assert.deepEqual(inspectText('fixture@example.com'), []);
});
