import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const HELP = `Send a plain text task to start or continue Codex.
/status — current task and pending questions
/stop — interrupt the current task
/new — start a fresh conversation
/projects — list configured projects
/project NAME — switch project (while idle)
/last — repeat the latest result
/approve CODE or /deny CODE — answer an approval
/answer CODE your answer — answer a question (separate multiple answers with |)
/help — show this help
While Codex is busy, a plain text message steers the active task.
Text messages only. This bot manages its own Codex conversations.`;

export function chunks(text, size = 2500) {
  const chars = Array.from(text);
  const result = [];
  for (let index = 0; index < chars.length; index += size) result.push(chars.slice(index, index + size).join(''));
  return result;
}
export class Bridge {
  constructor({ rpc, store, config, send, pairingCode, now = Date.now }) {
    Object.assign(this, { rpc, store, config, send, pairingCode, now });
    this.pending = new Map();
    this.items = new Map();
    this.loaded = new Set();
    this.inbound = Promise.resolve();
    this.outgoing = false;
    this.pairingExpires = now() + 15 * 60_000;
    rpc.on('notification', message => {
      try { this.notification(message); } catch { console.error('Could not handle a Codex event.'); }
    });
    rpc.on('request', message => {
      try { this.request(message); } catch { rpc.rejectRequest(message.id, 'Bridge request handling failed.'); }
    });
  }
  recover() {
    for (const [chatId, chat] of Object.entries(this.store.data.chats)) {
      if (chat.active) {
        chat.active = null;
        this.reply(chatId, 'The bridge restarted while work was active. Check /last and the project before asking to continue; the last task was not automatically retried.');
      }
    }
    this.store.save();
  }
  reply(chatId, text) {
    for (const part of chunks(text || '(No text result)')) {
      this.store.data.outbox.push({ chatId, text: part, uuid: randomUUID() });
    }
    this.store.save();
    void this.flush();
  }
  async flush() {
    if (this.outgoing) return;
    this.outgoing = true;
    try {
      while (this.store.data.outbox.length) {
        const message = this.store.data.outbox[0];
        try { await this.send(message); } catch {
          console.error('Feishu delivery failed; the message is saved for retry.');
          break;
        }
        this.store.data.outbox.shift();
        this.store.save();
      }
    } finally { this.outgoing = false; }
  }
  enqueue(event) {
    // Return to Feishu immediately; its event acknowledgement deadline is 3 s.
    this.inbound = this.inbound.then(() => this.receive(event)).catch(() => {
      console.error('Incoming message processing failed.');
    });
    return this.inbound;
  }
  async receive(event) {
    const { sender, message } = event || {};
    if (sender?.sender_type !== 'user' || message?.chat_type !== 'p2p') return;
    const userId = sender.sender_id?.open_id;
    const chatId = message.chat_id;
    if (!userId || !chatId || !message.message_id) return;
    let text = '';
    if (message.message_type === 'text') {
      try { text = JSON.parse(message.content).text?.trim() || ''; } catch { return; }
    }
    const state = this.store.data;
    if (!state.owner) {
      const supplied = text.startsWith('/pair ') ? text.slice(6).trim() : '';
      const expected = this.pairingCode || '';
      if (!supplied || !expected || this.now() > this.pairingExpires ||
          Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return;
      state.owner = userId;
      this.pairingCode = null;
      this.store.save();
      this.reply(chatId, 'Paired. Only your Feishu account can control this bridge.\n' + HELP);
      return;
    }
    if (state.owner !== userId) return;
    if (state.seen.includes(message.message_id)) return;
    state.seen.push(message.message_id);
    state.seen = state.seen.slice(-5000);
    this.store.save();
    if (message.message_type !== 'text') {
      this.reply(chatId, 'Please send a text message. Images, files and voice messages are not supported yet.');
      return;
    }
    if (!text) return;
    const chat = state.chats[chatId] ||= { project: this.config.defaultProject, threadId: null, active: null, last: '' };
    try { await this.command(chatId, chat, text); }
    catch (error) {
      // Avoid forwarding arbitrary upstream errors, which may contain secrets.
      console.error('Task/control request failed:', error.name);
      this.reply(chatId, 'The request failed. Use /status to check the task. If needed, inspect Codex locally or restart the bridge; the request was not automatically retried.');
    }
  }
  async command(chatId, chat, text) {
    const [command, ...args] = text.split(/\s+/);
    if (command === '/help') return this.reply(chatId, HELP);
    if (command === '/status') {
      const requests = [...this.pending.entries()].filter(([, item]) => item.chatId === chatId)
        .map(([code, item]) => `${code}: ${item.message.method}`);
      return this.reply(chatId, `Project: ${chat.project}\nTask: ${chat.active ? 'working' : 'idle'}\nThread: ${chat.threadId || '(new)'}\nPending: ${requests.join(', ') || 'none'}`);
    }
    if (command === '/last') return this.reply(chatId, chat.last || 'No result yet.');
    if (command === '/projects') return this.reply(chatId, Object.keys(this.config.projects).join('\n'));
    if (command === '/stop') {
      if (!chat.active) return this.reply(chatId, 'No active task.');
      await this.rpc.call('turn/interrupt', { threadId: chat.threadId, turnId: chat.active });
      return this.reply(chatId, 'Stop requested. Waiting for Codex to confirm interruption.');
    }
    if (command === '/new' || command === '/project') {
      if (chat.active) return this.reply(chatId, 'Use /stop and wait for the task to stop first.');
      if (command === '/project') {
        if (!Object.hasOwn(this.config.projects, args[0])) return this.reply(chatId, 'Unknown project. Use /projects.');
        chat.project = args[0];
      }
      chat.threadId = null;
      chat.last = '';
      this.store.save();
      return this.reply(chatId, `Ready for a new task in ${chat.project}.`);
    }
    if (['/approve', '/deny', '/answer'].includes(command)) return this.answer(chatId, command, args);
    if (command.startsWith('/')) return this.reply(chatId, 'Unknown command. Use /help.');
    if (text.length > 30000) return this.reply(chatId, 'Please split this task into messages under 30,000 characters.');
    const input = [{ type: 'text', text, text_elements: [] }];
    if (chat.active) {
      await this.rpc.call('turn/steer', { threadId: chat.threadId, expectedTurnId: chat.active, input });
      return this.reply(chatId, 'Your instruction was added to the active task.');
    }
    // One local task at a time prevents conflicting edits across phone chats.
    if (Object.values(this.store.data.chats).some(value => value.active)) {
      return this.reply(chatId, 'Another chat has an active task. Wait for it to finish first.');
    }
    const options = {
      cwd: this.config.projects[chat.project], sandbox: 'workspace-write',
      approvalPolicy: 'on-request', approvalsReviewer: 'user',
      ...(this.config.model ? { model: this.config.model } : {}),
    };
    if (!chat.threadId || !this.loaded.has(chat.threadId)) {
      const result = await this.rpc.call(chat.threadId ? 'thread/resume' : 'thread/start', {
        ...options, ...(chat.threadId ? { threadId: chat.threadId } : {}),
      });
      chat.threadId = result.thread.id;
      this.loaded.add(chat.threadId);
      this.store.save();
    }
    chat.active = 'starting';
    this.store.save();
    this.reply(chatId, `Working in ${chat.project}. You can send more instructions, /status or /stop.`);
    try {
      const result = await this.rpc.call('turn/start', { threadId: chat.threadId, input });
      // Completion can arrive before the RPC response.
      if (chat.active === 'starting') chat.active = result.turn.id;
      this.store.save();
    } catch (error) {
      chat.active = null;
      this.store.save();
      throw error;
    }
  }
  findChat(threadId) {
    return Object.entries(this.store.data.chats).find(([, chat]) => chat.threadId === threadId);
  }
  notification({ method, params: p }) {
    if (method === 'serverRequest/resolved') {
      for (const [code, request] of this.pending) {
        if (request.message.id === p.requestId) this.clearRequest(code);
      }
      return;
    }
    const found = this.findChat(p?.threadId);
    if (!found) return;
    const [chatId, chat] = found;
    if (method === 'item/started' && ['fileChange', 'commandExecution'].includes(p.item?.type)) {
      this.items.set(p.item.id, p.item);
    }
    if (method === 'turn/started') { chat.active = p.turn.id; chat.errorNotified = false; this.store.save(); }
    if (method === 'error' && !chat.errorNotified) {
      chat.errorNotified = true;
      this.reply(chatId, p.willRetry ? 'Codex reported an error and is retrying. You can use /stop if you do not want to wait.' : 'Codex reported an error. Check its local connection and account if this task does not finish.');
    }
    if (method === 'item/completed' && p.item?.type === 'agentMessage') {
      chat.last = p.item.text;
      this.reply(chatId, p.item.text);
    }
    if (method === 'turn/completed') {
      chat.active = null;
      this.items.clear();
      for (const [code, request] of this.pending) {
        if (request.chatId === chatId) this.clearRequest(code);
      }
      this.store.save();
      const status = p.turn.status;
      this.reply(chatId, status === 'completed' ? 'Codex finished this turn. See its result above.' :
        status === 'interrupted' ? 'Task stopped.' : 'Task failed. Check Codex locally for details.');
    }
  }
  request(message) {
    const found = this.findChat(message.params?.threadId);
    if (!found) return this.rpc.rejectRequest(message.id, 'No authorized Feishu conversation for this thread.');
    const [chatId] = found;
    const supported = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval',
      'item/permissions/requestApproval', 'item/tool/requestUserInput', 'tool/requestUserInput',
      'mcpServer/elicitation/request'];
    if (!supported.includes(message.method)) {
      this.rpc.rejectRequest(message.id, 'Unsupported bridge request.');
      return this.reply(chatId, `Codex requested an unsupported interaction: ${message.method}. Handle this task locally.`);
    }
    const code = randomBytes(5).toString('hex');
    const timer = setTimeout(() => {
      const request = this.pending.get(code);
      if (!request) return;
      this.respond(request, false);
      this.clearRequest(code);
      this.reply(chatId, `Request ${code} expired without approval.`);
    }, 15 * 60_000);
    timer.unref?.();
    this.pending.set(code, { message, chatId, timer });
    const p = message.params;
    if (message.method.endsWith('requestUserInput')) {
      const questions = (p.questions || []).map((q, index) => `${index + 1}. ${q.question}\n${(q.options || []).map(o => `${o.label}: ${o.description || ''}`).join('\n')}`);
      this.reply(chatId, `Codex needs your input (${code}):\n${questions.join('\n\n')}\nReply: /answer ${code} answer${questions.length > 1 ? ' | next answer' : ''}`);
    } else if (message.method === 'mcpServer/elicitation/request') {
      this.reply(chatId, `Codex asks (${code}): ${p.message}\n${p.url || JSON.stringify(p.requestedSchema || {})}\n${p.url ? `/approve ${code} after completing the URL flow` : `/answer ${code} {"field":"value"} (JSON matching the schema)`}\nOr /deny ${code}`);
    } else {
      const item = this.items.get(p.itemId);
      const details = JSON.stringify({ command: p.command || item?.command, cwd: p.cwd || item?.cwd, reason: p.reason,
        grantRoot: p.grantRoot, permissions: p.permissions, additionalPermissions: p.additionalPermissions,
        network: p.networkApprovalContext, changes: item?.changes }, null, 2);
      this.reply(chatId, `Codex requests approval (${code}):\n${message.method}\n${details}\n/approve ${code} — allow once\n/deny ${code} — decline\nExpires in 15 minutes.`);
    }
  }
  clearRequest(code) {
    clearTimeout(this.pending.get(code)?.timer);
    this.pending.delete(code);
  }
  respond(request, accepted, answers) {
    const { id, method, params } = request.message;
    let result;
    if (method.endsWith('requestUserInput')) {
      result = { answers: Object.fromEntries((params.questions || []).map((q, index) => [q.id, { answers: accepted ? [answers[index]] : [] }])) };
    } else if (method === 'item/permissions/requestApproval') {
      result = { permissions: accepted ? Object.fromEntries(Object.entries(params.permissions || {}).filter(([, v]) => v != null)) : {}, scope: 'turn' };
    } else if (method === 'mcpServer/elicitation/request') {
      result = { action: accepted ? 'accept' : 'decline', content: accepted && answers ? answers : null };
    } else result = { decision: accepted ? 'accept' : 'decline' };
    this.rpc.respond(id, result);
  }
  answer(chatId, command, args) {
    const code = args[0];
    const request = this.pending.get(code);
    if (!request || request.chatId !== chatId) return this.reply(chatId, 'That request does not exist or has expired.');
    const { method, params } = request.message;
    let answers;
    if (command !== '/deny' && method.endsWith('requestUserInput')) {
      answers = args.slice(1).join(' ').split('|').map(s => s.trim());
      if (command !== '/answer' || answers.length !== params.questions.length || answers.some(s => !s)) {
        return this.reply(chatId, `Use /answer ${code} with one answer per question, separated by |.`);
      }
    } else if (command !== '/deny' && method === 'mcpServer/elicitation/request' && !params.url) {
      if (command !== '/answer') return this.reply(chatId, `Use /answer ${code} followed by the requested JSON.`);
      try { answers = JSON.parse(args.slice(1).join(' ')); } catch { return this.reply(chatId, 'Invalid JSON.'); }
    } else if (command === '/answer') return this.reply(chatId, `Use /approve ${code} or /deny ${code}.`);
    this.respond(request, command !== '/deny', answers);
    this.clearRequest(code);
    this.reply(chatId, 'Your response was sent to Codex.');
  }
  close() { for (const code of this.pending.keys()) this.clearRequest(code); }
}
