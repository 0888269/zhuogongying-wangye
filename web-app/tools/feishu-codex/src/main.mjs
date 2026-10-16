import path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as Lark from '@larksuiteoapi/node-sdk';
import { CodexRpc } from './rpc.mjs';
import { Bridge } from './bridge.mjs';
import { dataDir, readConfig, Store, takeLock } from './storage.mjs';

let rpc, bridge, release, timer, ws;
async function main() {
  const config = readConfig();
  release = takeLock(dataDir);
  const store = new Store(path.join(dataDir, 'state.json'));
  const base = { appId: config.appId, appSecret: config.appSecret,
    domain: config.domain === 'lark' ? Lark.Domain.Lark : Lark.Domain.Feishu,
    loggerLevel: Lark.LoggerLevel.error };
  const client = new Lark.Client(base);
  rpc = new CodexRpc(config.codexPath || 'codex', config.projects[config.defaultProject]);
  rpc.on('offline', () => {
    console.error('Codex went offline. Restarting the bridge is required.');
    shutdown(1);
  });
  await rpc.start();
  const pairingCode = store.data.owner ? null : randomBytes(16).toString('hex');
  bridge = new Bridge({ rpc, store, config, pairingCode, send: async ({ chatId, text, uuid }) => {
    const result = await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }), uuid },
    });
    if (result.code !== 0) throw new Error('Feishu rejected a message.');
  } });
  bridge.recover();
  timer = setInterval(() => void bridge.flush(), 10_000);
  if (pairingCode) console.log(`In a private Feishu chat with your bot, send:\n/pair ${pairingCode}\nThis code expires in 15 minutes. Restart to generate a new code.`);
  ws = new Lark.WSClient({ ...base, handshakeTimeoutMs: 20_000, wsConfig: { pingTimeout: 30 },
    onReady: () => console.log('Feishu connected. Send /help in the paired private bot chat.'),
    onReconnecting: () => console.log('Feishu disconnected; reconnecting.'),
    onReconnected: () => { console.log('Feishu reconnected.'); void bridge.flush(); },
    onError: () => { console.error('Feishu connection failed. Check app credentials and long connection settings.'); shutdown(1); },
  });
  await ws.start({ eventDispatcher: new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': event => { void bridge.enqueue(event); },
  }) });
}
let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  ws?.close();
  bridge?.close();
  rpc?.close();
  release?.();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
main().catch(() => {
  console.error('Bridge startup failed. Run npm run doctor and check the local configuration.');
  shutdown(1);
});
