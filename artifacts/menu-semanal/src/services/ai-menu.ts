import type { DayMenu } from '@workspace/api-client-react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Send a chat message to the backend /api/menus/chat endpoint.
 * The backend handles:
 * - Including the current menu as context
 * - Constraint parsing from conversation history
 * - Incremental modifications (only changes what's asked)
 * - Saving the updated menu to DB
 */
export async function chatWithMenuAgent(
  messages: ChatMessage[],
  menuId?: number,
  userId?: number,
): Promise<{ reply: string; updatedMenu?: any }> {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  // Extract the latest user message
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) {
    return { reply: 'No message provided.' };
  }

  // Send conversation history (all except the last user message)
  const history = messages.slice(0, -1);

  const res = await fetch(`${API_URL}/api/menus/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-User-Id': String(userId) } : {}),
    },
    body: JSON.stringify({
      message: lastUserMessage.content,
      history,
      menuId,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `Error ${res.status}` }));
    throw new Error(errData.error || `Error del servidor (${res.status})`);
  }

  const data = await res.json();
  return {
    reply: data.reply ?? '',
    updatedMenu: data.updatedMenu ?? undefined,
  };
}
