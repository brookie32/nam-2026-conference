import { Router } from 'express';
import { stepCountIs, streamText } from 'ai';
import { askModel, askSystemPrompt, askTools } from '../lib/ask.js';

export const askRouter = Router();

const valid = (messages) => Array.isArray(messages) && messages.length > 0 && messages.every((m) =>
  m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim());

/** POST /api/ask { messages: [{ role, content }] } → a plain text stream. */
askRouter.post('/', (req, res) => {
  const model = askModel();
  if (!model) return res.status(503).json({ error: 'Ask ORBIT is not configured' });
  const { messages } = req.body ?? {};
  if (!valid(messages)) return res.status(400).json({ error: 'messages must be a non-empty array of { role, content }' });

  const result = streamText({
    model,
    system: askSystemPrompt(),
    messages: messages.map(({ role, content }) => ({ role, content })),
    tools: askTools,
    stopWhen: stepCountIs(6),
    onError: ({ error }) => console.error('✗ ask', error),
  });
  result.pipeTextStreamToResponse(res);
});
