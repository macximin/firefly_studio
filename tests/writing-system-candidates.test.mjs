import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adaptWritingSystemCandidates } from '../scripts/writing-system-candidates.mjs';

function fixture() {
  const manuscript = '🍲 지훈이 말했다. “돈 때문은 아닙니다.” 민호는 계약서에서 눈을 떼었다.';
  const quote = '돈 때문은 아닙니다.';
  const start = manuscript.indexOf(quote);
  return {
    schemaVersion: 'writing-system-review-input/v1',
    manuscript: { text: manuscript, chapterId: 'chapter-4', sha256: createHash('sha256').update(manuscript).digest('hex') },
    producer: { repository: 'Ckokoski/AuthorAgent', commit: '47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c', mode: 'scripted-fixture' },
    dialogueAttributions: [{ character: '지훈', quote, start, end: start + quote.length, provenance: 'explicit speaker fixture' }],
    report: { chapterId: 'chapter-4', charactersReviewed: ['지훈'], totalFlags: 1, byCharacter: [{ character: '지훈', linesReviewed: 3,
      flags: [{ line: quote, issue: 'off-motivation', reason: 'fixture diagnosis', suggestion: '저녁만은 딸과 먹겠습니다.' }] }] },
  };
}

test('keeps original unchanged and exports deterministic candidates with exact UTF-16 anchors', () => {
  const input = fixture(); const before = JSON.stringify(input);
  const a = adaptWritingSystemCandidates(input), b = adaptWritingSystemCandidates(input);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(input), before);
  assert.equal(a.candidates.length, 1); assert.equal(a.candidates[0].coordinateKind, 'utf16-code-units');
  assert.equal(a.qualityVerdict, 'not-assessed'); assert.equal(a.canonApplied, false);
  assert.equal(a.producer.attestation, 'caller-provided-not-independently-verified');
});
test('rejects invented dialogue, wrong speaker and ambiguous repeated dialogue', () => {
  for (const mutate of [x => x.report.byCharacter[0].flags[0].line = '없는 대사', x => x.dialogueAttributions[0].character = '민호']) {
    const input = fixture(); mutate(input);
    const out = adaptWritingSystemCandidates(input);
    assert.equal(out.candidates.length, 0); assert.equal(out.rejected[0].reason, 'unbound-quote-or-speaker');
  }
  const x = fixture(); const q = x.dialogueAttributions[0].quote; const start = x.manuscript.text.length + 1;
  x.manuscript.text += ` ${q}`; x.manuscript.sha256 = createHash('sha256').update(x.manuscript.text).digest('hex');
  x.dialogueAttributions.push({ ...x.dialogueAttributions[0], start, end: start + q.length });
  assert.equal(adaptWritingSystemCandidates(x).rejected[0].reason, 'ambiguous-quote');
});
test('rejects stale manuscripts, chapter mismatch and incorrect report accounting', () => {
  for (const mutate of [x => x.manuscript.text += '변경', x => x.report.chapterId = 'chapter-5', x => x.report.totalFlags = 2,
    x => x.report.charactersReviewed = [], x => x.report.byCharacter.push(x.report.byCharacter[0])]) {
    const x = fixture(); mutate(x); assert.throws(() => adaptWritingSystemCandidates(x));
  }
});
test('rejects invalid, overlapping or conflicting attribution spans instead of guessing', () => {
  for (const mutate of [x => x.dialogueAttributions[0].start++, x => x.dialogueAttributions[0].start = -1,
    x => x.dialogueAttributions.push({ ...x.dialogueAttributions[0], character: '민호' }),
    x => { const a = x.dialogueAttributions[0]; x.dialogueAttributions.push({ ...a, start: a.start + 1, quote: a.quote.slice(1) }); }]) {
    const x = fixture(); mutate(x); assert.throws(() => adaptWritingSystemCandidates(x));
  }
});
test('does not treat no review or zero flags as a quality pass', () => {
  const x = fixture(); x.report.byCharacter[0].flags = []; x.report.totalFlags = 0;
  assert.equal(adaptWritingSystemCandidates(x).reportState, 'no-flags-or-upstream-parse-failure');
  x.report.byCharacter = []; x.report.charactersReviewed = [];
  assert.equal(adaptWritingSystemCandidates(x).reportState, 'no-characters-reviewed');
});
test('bounds issues and suggestions and deduplicates candidates without applying them', () => {
  const x = fixture(); const flag = x.report.byCharacter[0].flags[0];
  x.report.byCharacter[0].flags.push({ ...flag }, { ...flag, suggestion: flag.line }, { ...flag, suggestion: '' }, { ...flag, issue: 'invented-rule' });
  x.report.totalFlags = 5;
  const out = adaptWritingSystemCandidates(x);
  assert.equal(out.candidates.length, 1);
  assert.deepEqual(out.rejected.map(x => x.reason), ['duplicate-candidate', 'unchanged-suggestion', 'incomplete-candidate', 'unsupported-issue']);
});
test('rejects unknown producer versions, malformed input and oversized manuscripts', () => {
  assert.throws(() => adaptWritingSystemCandidates(null));
  for (const mutate of [x => x.producer.commit = 'main', x => x.producer.mode = 'approved', x => x.manuscript.text = 'x'.repeat(500001)]) {
    const x = fixture(); mutate(x); assert.throws(() => adaptWritingSystemCandidates(x));
  }
});
