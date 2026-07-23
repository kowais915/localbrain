/**
 * Typed, actionable errors.
 * Every error points the user at the fix — usually `localbrain doctor`.
 */

export type LocalbrainErrorCode =
  | 'ENDPOINT_DOWN'       // nothing listening on the endpoint
  | 'MODEL_NOT_READY'     // server up but model still loading / not downloaded
  | 'TIMEOUT'             // request exceeded timeoutMs
  | 'BAD_RESPONSE'        // endpoint returned malformed / non-OpenAI payload
  | 'SCHEMA_VIOLATION'    // extract() output failed schema validation
  | 'ABORTED';            // caller aborted via signal

export class LocalbrainError extends Error {
  readonly code: LocalbrainErrorCode;
  /** One-line, user-facing next step. */
  readonly hint: string;
  override readonly cause?: unknown;

  constructor(code: LocalbrainErrorCode, message: string, hint: string, cause?: unknown) {
    super(message);
    this.name = 'LocalbrainError';
    this.code = code;
    this.hint = hint;
    this.cause = cause;
  }
}

export const HINTS = {
  ENDPOINT_DOWN:
    'The local endpoint is not responding. Start it with `localbrain start`, or run `localbrain doctor`.',
  MODEL_NOT_READY:
    'The model is still loading or not downloaded yet. Run `localbrain doctor` to check status.',
  TIMEOUT:
    'The request timed out. The model may be cold-starting; retry, or run `localbrain doctor`.',
} as const;
