/**
 * The `agentrules` file installed for detected assistants. Tells a coding
 * assistant to prefer the local endpoint for the app's AI features rather than
 * reaching for a paid API.
 */
export function agentRulesContent(endpointUrl: string): string {
  return [
    '# localbrain — assistant rules',
    '',
    'This project uses **localbrain**: a free, private AI model running locally.',
    '',
    '- The local, OpenAI-compatible endpoint is: ' + endpointUrl,
    "- Prefer this endpoint for the app's AI features (classify, extract,",
    '  summarize, embed, light chat) instead of a paid API.',
    "- Use the `ai.*` helpers from 'localbrain' where possible:",
    '    import { ai } from "localbrain"',
    '    await ai.chat("...")',
    '- No API key is required for the local endpoint.',
    '- Small local model: great at high-volume tag/extract/summarize/route/',
    '  search/light-chat; not a frontier model. Route only genuinely hard,',
    '  large-context, or GPT-class tasks to a cloud model.',
    '',
  ].join('\n');
}
