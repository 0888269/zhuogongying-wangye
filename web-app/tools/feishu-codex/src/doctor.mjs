import fs from 'node:fs';
import path from 'node:path';
import { CodexRpc } from './rpc.mjs';
import { dataDir, readConfig } from './storage.mjs';

console.log(`Node ${process.version}`);
console.log(`Configuration directory: ${dataDir}`);
let config;
if (fs.existsSync(path.join(dataDir, 'config.json'))) {
  config = readConfig();
  console.log('Configuration and project directories: OK (secrets hidden)');
} else console.log('Feishu configuration: not configured. Run setup.ps1 or follow README.md.');
const rpc = new CodexRpc(config?.codexPath || process.env.CODEX_PATH || 'codex', config?.projects[config.defaultProject] || process.cwd());
try {
  await rpc.start();
  console.log('Codex app-server handshake: OK');
  const { account } = await rpc.call('account/read', { refreshToken: false });
  console.log(`Codex authentication: ${account ? 'signed in' : 'not signed in; run codex login'}`);
  if (!account) process.exitCode = 1;
} catch (error) {
  console.error(`Codex check failed: ${error.message}`);
  process.exitCode = 1;
} finally { rpc.close(); }
