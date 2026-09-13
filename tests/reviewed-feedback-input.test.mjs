import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hydrateReviewedFeedback } from '../scripts/reviewed-feedback-input.mjs';

const fixture = JSON.parse(await readFile(new URL('../edge_repos/storyyard/tests/fixtures/inkos-source-first-pitch-review-v3.json', import.meta.url), 'utf8'));
const target = { decisionId: 'test-decision', packetId: fixture.packetId, packetSha256: fixture.packetSha256,
  candidateId: fixture.candidates[0].id, candidateSha256: fixture.candidates[0].sha256, artifactId: fixture.artifact.id };

async function withPacket(fn, packet = fixture) {
  const directory = await mkdtemp(join(tmpdir(), 'firefly-feedback-'));
  try { await writeFile(join(directory, `${fixture.packetId}.json`), JSON.stringify(packet)); return await fn({ packetDirectories: [directory] }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('loads the exact reviewed project plan and deduplicates multiple comments', async () => {
  await withPacket(async (options) => {
    const result = await hydrateReviewedFeedback([target, { ...target, decisionId: 'second' }], options);
    assert.equal(result.contexts.length, 1);
    assert.equal(result.contexts[0].body, fixture.candidates[0].projectPlan.markdown);
    assert.equal(result.contexts[0].representation, 'project-plan-markdown');
    assert.equal(result.contexts[0].feedbackScope, 'reviewed-candidate');
    assert.deepEqual(result.targets.map((item) => item.status), ['reviewed-text-loaded', 'reviewed-text-loaded']);
    assert.equal(result.humanReviewRequired, false);
  });
});

test('a damaged local cache cannot shadow a separately verified immutable packet copy', async () => {
  const damaged = await mkdtemp(join(tmpdir(), 'firefly-feedback-damaged-'));
  try {
    await writeFile(join(damaged, `${fixture.packetId}.json`), '{partial');
    await withPacket(async (options) => {
      const result = await hydrateReviewedFeedback([target], { packetDirectories: [damaged, ...options.packetDirectories] });
      assert.equal(result.targets[0].status, 'reviewed-text-loaded');
      assert.equal(result.contexts[0].body, fixture.candidates[0].projectPlan.markdown);
      assert.equal(await readFile(join(damaged, `${fixture.packetId}.json`), 'utf8'), '{partial');
    });
  } finally { await rm(damaged, { recursive: true, force: true }); }
});

test('candidate, packet, and artifact bindings must each match', async () => {
  await withPacket(async (options) => {
    const result = await hydrateReviewedFeedback([
      { ...target, candidateSha256: '0'.repeat(64) },
      { ...target, decisionId: 'bad-packet', packetSha256: '0'.repeat(64) },
      { ...target, decisionId: 'bad-artifact', artifactId: 'different' },
    ], options);
    assert.equal(result.contexts.length, 0);
    assert.deepEqual(result.targets.map((item) => item.status), ['candidate-binding-mismatch', 'packet-binding-mismatch', 'packet-binding-mismatch']);
  });
});

test('changed packet content is rejected even when its filename and claimed hashes match', async () => {
  const changed = structuredClone(fixture);
  changed.candidates[0].projectPlan.markdown += '\n추가된 내용';
  await withPacket(async (options) => {
    const result = await hydrateReviewedFeedback([target], options);
    assert.equal(result.contexts.length, 0);
    assert.equal(result.targets[0].status, 'packet-verification-failed');
  }, changed);
});

test('budget exclusion keeps a whole representation out instead of silently shortening it', async () => {
  await withPacket(async (options) => {
    const result = await hydrateReviewedFeedback([target], { ...options, maxCharacters: fixture.candidates[0].projectPlan.markdown.length - 1 });
    assert.equal(result.contexts.length, 0);
    assert.equal(result.characters, 0);
    assert.equal(result.targets[0].status, 'reviewed-text-omitted-budget');
  });
});

test('explicit packet feedback includes all candidates without inventing a selected candidate', async () => {
  await withPacket(async (options) => {
    const result = await hydrateReviewedFeedback([{ ...target, candidateId: '', candidateSha256: '' }], { ...options, maxCharacters: 120000 });
    assert.equal(result.contexts[0].feedbackScope, 'whole-reviewed-packet');
    assert.equal(result.contexts[0].candidateId, '');
    const body = JSON.parse(result.contexts[0].body);
    assert.deepEqual(body.candidates.map((item) => item.id), fixture.candidates.map((item) => item.id));
  });
});

test('missing packets and malformed bindings remain explicit and empty history does no lookup', async () => {
  await withPacket(async (options) => {
    const result = await hydrateReviewedFeedback([
      { ...target, packetId: `frp-${'0'.repeat(24)}` },
      { ...target, decisionId: 'malformed', candidateId: '../secret' },
    ], options);
    assert.deepEqual(result.targets.map((item) => item.status), ['packet-not-found', 'missing-or-invalid-binding']);
  });
  assert.equal((await hydrateReviewedFeedback([], { root: '/nonexistent' })).contexts.length, 0);
});
