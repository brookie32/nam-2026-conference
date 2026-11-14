import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SessionResults, TravelResults } from './AskCards.jsx';
import { splitReply } from '../lib/splitReply.js';
import { useAsk } from '../lib/askChat.jsx';
import { Button, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

// Inline Markdown, in order of precedence: a link, **bold**, `code`, *italic* / _italic_.
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_/g;
const SESSION_HREF = /^\/sessions\/\d+$/;

/**
 * Inline Markdown in a reply line. Only a `/sessions/:id` link becomes a link — anything else is its
 * text — and bold may wrap a link. Unmatched `*` or `_` stay as typed.
 */
export function renderReply(text, keyPrefix = 'r') {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${m.index}`;
    if (m[1] !== undefined) {
      parts.push(SESSION_HREF.test(m[2])
        ? <Link key={key} to={m[2]} className="font-medium text-violet-300 underline-offset-2 hover:underline">{m[1]}</Link>
        : m[1]);
    } else if (m[3] !== undefined) {
      parts.push(<strong key={key} className="font-semibold text-ink">{renderReply(m[3], key)}</strong>);
    } else if (m[4] !== undefined) {
      parts.push(<code key={key} className="rounded bg-overlay px-1 py-0.5 text-[0.85em]">{m[4]}</code>);
    } else {
      parts.push(<em key={key}>{m[5] ?? m[6]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function ReplyBody({ blocks }) {
  return blocks.map((b, i) => b.list ? (
    b.list.ordered
      ? <ol key={i} className="my-1.5 list-decimal space-y-1 pl-5 marker:text-muted">{b.list.items.map((it, j) => <li key={j}>{renderReply(it)}</li>)}</ol>
      : <ul key={i} className="my-1.5 list-disc space-y-1 pl-5 marker:text-muted">{b.list.items.map((it, j) => <li key={j}>{renderReply(it)}</li>)}</ul>
  ) : b.heading ? (
    <p key={i} className="mt-2 mb-1 font-semibold text-ink">{renderReply(b.heading)}</p>
  ) : b.table ? (
    <div key={i} className="my-2 overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-muted">
          <tr>{b.table.head.map((h, c) => <th key={c} scope="col" className="whitespace-nowrap border-b border-hairline px-3 py-2 font-medium">{renderReply(h)}</th>)}</tr>
        </thead>
        <tbody>
          {b.table.rows.map((row, r) => (
            <tr key={r} className="border-t border-hairline first:border-t-0">
              {row.map((cell, c) => <td key={c} className="whitespace-nowrap px-3 py-2 align-top">{renderReply(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : <p key={i} className="my-1.5 whitespace-pre-wrap first:mt-0 last:mb-0">{renderReply(b.text)}</p>);
}

const SEARCHING = new Set(['tool-searchSessions', 'tool-findSpeakers', 'tool-venuesAndTravel']);

function Part({ part }) {
  if (part.type === 'text') return part.text.trim() ? <ReplyBody blocks={splitReply(part.text)} /> : null;
  if (part.type === 'tool-showSessions' && part.input?.ids) return <SessionResults ids={part.input.ids} />;
  if (part.type === 'tool-showTravel' && part.input?.fromVenueId) return <TravelResults {...part.input} />;
  if (SEARCHING.has(part.type) && (part.state === 'input-streaming' || part.state === 'input-available')) {
    return <p data-testid="ask-searching" className="text-muted">Searching the programme…</p>;
  }
  return null;
}

const textOf = (m) => m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('');

/** The conversation and its form. Shared by the panel and the full /ask page. */
export function AskChat() {
  const { messages, send: sendQuestion, status, error, chips } = useAsk();
  const [draft, setDraft] = useState('');
  const pending = status === 'submitted' || status === 'streaming';
  const notConfigured = /not configured/i.test(error?.message ?? '');
  const failed = Boolean(error) && !notConfigured;
  const end = useRef(null);

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages]);

  const send = (text) => {
    const question = text.trim();
    if (!question || pending) return;
    sendQuestion(question);
    setDraft('');
  };

  const submit = (e) => { e.preventDefault(); send(draft); };

  return (
    <div className="space-y-4">
      {notConfigured && (
        <p data-testid="ask-not-configured" role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Ask ORBIT isn't configured on this server yet.
        </p>
      )}

      <div data-testid="ask-messages" aria-live="polite" className="space-y-3">
        {messages.length === 0 && (
          <ul className="flex flex-wrap gap-2">
            {chips.map((q) => (
              <li key={q}>
                <button type="button" onClick={() => send(q)} disabled={pending}
                  className="min-h-11 rounded-xl border border-hairline bg-surface px-3 text-left text-sm text-muted transition-colors hover:text-ink">
                  {q}
                </button>
              </li>
            ))}
          </ul>
        )}
        {messages.map((m, i) => (
          <div key={m.id} data-role={m.role} className={cx(
            'max-w-[90%] min-w-0 rounded-2xl px-4 py-2.5 text-sm',
            m.role === 'user' ? 'ml-auto whitespace-pre-wrap bg-violet-500/15 text-ink' : 'border border-hairline bg-surface text-ink',
          )}>
            {m.role === 'assistant'
              ? (m.parts.some((p) => (p.type === 'text' && p.text.trim()) || p.type.startsWith('tool-'))
                ? m.parts.map((p, j) => <Part key={j} part={p} />)
                : <span className="text-muted">Thinking…</span>)
              : textOf(m)}
          </div>
        ))}
        {status === 'submitted' && <p className="text-sm text-muted">Thinking…</p>}
        {failed && <p role="alert" className="text-sm text-rose-300">That did not work. Try again.</p>}
        <div ref={end} />
      </div>

      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          data-testid="ask-input"
          aria-label="Your question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          rows={1}
          placeholder="Ask about the programme"
          className="min-h-11 w-full min-w-0 flex-1 resize-none rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted"
        />
        <Button type="submit" variant="primary" disabled={pending || !draft.trim()} className="min-h-11 shrink-0">
          <Icon name="chat" className="size-4" /> Send
        </Button>
      </form>
    </div>
  );
}
