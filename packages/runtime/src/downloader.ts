import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { ModelSpec } from './models.js';
import {
  ensureDir,
  freeDiskBytes,
  modelCachePath,
  modelLicensePath,
  modelsDir,
} from './paths.js';

/**
 * Zero-auth model downloader.
 *
 * Happy path: anonymous HTTPS GET from own CDN → resume on drop → verify
 * SHA-256 → cache globally → run on a prebuilt binary. No HF account, no token,
 * no license click-through, no compiler.
 */

const DISK_HEADROOM_BYTES = 512 * 1024 * 1024; // 512MB headroom beyond the model

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  ratio: number; // 0..1 (0 when total unknown)
  bytesPerSec: number;
  sourceIndex: number; // which mirror in the chain
}

export interface DownloadOptions {
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  /** Honor HTTP(S)_PROXY / npm proxy. */
  proxy?: string;
}

export type DownloadError =
  | { code: 'INSUFFICIENT_DISK'; needBytes: number; freeBytes: number }
  | { code: 'CHECKSUM_MISMATCH'; expected: string; actual: string }
  | { code: 'ALL_MIRRORS_FAILED'; lastStatus?: number; detail?: string }
  | { code: 'ABORTED' }
  | { code: 'OFFLINE' };

export type DownloadResult =
  | { ok: true; path: string; fromCache: boolean; sha256: string; sizeBytes: number }
  | { ok: false; error: DownloadError };

/** Stream a file through sha256 and return the lowercase hex digest. */
export async function verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
  const actual = await sha256File(filePath);
  return actual.toLowerCase() === expectedSha256.toLowerCase();
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const rs = fs.createReadStream(filePath);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve());
    rs.on('error', reject);
  });
  return hash.digest('hex');
}

function resolveProxy(explicit?: string): string | undefined {
  return (
    explicit ??
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.npm_config_https_proxy ??
    process.env.npm_config_proxy ??
    undefined
  );
}

/**
 * Download (or return cached) a model file.
 *
 * 1. If the content-addressed cache file exists and verifies → return it.
 * 2. Pre-flight disk check: refuse if free < size + headroom.
 * 3. Resumable ranged GET; on failure, advance to the next mirror.
 * 4. Stream to a .part file; on completion verify SHA-256 (when pinned), then
 *    atomically rename into the content-addressed cache path.
 * 5. Write the model's LICENSE text alongside it.
 *
 * When `spec.sha256` is empty (not yet pinned) the cache filename falls back to
 * the model id and verification is skipped with a warning; the observed hash is
 * returned so it can be pinned in the manifest.
 */
