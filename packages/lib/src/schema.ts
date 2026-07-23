import type { ExtractSchema } from './types.js';

/**
 * Turn the `ai.extract` schema argument into a JSON Schema for the endpoint's
 * constrained decoding. Accepts either:
 *   - an already-formed JSON Schema (has `type`/`properties`), passed through, or
 *   - an example object whose value types become the field types, e.g.
 *       { name: '', date: '', amount: 0, active: true, tags: [''] }
 */
export function toJsonSchema(schema: ExtractSchema): object {
  if (looksLikeJsonSchema(schema)) return schema;
  return exampleToJsonSchema(schema);
}

function looksLikeJsonSchema(s: ExtractSchema): boolean {
  return (
    typeof s === 'object' &&
    s != null &&
    (('type' in s && (s as Record<string, unknown>)['type'] === 'object') ||
      ('properties' in s && typeof (s as Record<string, unknown>)['properties'] === 'object'))
  );
}

function exampleToJsonSchema(example: Record<string, unknown>): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(example)) {
    properties[key] = valueToSchema(value);
    required.push(key);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

function valueToSchema(value: unknown): object {
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  if (Array.isArray(value)) {
    const items = value.length > 0 ? valueToSchema(value[0]) : { type: 'string' };
    return { type: 'array', items };
  }
  if (value && typeof value === 'object') {
    return exampleToJsonSchema(value as Record<string, unknown>);
  }
  return { type: 'string' };
}
