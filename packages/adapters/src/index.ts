/**
 * Adapters.
 * Registries + shared machinery. Adding an assistant/framework = adding one
 * file here and registering it.
 */
import type { AssistantAdapter, FrameworkAdapter } from './types.js';
import { cursorAdapter } from './assistants/cursor.js';
import { claudeCodeAdapter } from './assistants/claude-code.js';
import { nextjsAdapter } from './frameworks/nextjs.js';
import { expressAdapter } from './frameworks/express.js';

export * from './types.js';
export * from './apply.js';
export { agentRulesContent } from './agentrules.js';

export const assistantAdapters: AssistantAdapter[] = [cursorAdapter, claudeCodeAdapter];
export const frameworkAdapters: FrameworkAdapter[] = [nextjsAdapter, expressAdapter];

export { cursorAdapter, claudeCodeAdapter, nextjsAdapter, expressAdapter };
