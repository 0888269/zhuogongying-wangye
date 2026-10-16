// Optional live check: uses one small inference turn; does not connect to Feishu.
import { CodexRpc } from './rpc.mjs';
const rpc = new CodexRpc(process.env.CODEX_PATH || 'codex', process.cwd());
let timeout;
try {
  await rpc.start();
  rpc.on('request', message => {
    console.log(`Unexpected server request during smoke check: ${message.method}`);
    rpc.rejectRequest(message.id, 'No interactive actions allowed during the smoke check.');
  });
  rpc.on('notification', ({ method, params }) => {
    if (method === 'turn/started' || method === 'error' || method === 'item/started') {
      console.log(`Event: ${method}${params?.item?.type ? ` (${params.item.type})` : ''}`);
      if (method === 'error') console.log(`Error: ${params?.error?.message || 'unspecified'} (retrying: ${params?.willRetry ?? 'unknown'})`);
    }
  });
  const { thread } = await rpc.call('thread/start', {
    cwd: process.cwd(), ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never',
  });
  const completed = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Live turn timed out.')), 180_000);
    rpc.on('notification', ({ method, params }) => {
      if (method === 'turn/completed' && params.threadId === thread.id) resolve(params.turn.status);
    });
    rpc.on('offline', reject);
  });
  completed.catch(() => {});
  await rpc.call('turn/start', { threadId: thread.id,
    input: [{ type: 'text', text: 'Reply with exactly BRIDGE_READY. Do not use any tools, read files, or change anything.', text_elements: [] }],
  });
  console.log('Codex accepted the test turn. Waiting for completion.');
  const status = await completed;
  console.log(`Live Codex turn: ${status}`);
  if (status !== 'completed') process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { clearTimeout(timeout); rpc.close(); }
