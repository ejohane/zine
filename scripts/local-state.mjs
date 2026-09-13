import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function replaceLocalState(stagedDirectory, stateDirectory, backupDirectory) {
  if (!statSync(stagedDirectory).isDirectory()) throw new Error('Staged state is not a directory.');
  mkdirSync(dirname(stateDirectory), { recursive: true });
  let backupPath;
  if (existsSync(stateDirectory)) {
    mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    backupPath = join(backupDirectory, `state-${stamp}`);
    renameSync(stateDirectory, backupPath);
  }
  try {
    renameSync(stagedDirectory, stateDirectory);
  } catch (error) {
    if (backupPath) renameSync(backupPath, stateDirectory);
    throw error;
  }
  return backupPath;
}
