import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const dataDir = process.env.FEISHU_CODEX_HOME || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'FeishuCodexBridge',
);
export function readConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!config.appId || !config.appSecret || !config.projects?.[config.defaultProject]) {
    throw new Error('Incomplete configuration. Run setup.ps1 first.');
  }
  for (const directory of Object.values(config.projects)) {
    if (!path.isAbsolute(directory) || !fs.statSync(directory).isDirectory()) {
      throw new Error('Every project must be an existing absolute directory.');
    }
  }
  return config;
}
export class Store {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : { owner: null, chats: {}, seen: [], outbox: [] };
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
}
export function takeLock(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'bridge.lock');
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, 'utf8'));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (error) {
      if (error.code !== 'ESRCH') throw new Error('Cannot verify the existing bridge lock.');
    }
    if (alive) throw new Error('The bridge is already running.');
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 });
  return () => { try { fs.unlinkSync(file); } catch {} };
}
