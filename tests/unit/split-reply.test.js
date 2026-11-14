import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { splitReply } from '../../src/lib/splitReply.js';

describe('splitReply: Markdown tables in an Ask ORBIT reply', () => {
  test('a header, separator and body rows become one table block between text', () => {
    const blocks = splitReply('Here:\n| Mode | Time |\n| --- | :--: |\n| Walk | 10 min |\n| Bus | 4 min |\nDone.');
    assert.deepEqual(blocks, [
      { text: 'Here:' },
      { table: { head: ['Mode', 'Time'], rows: [['Walk', '10 min'], ['Bus', '4 min']] } },
      { text: 'Done.' },
    ]);
  });

  test('without a separator row (half-streamed, or a lone pipe line) it stays text', () => {
    assert.deepEqual(splitReply('| Mode | Time |'), [{ text: '| Mode | Time |' }]);
    assert.deepEqual(splitReply('| Mode | Time |\n| Walk | 10 |'), [{ text: '| Mode | Time |\n| Walk | 10 |' }]);
  });

  test('plain text and the empty string pass through', () => {
    assert.deepEqual(splitReply('just words'), [{ text: 'just words' }]);
    assert.deepEqual(splitReply(''), []);
  });

  test('a separator-only streamed table is a table with no rows; short rows are padded', () => {
    assert.deepEqual(splitReply('|A|B|\n|---|---|'), [{ table: { head: ['A', 'B'], rows: [] } }]);
    assert.deepEqual(splitReply('|A|B|\n|---|---|\n|x|').at(0).table.rows, [['x', '']]);
  });
});
