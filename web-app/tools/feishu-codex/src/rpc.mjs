import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class CodexRpc extends EventEmitter {
  constructor(executable = 'codex', cwd) {
    super();
    this.executable = executable;
    this.cwd = cwd;
    this.pending = new Map();
    this.sequence = 0;
  }
  async start() {
    this.child = spawn(this.executable, ['app-server', '--listen', 'stdio://'], {
      cwd: this.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', code => this.fail(new Error(`Codex exited (${code}).`)));
    this.child.stdin.on('error', error => this.fail(error));
    // Do not print raw stderr: third-party tools can include credentials in errors.
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method) {
        this.emit(message.id === undefined ? 'notification' : 'request', message);
      } else {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      }
    });
    const result = await this.call('initialize', {
      clientInfo: { name: 'feishu_codex_bridge', title: 'Feishu Codex', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized' });
    return result;
  }
  send(message) {
    if (!this.child?.stdin.writable || this.failed) throw new Error('Codex is offline.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A timed-out mutation may still be running. Stop the transport instead
        // of allowing a second turn or silently retrying the mutation.
        this.fail(new Error(`Codex RPC timed out: ${method}`));
        this.child?.kill();
      }, 120_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  respond(id, result) { this.send({ id, result }); }
  rejectRequest(id, message) { this.send({ id, error: { code: -32601, message } }); }
  fail(error) {
    if (this.failed) return;
    this.failed = true;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
    this.emit('offline', error);
  }
  close() { this.child?.kill(); }
}
