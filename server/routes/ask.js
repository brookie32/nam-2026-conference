import { Router } from 'express';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { agendaOn } from '../lib/agenda.js';
import { askModel, askSystemPrompt, askTools, pageContext, programmeOn } from '../lib/ask.js';

export const askRouter = Router();

const valid = ({ messages, day, time }) => Array.isArray(messages) && messages.length > 0 && messages.every((m) =>
  m && (m.role === 'user' || m.role === 'assistant') && Array.isArray(m.parts) && m.parts.length > 0)
  && typeof day === 'string' && typeof time === 'string';

/** POST /api/ask { messages: UIMessage[], day, time, userId } → an AI SDK UI message stream. */
askRouter.post('/', (req, res) => {
  const model = askModel();
  if (!model) return res.status(503).json({ error: 'Ask ORBIT is not configured' });
  const body = req.body ?? {};
  if (!valid(body)) return res.status(400).json({ error: 'messages must be UI messages, with day and time' });

  const result = streamText({
    model,
    system: askSystemPrompt({ day: body.day, time: body.time, agenda: agendaOn(Number(body.userId), body.day),
      programme: programmeOn(body.day), page: pageContext(body) }),
    messages: convertToModelMessages(body.messages),
    tools: askTools,
    stopWhen: stepCountIs(6),
    onError: ({ error }) => console.error('✗ ask', error),
  });
  // Tell proxies not to hold the stream back. The SDK writes the head with these, then each chunk as it comes.
  result.pipeUIMessageStreamToResponse(res, {
    headers: { 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
});
