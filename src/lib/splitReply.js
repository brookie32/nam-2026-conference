const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,4}\s+(.*)$/;

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isPipeLine = (line) => line.trim().startsWith('|');

/**
 * Splits an Ask ORBIT reply into blocks the chat renders as formatted text:
 * `{ text }` (a paragraph), `{ heading }`, `{ list: { ordered, items } }` and
 * `{ table: { head, rows } }`. A table is a run of `|` lines whose second line is a
 * separator row; anything else (a half-streamed table, a lone `|` line) stays text.
 * Inline Markdown — bold, italic, code, links — is left in the strings for the renderer.
 */
export function splitReply(reply) {
  const lines = reply.split('\n');
  const blocks = [];
  let text = [];
  let list = null;
  const flushText = () => {
    const t = text.join('\n');
    if (t.trim()) blocks.push({ text: t });
    text = [];
  };
  const flushList = () => {
    if (list) blocks.push({ list });
    list = null;
  };
  const flush = () => { flushText(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isPipeLine(line) && i + 1 < lines.length && isPipeLine(lines[i + 1]) && SEPARATOR.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = cells(line);
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
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = !bullet && NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      flushText();
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)[1]);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ heading: heading[1] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    flushList();
    text.push(line);
  }
  flush();
  return blocks;
}
