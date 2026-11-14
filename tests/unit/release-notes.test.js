import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE_NOTES, issueUrl } from '../../src/lib/releaseNotes.js';

test('six groups, in the ticket order', () => {
  assert.deepEqual(RELEASE_NOTES.map((g) => g.group),
    ['Home', 'My Agenda', 'Finding talks', 'Ask ORBIT', 'Mobile', 'Everywhere']);
});

test('every ticket issue number is listed exactly once', () => {
  const want = [16, 23, 24, 39, 45, 54, 15, 21, 22, 47, 36, 46, 1, 17, 20, 41, 44, 48, 2, 3, 25, 4, 5, 18, 11, 13, 19];
  const got = RELEASE_NOTES.flatMap((g) => g.items.flatMap((i) => i.issues));
  assert.deepEqual([...got].sort((a, b) => a - b), [...want].sort((a, b) => a - b));
});

test('issueUrl points at the fork', () => {
  assert.equal(issueUrl(56), 'https://github.com/brookie32/nam-2026-conference/issues/56');
});
