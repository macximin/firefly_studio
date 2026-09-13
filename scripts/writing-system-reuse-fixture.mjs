#!/usr/bin/env node
// Execute complete pinned AuthorAgent service modules in an isolated directory.
// Type stripping and one local import are the only source transformations.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import childProcess from 'node:child_process';
import { adaptWritingSystemCandidates } from './writing-system-candidates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.firefly/research/ready-made-writing-20260911');
const supplement = path.join(root, '.firefly/research/writing-system-reuse-20260912');
const receipt = JSON.parse(await fs.readFile(path.join(cache, 'research-receipt.json'), 'utf8'));
const extra = JSON.parse(await fs.readFile(path.join(supplement, 'fetch-receipt.json'), 'utf8'));
const tree = JSON.parse(await fs.readFile(path.join(cache, 'Ckokoski__AuthorAgent/tree.json'), 'utf8'));
const sources = [];
const commit = '47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c';
function sha(data) { return createHash('sha256').update(data).digest('hex'); }
async function verified(relative, extraFile = false) {
  const entry = (extraFile ? extra : receipt).files.find(x => x.path === relative);
  assert(entry, `Missing pinned source ${relative}`);
  const bytes = await fs.readFile(path.join(extraFile ? supplement : cache, relative));
  assert.equal(sha(bytes), entry.sha256, `Changed pinned source ${relative}`);
  const upstream = relative.replace('Ckokoski__AuthorAgent/', '').replace(/^source\//, '');
  const gitBlobSha1 = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitBlobSha1, tree.tree.find(x => x.path === upstream)?.sha);
  sources.push({ path: relative, sha256: entry.sha256, gitBlobSha1, commit });
  return bytes.toString('utf8');
}
const service = await verified('Ckokoski__AuthorAgent/source/gateway/src/services/character-agent.ts');
const evolver = await verified('Ckokoski__AuthorAgent/source/gateway/src/services/prose-evolver.ts');
const parser = await verified('Ckokoski__AuthorAgent/gateway/src/services/dialogue-parser.ts', true);
await verified('Ckokoski__AuthorAgent/LICENSE', true);
const deny = () => { throw new Error('fixture network/process denied'); };
globalThis.fetch = deny;
http.request = http.get = https.request = https.get = net.connect = net.createConnection = deny;
childProcess.exec = childProcess.execFile = childProcess.spawn = childProcess.fork = childProcess.execSync = childProcess.execFileSync = childProcess.spawnSync = deny;
syncBuiltinESMExports();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'firefly-authoragent-fixture-'));
try {
  await fs.writeFile(path.join(temp, 'package.json'), '{"type":"module"}');
  for (const [name, source] of [['character-agent.js', service], ['prose-evolver.js', evolver], ['dialogue-parser.js', parser]]) {
    await fs.writeFile(path.join(temp, name), stripTypeScriptTypes(source));
  }
  const { CharacterAgentService } = await import(pathToFileURL(path.join(temp, 'character-agent.js')).href);
  const { ProseEvolverService } = await import(pathToFileURL(path.join(temp, 'prose-evolver.js')).href);
  const agent = new CharacterAgentService();
  const entity = name => ({ id: name, type: 'character', name, aliases: [], description: 'A cook who wants evenings with his daughter.', attributes: {}, changes: [] });
  let mockCalls = 0;
  const complete = async () => { mockCalls++; return { text: '{"flags":[]}' }; };
  const select = () => ({ id: 'fixture' });
  const korean = '“오늘은 여섯 시에 갑니다.” 지훈이 말했다.\n\n“딸과 약속했어요.” 지훈이 덧붙였다.\n\n“돈 때문은 아닙니다.” 지훈이 답했다.';
  const english = '“I leave at six.” Jihoon said.\n\n“I promised my daughter.” Jihoon added.\n\n“It is not about money.” Jihoon replied.';
  const ko = await agent.critiqueDialogue({ projectId: 'fixture', chapterText: korean }, complete, select, [entity('지훈')], []);
  assert.equal(ko.charactersReviewed.length, 0);
  assert.equal(mockCalls, 0);
  const en = await agent.critiqueDialogue({ projectId: 'fixture', chapterText: english }, complete, select, [entity('Jihoon')], []);
  assert.equal(en.byCharacter[0].linesReviewed, 3);
  assert.equal(mockCalls, 1);
  const brief = agent.buildCharacterBrief(entity('지훈'), [
    { chapterNumber: 2, title: '식당', characters: ['지훈', '민호'], endingState: '지훈이 퇴근한다. 같은 화의 별도 장면에서 민호는 금고 비밀번호를 바꾼다.' },
    { chapterNumber: 20, title: '미래', characters: ['지훈'], endingState: '후반부 범인의 정체를 안다.' },
  ]);
  assert.equal(brief.knowledgeHorizon.latestChapterPresent, 20);
  assert(brief.knowledgeHorizon.knownEvents.some(x => x.includes('금고 비밀번호')));
  const invented = await agent.critiqueDialogue({ projectId: 'fixture', chapterId: 'fixture-chapter', chapterText: english }, async () => {
    mockCalls++; return { text: JSON.stringify({ flags: [{ line: 'This line does not exist.', issue: 'off-motivation', reason: 'Scripted fixture', suggestion: 'Replacement' }] }) };
  }, select, [entity('Jihoon')], []);
  assert.equal(invented.totalFlags, 1);
  const externalInput = {
    schemaVersion: 'writing-system-review-input/v1', manuscript: { text: english, chapterId: 'fixture-chapter', sha256: sha(english) },
    producer: { repository: 'Ckokoski/AuthorAgent', commit, mode: 'scripted-fixture' }, report: invented,
    dialogueAttributions: ['I leave at six.', 'I promised my daughter.', 'It is not about money.'].map(quote => ({
      character: 'Jihoon', quote, start: english.indexOf(quote), end: english.indexOf(quote) + quote.length, provenance: 'independent explicit fixture attribution',
    })),
  };
  const guarded = adaptWritingSystemCandidates(externalInput);
  assert.equal(guarded.candidates.length, 0);
  assert.equal(guarded.rejected[0].reason, 'unbound-quote-or-speaker');
  const grounded = await agent.critiqueDialogue({ projectId: 'fixture', chapterId: 'fixture-chapter', chapterText: english }, async () => {
    mockCalls++; return { text: JSON.stringify({ flags: [{ line: 'I leave at six.', issue: 'off-voice', reason: 'Scripted fixture diagnosis', suggestion: 'I need to leave at six.' }] }) };
  }, select, [entity('Jihoon')], []);
  const candidateOutput = adaptWritingSystemCandidates({ ...externalInput, report: grounded });
  assert.equal(candidateOutput.candidates.length, 1);
  assert.equal(candidateOutput.canonApplied, false);
  const malformed = await agent.critiqueDialogue({ projectId: 'fixture', chapterText: english }, async () => {
    mockCalls++; return { text: '{malformed' };
  }, select, [entity('Jihoon')], []);
  assert.equal(malformed.charactersReviewed.length, 1);
  assert.equal(malformed.totalFlags, 0);
  const original = '지훈은 계약서를 한참 들여다보았다. 돈은 충분했다. 그러나 딸과 약속한 저녁 시간을 다시 팔 생각은 없었다.';
  const candidate = '지훈은 여섯 시 퇴근이라는 문구에 밑줄을 그었다. 계약금을 확인하던 손이 멈췄다. 딸과 한 약속은 저 숫자보다 오래 남았다.';
  const evolution = new ProseEvolverService();
  let scoreCalls = 0, reviseCalls = 0;
  const judge = { evaluate: async () => {
    scoreCalls++;
    return { score: scoreCalls === 1 ? 70 : scoreCalls === 2 ? 80 : 75, judge: { topIssues: ['fixture issue'] }, mechanical: { issues: [] } };
  } };
  const evolved = await evolution.evolve({ passage: original, rounds: 2 }, {
    writingJudge: judge, aiSelectProvider: select, aiComplete: async args => {
      mockCalls++;
      if (args.maxTokens === 500) return { text: '1. Preserve the concrete choice.' };
      reviseCalls++;
      return { text: reviseCalls === 1 ? candidate : candidate + ' 거절했다.' };
    },
  });
  assert.equal(evolved.original.text, original);
  assert.equal(evolved.best.text, candidate);
  assert.deepEqual(evolved.rounds.map(x => x.accepted), [true, false]);
  assert.equal(evolved.totalCalls, 7);
  assert.equal(evolution.estimateCalls(999), 16);
  const result = {
    system: 'AuthorAgent', checksPassed: 12, mockModelCalls: mockCalls, mockJudgeCalls: scoreCalls, liveModelCalls: 0,
    executed: ['complete character-agent.ts and dialogue-parser.ts modules', 'buildCharacterBrief', 'critiqueDialogue', 'ProseEvolverService.evolve', 'estimateCalls'],
    observed: { koreanDialogueCharactersReviewed: ko.charactersReviewed.length, englishDialogueLinesReviewed: en.byCharacter[0].linesReviewed,
      coAppearanceSummaryTreatedAsKnowledge: true, futureSummaryIncludedWithoutTargetCutoff: true,
      inventedQuotedLineAccepted: true, malformedModelOutputIndistinguishableFromZeroFlags: true,
      adapterRejectsUnboundUpstreamFlag: true, adapterPreservesGroundedUpstreamFlagAsCandidate: true,
      originalPreserved: true, lowerScoredCandidateRejected: true, twoRoundReportedCalls: evolved.totalCalls, maximumEstimatedCalls: evolution.estimateCalls(999) },
    notExecuted: ['full application startup', 'real character critique', 'real revision', 'real WritingJudge', 'Korean prose quality assessment'],
  };
  console.log(JSON.stringify({ result, sources }));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