export async function downloadModel(spec: ModelSpec, opts: DownloadOptions = {}): Promise<DownloadResult> {
  await ensureDir(modelsDir());

  const hasPinnedHash = spec.sha256.length === 64;
  const finalPath = hasPinnedHash ? modelCachePath(spec.sha256) : modelCachePath(`byid-${spec.id}`);

  // 1. Cache hit.
  if (fs.existsSync(finalPath)) {
    if (!hasPinnedHash || (await verifyChecksum(finalPath, spec.sha256))) {
      const st = await fsp.stat(finalPath);
      return { ok: true, path: finalPath, fromCache: true, sha256: hasPinnedHash ? spec.sha256 : await sha256File(finalPath), sizeBytes: st.size };
    }
    // Corrupt cache entry — remove and re-download.
    await fsp.rm(finalPath, { force: true });
  }

  // 2. Disk pre-flight (best effort; skip when size unknown).
  if (spec.sizeBytes > 0) {
    const free = await freeDiskBytes(modelsDir());
    if (free > 0 && free < spec.sizeBytes + DISK_HEADROOM_BYTES) {
      return { ok: false, error: { code: 'INSUFFICIENT_DISK', needBytes: spec.sizeBytes + DISK_HEADROOM_BYTES, freeBytes: free } };
    }
  }

  const partPath = `${finalPath}.part`;
  const proxy = resolveProxy(opts.proxy);
  let lastStatus: number | undefined;
  let lastDetail: string | undefined;

  // 3. Try each mirror in order, resuming a partial .part between attempts.
  for (let sourceIndex = 0; sourceIndex < spec.sources.length; sourceIndex++) {
    const url = spec.sources[sourceIndex]!;
    if (opts.signal?.aborted) return { ok: false, error: { code: 'ABORTED' } };
    try {
      await downloadWithResume(url, partPath, sourceIndex, proxy, opts);
    } catch (err) {
      const e = err as { status?: number; message?: string; name?: string };
      if (e?.name === 'AbortError') return { ok: false, error: { code: 'ABORTED' } };
      lastStatus = e?.status;
      lastDetail = e?.message;
      continue; // next mirror
    }

    // 4. Verify + atomically promote.
    const actualHash = await sha256File(partPath);
    if (hasPinnedHash && actualHash.toLowerCase() !== spec.sha256.toLowerCase()) {
      await fsp.rm(partPath, { force: true });
      return { ok: false, error: { code: 'CHECKSUM_MISMATCH', expected: spec.sha256, actual: actualHash } };
    }
    await fsp.rename(partPath, finalPath);

    // 5. Ship license text alongside the model (attribution).
    const licPath = hasPinnedHash ? modelLicensePath(spec.sha256) : modelLicensePath(`byid-${spec.id}`);
    await fsp.writeFile(licPath, `${spec.label}\nSPDX: ${spec.license}\n\n${spec.spdxLicenseText}\n`);

    const st = await fsp.stat(finalPath);
    return { ok: true, path: finalPath, fromCache: false, sha256: actualHash, sizeBytes: st.size };
  }

  // Distinguish an offline machine from mirrors that answered with errors.
  if (lastStatus == null && lastDetail && /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN/i.test(lastDetail)) {
    return { ok: false, error: { code: 'OFFLINE' } };
  }
  return { ok: false, error: { code: 'ALL_MIRRORS_FAILED', lastStatus, detail: lastDetail } };
}

/** Ranged, resumable GET into `partPath`. Throws {status,message} on HTTP error. */
async function downloadWithResume(
  url: string,
  partPath: string,
  sourceIndex: number,
  proxy: string | undefined,
  opts: DownloadOptions,
): Promise<void> {
  let existing = 0;
  try {
    existing = (await fsp.stat(partPath)).size;
  } catch {
    existing = 0;
  }

  const headers: Record<string, string> = {};
  if (existing > 0) headers['Range'] = `bytes=${existing}-`;

  const dispatcher = proxy ? await maybeProxyDispatcher(proxy) : undefined;
  const res = await fetch(url, {
    headers,
    signal: opts.signal,
    // @ts-expect-error undici-specific option, ignored when absent
    dispatcher,
  });

  if (!res.ok && res.status !== 206) {
    // 416 = range not satisfiable → start over.
    if (res.status === 416) {
      await fsp.rm(partPath, { force: true });
      return downloadWithResume(url, partPath, sourceIndex, proxy, opts);
    }
    const err = new Error(`HTTP ${res.status} for ${url}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (!res.body) {
    const err = new Error(`empty body for ${url}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const resuming = res.status === 206;
  const contentLen = Number(res.headers.get('content-length') ?? 0);
  const totalBytes = resuming && existing ? existing + contentLen : contentLen;

  const out = fs.createWriteStream(partPath, { flags: resuming ? 'a' : 'w' });
  let received = resuming ? existing : 0;
  const startedAt = Date.now();

  const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (opts.onProgress) {
      const elapsed = (Date.now() - startedAt) / 1000 || 1;
      opts.onProgress({
        receivedBytes: received,
        totalBytes,
        ratio: totalBytes ? received / totalBytes : 0,
        bytesPerSec: (received - (resuming ? existing : 0)) / elapsed,
        sourceIndex,
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    nodeStream.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    nodeStream.on('error', reject);
  });
}

/** Lazily build an undici ProxyAgent if a proxy is configured and available. */
async function maybeProxyDispatcher(proxy: string): Promise<unknown> {
  try {
    // Indirect specifier so TypeScript does not require `undici` at build time;
    // it is an optional runtime enhancement (global fetch already honors many proxies).
    const specifier = 'undici';
    const undici = (await import(specifier)) as { ProxyAgent?: new (uri: string) => unknown };
    if (undici.ProxyAgent) return new undici.ProxyAgent(proxy);
  } catch {
    // undici not present as a separate dep; global fetch still honors some env proxies.
  }
  return undefined;
}
