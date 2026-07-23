import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { backupsDir, transactionsDir, ensureDir } from '@localbrain/runtime';
import type { AdapterPlan, FileChange } from './types.js';

/**
 * Shared apply/undo machinery used by every adapter and by the CLI (`undo`).
 * Never modifies a file silently: caller shows the diff and confirms first.
 */

export interface AppliedChange extends FileChange {
  /** Path to the backup of the prior content (null if file was created). */
  backupPath: string | null;
}

export interface Transaction {
  id: string;
  createdAt: string;
  applied: AppliedChange[];
}

/**
 * Apply a plan's changes transactionally: back up existing files, write new
 * content, and record a manifest so `undo` can revert the whole set. On any
 * mid-apply failure, roll back everything already applied.
 */
export async function applyPlan(plan: AdapterPlan, txnId?: string): Promise<Transaction> {
  await ensureDir(backupsDir());
  await ensureDir(transactionsDir());

  const id = txnId ?? `txn-${process.pid}-${counter()}`;
  const txnBackupDir = path.join(backupsDir(), id);
  await ensureDir(txnBackupDir);

  const applied: AppliedChange[] = [];
  try {
    for (let i = 0; i < plan.changes.length; i++) {
      const change = plan.changes[i]!;
      let backupPath: string | null = null;
      if (fs.existsSync(change.path)) {
        backupPath = path.join(txnBackupDir, `${i}-${path.basename(change.path)}`);
        await fsp.copyFile(change.path, backupPath);
      }
      await ensureDir(path.dirname(change.path));
      await fsp.writeFile(change.path, change.after);
      applied.push({ ...change, backupPath });
    }
  } catch (err) {
    // Roll back what we already applied.
    await rollback(applied);
    throw err;
  }

  const txn: Transaction = { id, createdAt: nowIso(), applied };
  await fsp.writeFile(path.join(transactionsDir(), `${id}.json`), JSON.stringify(txn, null, 2));
  return txn;
}

async function rollback(applied: AppliedChange[]): Promise<void> {
  for (const change of [...applied].reverse()) {
    try {
      if (change.backupPath) await fsp.copyFile(change.backupPath, change.path);
      else await fsp.rm(change.path, { force: true });
    } catch {
      // best-effort
    }
  }
}

/** Revert the most recent transaction (spec `localbrain undo`). */
export async function undoLast(): Promise<{ reverted: number; id?: string }> {
  const dir = transactionsDir();
  let files: string[];
  try {
    files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return { reverted: 0 };
  }
  if (files.length === 0) return { reverted: 0 };

  const withTimes = await Promise.all(
    files.map(async (f) => ({ f, mtime: (await fsp.stat(path.join(dir, f))).mtimeMs })),
  );
  withTimes.sort((a, b) => b.mtime - a.mtime);
  const latest = withTimes[0]!.f;

  const txn = JSON.parse(await fsp.readFile(path.join(dir, latest), 'utf8')) as Transaction;
  await rollback(txn.applied);
  await fsp.rm(path.join(dir, latest), { force: true });
  return { reverted: txn.applied.length, id: txn.id };
}

let _counter = 0;
function counter(): string {
  _counter += 1;
  return _counter.toString(36);
}
function nowIso(): string {
  return new Date().toISOString();
}
