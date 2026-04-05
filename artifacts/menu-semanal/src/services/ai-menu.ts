import type { Recipe } from '@workspace/api-client-react';
import type { DayMenu } from '@workspace/api-client-react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function buildSystemPrompt(recipes: Recipe[]): string {
  const byCategory = (cat: string) =>
    recipes
      .filter((r) => r.category === cat)
      .map((r) => `  - ${r.name} (id:${r.id})`)
      .join('\n');

  const primeros = byCategory('primero');
  const segundos = byCategory('segundo');
  const otros = byCategory('otro');

  return `Eres un asistente de planificación de menús semanales en español, experto en cocina tradicional española.

RECETAS DISPONIBLES:
Primeros:
${primeros || '  (ninguno disponible)'}

Segundos:
${segundos || '  (ninguno disponible)'}

Otros:
${otros || '  (ninguno disponible)'}

Tu tarea es ayudar al usuario a crear un menú semanal de lunes a domingo usando SOLO las recetas de la lista anterior.

COMPORTAMIENTO:
- Si el usuario da instrucciones o preferencias (sin pedir explícitamente generar), responde confirmando que las has entendido y pregunta si quiere añadir más o generar el menú.
- Si el usuario pide generar el menú (dice "genera", "hazlo", "ya", "sí", "crea el menú", "ok", "adelante"), genera el menú completo.
- Responde siempre en español, de forma natural y amigable.

CUANDO GENERES EL MENÚ, incluye el JSON dentro de las etiquetas <MENU>...</MENU> usando EXACTAMENTE esta estructura:
<MENU>
{
  "days": [
    {
      "day": "Lunes",
      "lunch": {
        "primero": {"id":"ID_EXACTO","name":"NOMBRE_EXACTO","category":"primero"},
        "segundo": {"id":"ID_EXACTO","name":"NOMBRE_EXACTO","category":"segundo"}
      },
      "dinner": {
        "primero": null,
        "segundo": {"id":"ID_EXACTO","name":"NOMBRE_EXACTO","category":"segundo"}
      }
    }
  ]
}
</MENU>

REGLAS para el JSON:
- Incluye los 7 días en orden: ${DAYS_ES.join(', ')}.
- Usa los IDs y nombres EXACTOS de la lista de recetas.
- Un campo puede ser null si no hay plato para ese slot.
- Típicamente la comida tiene primero+segundo y la cena solo segundo, salvo instrucciones distintas.
- Después del bloque <MENU>...</MENU>, añade una breve explicación del menú generado.`;
}

export async function chatWithMenuAgent(
  _azureEndpoint: string,
  _azureDeployment: string,
  _azureApiKey: string,
  messages: ChatMessage[],
  recipes: Recipe[],
  userId?: number,
): Promise<{ text: string; menu?: DayMenu[] }> {
  const systemPrompt = buildSystemPrompt(recipes);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const res = await fetch(`${API_URL}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-User-Id': String(userId) } : {}),
    },
    body: JSON.stringify({
      systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `Error ${res.status}` }));
    throw new Error(errData.error || `Error del servidor (${res.status})`);
  }

  const data = await res.json();
  const text: string = data.text ?? '';

  // Try to parse embedded menu JSON
  const menuMatch = text.match(/<MENU>([\s\S]*?)<\/MENU>/);
  if (menuMatch) {
    try {
      const parsed = JSON.parse(menuMatch[1].trim()) as { days: DayMenu[] };
      const menu: DayMenu[] = parsed.days;
      const explanationText = text.replace(/<MENU>[\s\S]*?<\/MENU>/g, '').trim();
      return {
        text: explanationText || '✅ Menú generado según tus instrucciones.',
        menu,
      };
    } catch {
      // JSON malformed — return as plain text
    }
  }

  return { text };
}
