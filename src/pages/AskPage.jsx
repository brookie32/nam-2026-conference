import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useConference } from '../lib/store.jsx';
import { SessionResults, TravelResults } from '../components/AskCards.jsx';
import { splitReply } from '../lib/splitReply.js';
import { Button, SectionHeader, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const SESSION_HREF = /^\/sessions\/\d+$/;

/** Markdown links in a reply: only `/sessions/:id` becomes a link, anything else is its text. */
export function renderReply(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(SESSION_HREF.test(m[2])
      ? <Link key={m.index} to={m[2]} className="font-medium text-violet-300 underline-offset-2 hover:underline">{m[1]}</Link>
      : m[1]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function ReplyBody({ blocks }) {
  return blocks.map((b, i) => b.table ? (
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
  ) : <span key={i} className="whitespace-pre-wrap">{renderReply(b.text)}</span>);
}

const EXAMPLES = [
  'AI agent talks on Day 2 afternoon that are not full',
  'Who is speaking about platform engineering?',
  'How long does it take to get between the venues?',
];

function Part({ part }) {
  if (part.type === 'text') return part.text.trim() ? <ReplyBody blocks={splitReply(part.text)} /> : null;
  if (part.type === 'tool-showSessions' && part.input?.ids) return <SessionResults ids={part.input.ids} />;
  if (part.type === 'tool-showTravel' && part.input?.fromVenueId) return <TravelResults {...part.input} />;
  return null;
}

const textOf = (m) => m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('');

export function AskPage() {
  useDocumentTitle('Ask ORBIT');
  const { clock, currentUserId } = useConference();
  // The transport reads the latest clock and attendee at send time, so a pinned ?at= is honoured.
  const live = useRef({});
  live.current = { clock, currentUserId };
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/ask',
    prepareSendMessagesRequest: ({ messages }) => ({
      body: { messages, day: live.current.clock?.day ?? '', time: live.current.clock?.time ?? '', userId: live.current.currentUserId },
    }),
  }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [draft, setDraft] = useState('');
  const pending = status === 'submitted' || status === 'streaming';
  const notConfigured = /not configured/i.test(error?.message ?? '');
  const failed = Boolean(error) && !notConfigured;
  const end = useRef(null);

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages]);

  const send = (text) => {
    const question = text.trim();
    if (!question || pending) return;
    sendMessage({ text: question });
    setDraft('');
  };

  const submit = (e) => { e.preventDefault(); send(draft); };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Ask the programme"
        title="Ask ORBIT"
        description="Ask about sessions, speakers, venues and getting between them. Answers come from the programme and link to the sessions they name."
      />

      {notConfigured && (
        <p data-testid="ask-not-configured" role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Ask ORBIT isn't configured on this server yet.
        </p>
      )}

      <div data-testid="ask-messages" aria-live="polite" className="space-y-3">
        {messages.length === 0 && (
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
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
