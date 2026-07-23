import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { sha256File, verifyChecksum } from '../src/downloader.js';

describe('checksum helpers', () => {
  it('computes and verifies a SHA-256', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lb-dl-'));
    const file = path.join(dir, 'blob.bin');
    const data = Buffer.from('localbrain test payload');
    await fsp.writeFile(file, data);
    const expected = crypto.createHash('sha256').update(data).digest('hex');

    expect(await sha256File(file)).toBe(expected);
    expect(await verifyChecksum(file, expected)).toBe(true);
    expect(await verifyChecksum(file, 'deadbeef')).toBe(false);
  });
});
