const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isPipeLine = (line) => line.trim().startsWith('|');

/**
 * Splits an Ask ORBIT reply into `{ text }` and `{ table: { head, rows } }` blocks. A table is a run of
 * `|` lines whose second line is a separator row; anything else (a half-streamed table, a lone `|`
 * line) stays text.
 */
export function splitReply(reply) {
  const lines = reply.split('\n');
  const blocks = [];
  let text = [];
  const flush = () => {
    const t = text.join('\n');
    if (t.trim()) blocks.push({ text: t });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (isPipeLine(lines[i]) && i + 1 < lines.length && isPipeLine(lines[i + 1]) && SEPARATOR.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = cells(lines[i]);
      let j = i + 2;
      const rows = [];
      while (j < lines.length && isPipeLine(lines[j])) {
        const row = cells(lines[j]);
        while (row.length < head.length) row.push('');
        rows.push(row);
        j++;
      }
      flush();
      blocks.push({ table: { head, rows } });
      i = j - 1;
    } else {
      text.push(lines[i]);
    }
  }
  flush();
  return blocks;
}
