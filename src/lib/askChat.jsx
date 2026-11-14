import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useLocation, useMatch } from 'react-router-dom';
import { useConference } from './store.jsx';

const EXAMPLES = [
  'AI agent talks on Day 2 afternoon that are not full',
  'Who is speaking about platform engineering?',
  'How long does it take to get between the venues?',
];
const SESSION_CHIPS = ['Is this session full?', 'What else is on at the same time?', 'Who is speaking in it?'];
const SPEAKER_CHIPS = ['What is this speaker presenting?', 'Who else is speaking on the same topic?', 'Which of their sessions have seats left?'];

/** Quick questions that fit the page the attendee is on. */
export function chipsFor(pathname = '/') {
  if (/^\/sessions\/\d+$/.test(pathname)) return SESSION_CHIPS;
  if (/^\/speakers\/\d+$/.test(pathname)) return SPEAKER_CHIPS;
  return EXAMPLES;
}

const AskContext = createContext(null);
export const useAsk = () => useContext(AskContext);

/** The one Ask ORBIT conversation, shared by the panel and /ask, and the panel's open state. */
export function AskProvider({ children }) {
  const { clock, currentUserId } = useConference();
  const { pathname } = useLocation();
  const session = useMatch('/sessions/:id');
  const speaker = useMatch('/speakers/:id');
  // The transport reads the latest clock, attendee and page at send time, so a pinned ?at= is honoured.
  const live = useRef({});
  live.current = {
    clock, currentUserId, route: pathname,
    sessionId: session ? Number(session.params.id) : undefined,
    speakerId: speaker ? Number(speaker.params.id) : undefined,
  };
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/ask',
    prepareSendMessagesRequest: ({ messages }) => {
      const l = live.current;
      return { body: {
        messages, day: l.clock?.day ?? '', time: l.clock?.time ?? '', userId: l.currentUserId,
        route: l.route, sessionId: l.sessionId, speakerId: l.speakerId,
      } };
    },
  }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [open, setOpen] = useState(false);
  const launcherRef = useRef(null);

  const send = useCallback((text) => { sendMessage({ text }); }, [sendMessage]);
  const openAsk = useCallback((question) => {
    setOpen(true);
    if (question?.trim()) send(question.trim());
  }, [send]);
  const closeAsk = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  // /ask is the full-page view of the same chat: the panel makes way for it.
  useEffect(() => { if (pathname === '/ask') setOpen(false); }, [pathname]);

  const value = useMemo(() => ({
    messages, send, status, error, open, openAsk, closeAsk, launcherRef, chips: chipsFor(pathname),
  }), [messages, send, status, error, open, openAsk, closeAsk, pathname]);
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
