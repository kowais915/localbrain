import http from 'node:http';
import net from 'node:net';
import type { Engine, ChatMessage } from './inference.js';

/**
 * OpenAI-compatible HTTP server.
 * The universal contract: the user's app, any coding assistant, and any
 * language talk to the same local server. No API key required.
 *
 * Routes:
 *   POST /v1/chat/completions   (streaming via SSE + non-streaming)
 *   POST /v1/embeddings
 *   GET  /v1/models
 *   GET  /health
 */

export const DEFAULT_PORT = 4141;

/** Debug logger, gated on LOCALBRAIN_DEBUG. */
const DEBUG = !!process.env.LOCALBRAIN_DEBUG;
function dbg(...args: unknown[]): void {
  if (DEBUG) console.error('[localbrain:server]', ...args);
}

/**
 * Hard ceiling on how long the server will keep generating for one request.
 * A stalled or runaway generation is aborted at this point so it stops holding
 * the shared inference lock and every request queued behind it can proceed.
 * Slightly above a typical client timeout. Override with
 * LOCALBRAIN_REQUEST_TIMEOUT_MS.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.LOCALBRAIN_REQUEST_TIMEOUT_MS) || 120_000;

/**
 * Build an AbortSignal for one request that fires when either the client
 * disconnects (so we don't keep generating for someone who left) or the
 * server-side hard timeout elapses. Returns the signal plus a cleanup fn to
 * call once the request is fully handled.
 */
function requestAbort(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) {
      dbg('client disconnected before response finished — aborting generation');
      controller.abort(new Error('client disconnected'));
    }
  };
  const timer = setTimeout(() => {
    dbg(`request exceeded ${REQUEST_TIMEOUT_MS}ms — aborting generation`);
    controller.abort(new Error('server request timeout'));
  }, REQUEST_TIMEOUT_MS);
  timer.unref?.();
  req.on('close', onClose);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      req.off('close', onClose);
    },
  };
}

export interface ServerOptions {
  engine: Engine;
  port?: number;
  host?: string;
  /** Reported model id in responses; defaults to the engine's model spec id. */
  modelId?: string;
}

export interface RunningServer {
  url: string; // e.g. http://localhost:4141/v1
  port: number;
  stop(): Promise<void>;
}

interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stop?: string | string[];
  stream?: boolean;
  response_format?: { type?: string; json_schema?: { schema?: object } };
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const engine = opts.engine;
  const host = opts.host ?? '127.0.0.1';
  const modelId = opts.modelId ?? engine.modelInfo.spec.id;
  const port = await findFreePort(opts.port ?? DEFAULT_PORT);

  const server = http.createServer((req, res) => {
    handle(req, res, engine, modelId).catch((err) => {
      sendJson(res, 500, { error: { message: String((err as Error)?.message ?? err), type: 'internal_error' } });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/v1`;
  return {
    url,
    port,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        // Force-close idle AND active (keep-alive) connections so close() can't
        // hang waiting for a client that's holding the socket open.
        (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  engine: Engine,
  modelId: string,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (req.method === 'GET' && (path === '/health' || path === '/v1/health')) {
    sendJson(res, 200, { ok: true, model: modelId });
    return;
  }

  if (req.method === 'GET' && path === '/v1/models') {
    sendJson(res, 200, {
      object: 'list',
      data: [{ id: modelId, object: 'model', created: 0, owned_by: 'localbrain' }],
    });
    return;
  }

  if (req.method === 'POST' && path === '/v1/chat/completions') {
    const body = (await readJson(req)) as ChatCompletionRequest;
    if (!body?.messages || !Array.isArray(body.messages)) {
      sendJson(res, 400, { error: { message: '`messages` array is required', type: 'invalid_request_error' } });
      return;
    }
    const stop = typeof body.stop === 'string' ? [body.stop] : body.stop;
    const jsonSchema =
      body.response_format?.type === 'json_schema' ? body.response_format.json_schema?.schema : undefined;

    const { signal, cleanup } = requestAbort(req, res);
    const params = {
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      stop,
      jsonSchema,
      signal,
    };

    try {
      if (body.stream) {
        await streamChat(res, engine, modelId, params);
      } else {
        const content = await engine.completeText(params);
        if (!res.writableEnded) {
          sendJson(res, 200, chatCompletionPayload(modelId, content, 'stop'));
        }
      }
    } catch (err) {
      // Generation was aborted (client left or timed out) or failed. The client
      // is likely gone; just make sure we don't leave the socket hanging.
      dbg('chat request ended with error:', (err as Error)?.message ?? err);
      if (!res.writableEnded) {
        sendJson(res, 500, {
          error: { message: String((err as Error)?.message ?? err), type: 'internal_error' },
        });
      }
    } finally {
      cleanup();
    }
    return;
  }

  if (req.method === 'POST' && path === '/v1/embeddings') {
    const body = (await readJson(req)) as { input?: string | string[]; model?: string };
    const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ''];
    const data = [];
    for (let i = 0; i < inputs.length; i++) {
      const embedding = await engine.embed(inputs[i] ?? '');
      data.push({ object: 'embedding', index: i, embedding });
    }
    sendJson(res, 200, { object: 'list', data, model: modelId });
    return;
  }

  sendJson(res, 404, { error: { message: `Not found: ${req.method} ${path}`, type: 'invalid_request_error' } });
}

function chatCompletionPayload(model: string, content: string, finishReason: string) {
  return {
    id: `chatcmpl-local-${randomId()}`,
    object: 'chat.completion',
    created: Math.floor(fixedNow() / 1000),
    model,
    choices: [
      { index: 0, message: { role: 'assistant', content }, finish_reason: finishReason },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function streamChat(
  res: http.ServerResponse,
  engine: Engine,
  model: string,
  params: Parameters<Engine['complete']>[0],
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const id = `chatcmpl-local-${randomId()}`;
  const created = Math.floor(fixedNow() / 1000);
  const base = { id, object: 'chat.completion.chunk', created, model };

  // First chunk announces the assistant role.
  writeSse(res, { ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });

  try {
    for await (const chunk of engine.complete(params)) {
      writeSse(res, { ...base, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] });
    }
    writeSse(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
  } catch (err) {
    writeSse(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'error' }], error: String((err as Error)?.message ?? err) });
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

function writeSse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function sendJson(res: http.ServerResponse, status: number, obj: unknown): void {
  const payload = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function randomId(): string {
  // Not security-sensitive; a per-process counter avoids Math.random.
  randomIdCounter += 1;
  return `${process.pid.toString(36)}${randomIdCounter.toString(36)}`;
}
let randomIdCounter = 0;

function fixedNow(): number {
  return Date.now();
}

/** Find a free port starting from `preferred`. */
export async function findFreePort(preferred: number = DEFAULT_PORT): Promise<number> {
  for (let port = preferred; port < preferred + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  // Fall back to an OS-assigned port.
  return 0;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}
