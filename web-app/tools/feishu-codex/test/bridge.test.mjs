import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Bridge, chunks } from '../src/bridge.mjs';

class Rpc extends EventEmitter {
  calls = []; responses = [];
  async call(method, params) {
    this.calls.push({ method, params });
    if (method.startsWith('thread/')) return { thread: { id: 'thread-1' } };
    return { turn: { id: 'turn-1' } };
  }
  respond(id, result) { this.responses.push({ id, result }); }
  rejectRequest(id, error) { this.responses.push({ id, error }); }
}
function fixture(owner = 'owner') {
  const rpc = new Rpc();
  const store = { data: { owner, chats: {}, seen: [], outbox: [] }, save() {} };
  const sent = [];
  const bridge = new Bridge({ rpc, store, config: { defaultProject: 'website', projects: { website: '/project' } },
    send: async message => { sent.push(message); }, pairingCode: 'secret-pairing-code' });
  return { bridge, rpc, store, sent };
}
let messageSequence = 0;
function message(text, { user = 'owner', chat = 'chat', type = 'p2p', id = `m-${++messageSequence}` } = {}) {
  return { sender: { sender_type: 'user', sender_id: { open_id: user } },
    message: { chat_type: type, chat_id: chat, message_id: id, message_type: 'text', content: JSON.stringify({ text }) } };
}
test('ignores unpaired, foreign and group messages without invoking Codex', async () => {
  const { bridge, rpc, store } = fixture(null);
  await bridge.receive(message('do work'));
  await bridge.receive(message('/pair wrong'));
  await bridge.receive(message('/pair secret-pairing-code', { type: 'group' }));
  assert.equal(store.data.owner, null);
  await bridge.receive(message('/pair secret-pairing-code'));
  assert.equal(store.data.owner, 'owner');
  await bridge.receive(message('do work', { user: 'stranger' }));
  assert.equal(rpc.calls.length, 0);
});
test('expired pairing codes cannot claim the bridge', async () => {
  const { bridge, store } = fixture(null);
  bridge.pairingExpires = 0;
  await bridge.receive(message('/pair secret-pairing-code'));
  assert.equal(store.data.owner, null);
});
test('deduplicates a task and steers the next message into the same turn', async () => {
  const { bridge, rpc } = fixture();
  const event = message('fix navigation');
  await bridge.receive(event);
  await bridge.receive(event);
  await bridge.receive(message('also fix spacing'));
  assert.deepEqual(rpc.calls.map(c => c.method), ['thread/start', 'turn/start', 'turn/steer']);
  assert.equal(rpc.calls[0].params.sandbox, 'workspace-write');
  assert.equal(rpc.calls[0].params.approvalsReviewer, 'user');
  assert.equal(rpc.calls[2].params.expectedTurnId, 'turn-1');
});
test('completion before turn/start response does not leave a phantom active turn', async () => {
  const { bridge, rpc, store } = fixture();
  const original = rpc.call.bind(rpc);
  rpc.call = async (method, params) => {
    const result = await original(method, params);
    if (method === 'turn/start') rpc.emit('notification', { method: 'turn/completed', params: { threadId: 'thread-1', turn: { status: 'completed' } } });
    return result;
  };
  await bridge.receive(message('hello'));
  assert.equal(store.data.chats.chat.active, null);
});
test('stop sends interruption and completion clears state', async () => {
  const { bridge, rpc, store } = fixture();
  await bridge.receive(message('work'));
  await bridge.receive(message('/stop'));
  assert.equal(rpc.calls.at(-1).method, 'turn/interrupt');
  rpc.emit('notification', { method: 'turn/completed', params: { threadId: 'thread-1', turn: { status: 'interrupted' } } });
  assert.equal(store.data.chats.chat.active, null);
});
test('approval is bound to owner/chat and single use, never automatic', async () => {
  const { bridge, rpc } = fixture();
  await bridge.receive(message('work'));
  rpc.emit('request', { id: 91, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', command: 'git status' } });
  const code = [...bridge.pending.keys()][0];
  assert.equal(rpc.responses.length, 0);
  await bridge.receive(message(`/approve ${code}`, { user: 'stranger' }));
  await bridge.receive(message(`/approve ${code}`, { chat: 'different' }));
  assert.equal(rpc.responses.length, 0);
  await bridge.receive(message(`/approve ${code}`));
  await bridge.receive(message(`/approve ${code}`));
  assert.deepEqual(rpc.responses, [{ id: 91, result: { decision: 'accept' } }]);
  bridge.close();
});
test('user questions require actual answers, not generic approval', async () => {
  const { bridge, rpc } = fixture();
  await bridge.receive(message('work'));
  rpc.emit('request', { id: 92, method: 'item/tool/requestUserInput', params: { threadId: 'thread-1', questions: [{ id: 'style', question: 'Style?' }, { id: 'color', question: 'Color?' }] } });
  const code = [...bridge.pending.keys()][0];
  await bridge.receive(message(`/approve ${code}`));
  assert.equal(rpc.responses.length, 0);
  await bridge.receive(message(`/answer ${code} Simple | Blue`));
  assert.deepEqual(rpc.responses[0].result.answers, { style: { answers: ['Simple'] }, color: { answers: ['Blue'] } });
  bridge.close();
});
test('resolved requests cannot be approved later', async () => {
  const { bridge, rpc } = fixture();
  await bridge.receive(message('work'));
  rpc.emit('request', { id: 93, method: 'item/fileChange/requestApproval', params: { threadId: 'thread-1' } });
  const code = [...bridge.pending.keys()][0];
  rpc.emit('notification', { method: 'serverRequest/resolved', params: { threadId: 'thread-1', requestId: 93 } });
  await bridge.receive(message(`/approve ${code}`));
  assert.equal(rpc.responses.length, 0);
});
test('failed delivery remains queued and keeps its id for retry', async () => {
  const { bridge, store } = fixture();
  bridge.send = async () => { throw Error('offline'); };
  bridge.reply('chat', 'finished');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.data.outbox.length, 1);
  const uuid = store.data.outbox[0].uuid;
  let delivered;
  bridge.send = async message => { delivered = message; };
  await bridge.flush();
  assert.equal(delivered.uuid, uuid);
  assert.equal(store.data.outbox.length, 0);
});
test('restart reports uncertain work without replaying commands', () => {
  const { bridge, rpc, store } = fixture();
  store.data.chats.chat = { active: 'old-turn', threadId: 'thread-1' };
  bridge.recover();
  assert.equal(store.data.chats.chat.active, null);
  assert.equal(rpc.calls.length, 0);
});
test('messages are split without breaking Unicode characters', () => {
  const text = '你好😀'.repeat(3000);
  const parts = chunks(text);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(part => Array.from(part).length <= 2500));
});
test('file approval includes the proposed diff in the phone message', async () => {
  const { bridge, rpc, sent } = fixture();
  await bridge.receive(message('work'));
  rpc.emit('notification', { method: 'item/started', params: { threadId: 'thread-1', item: { id: 'file-1', type: 'fileChange', changes: [{ path: '/project/index.html', diff: '+new navigation' }] } } });
  rpc.emit('request', { id: 94, method: 'item/fileChange/requestApproval', params: { threadId: 'thread-1', itemId: 'file-1' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(sent.some(item => item.text.includes('+new navigation')));
  bridge.close();
});
test('permission approval grants only requested permissions for the turn', async () => {
  const { bridge, rpc } = fixture();
  await bridge.receive(message('work'));
  rpc.emit('request', { id: 95, method: 'item/permissions/requestApproval', params: { threadId: 'thread-1', permissions: { network: { enabled: true }, fileSystem: null } } });
  const code = [...bridge.pending.keys()][0];
  await bridge.receive(message(`/approve ${code}`));
  assert.deepEqual(rpc.responses[0].result, { permissions: { network: { enabled: true } }, scope: 'turn' });
});
test('Codex retries notify the phone once without leaking raw error details', async () => {
  const { bridge, rpc, sent } = fixture();
  await bridge.receive(message('work'));
  const event = { method: 'error', params: { threadId: 'thread-1', willRetry: true, error: { message: 'private upstream details' } } };
  rpc.emit('notification', event);
  rpc.emit('notification', event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.filter(item => item.text.includes('is retrying')).length, 1);
  assert.ok(sent.every(item => !item.text.includes('private upstream details')));
});
