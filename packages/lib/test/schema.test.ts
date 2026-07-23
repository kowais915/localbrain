import { describe, it, expect } from 'vitest';
import { toJsonSchema } from '../src/schema.js';

describe('toJsonSchema', () => {
  it('converts an example object to a JSON schema with typed fields', () => {
    const schema = toJsonSchema({ name: '', amount: 0, ratio: 1.5, active: true, tags: [''] }) as {
      type: string;
      properties: Record<string, { type: string; items?: { type: string } }>;
      required: string[];
    };
    expect(schema.type).toBe('object');
    expect(schema.properties.name!.type).toBe('string');
    expect(schema.properties.amount!.type).toBe('integer');
    expect(schema.properties.ratio!.type).toBe('number');
    expect(schema.properties.active!.type).toBe('boolean');
    expect(schema.properties.tags!.type).toBe('array');
    expect(schema.properties.tags!.items!.type).toBe('string');
    expect(schema.required).toEqual(['name', 'amount', 'ratio', 'active', 'tags']);
  });

  it('passes through an already-formed JSON schema', () => {
    const input = { type: 'object', properties: { x: { type: 'number' } } };
    expect(toJsonSchema(input)).toBe(input);
  });

  it('handles nested objects', () => {
    const schema = toJsonSchema({ user: { id: 0, name: '' } }) as {
      properties: { user: { type: string; properties: Record<string, { type: string }> } };
    };
    expect(schema.properties.user.type).toBe('object');
    expect(schema.properties.user.properties.id!.type).toBe('integer');
  });
});
