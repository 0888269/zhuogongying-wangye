# Feishu ↔ Codex

A personal bot for sending Codex tasks from desktop or mobile Feishu. Runs on Windows or a Linux server. Uses Feishu's official SDK long connection and Codex App Server over local stdio. No public web server, inbound port, or GPU is needed for the bridge.

## What works

- Start and continue text tasks in a private bot chat; further messages steer an active task.
- Receive Codex responses and completed/interrupted/failed turn notifications.
- `/status`, `/stop`, `/new`, `/last`, `/projects`, `/project NAME`.
- Answer command/file/permission approvals and clarification questions in Feishu.
- Retain conversation IDs and retry undelivered replies across bridge restarts.
- Pair one Feishu user with a locally displayed, 15-minute one-time code. Other users and group messages are ignored.

The bot manages its own conversations; it does not take over an already-running desktop chat or forward every desktop task's notifications. Text only: attachments and voice messages are not implemented. A completed turn means Codex stopped responding; read its result to know whether the task itself succeeded. A task interrupted by a bridge crash is reported on restart and is never blindly replayed.

## 1. Create your Feishu application

1. Open <https://open.feishu.cn/app>, sign in, and create an enterprise self-built app (企业自建应用), for example **My Codex**. Your organization may require an administrator to approve creating/publishing an app.
2. Under application capabilities, add **Bot / 机器人**.
3. In permissions, enable **Receive private messages sent to the bot** (`im:message.p2p_msg:readonly`) and **Send messages as the bot** (`im:message:send_as_bot`). Use the receive-message event's required permission list if the console asks for additional scopes. Group-message access is unnecessary.
4. Under **Events & callbacks / 事件与回调**, select **Use long connection to receive events / 使用长连接接收事件**. Subscribe to **Receive message / 接收消息** (`im.message.receive_v1`). If saving requires an active connection, run step 2 below while configuring this page.
5. Create and publish an app version. Set its availability to include your own Feishu account and obtain any required admin approval.
6. Copy the **App ID** and **App Secret** from Credentials & Basic Info. Enter the secret only into the local wizard, not this chat or source control.
7. Find the published bot in Feishu and open its private chat. The same bot chat is available in mobile Feishu when signed into the same account and organization.

Official references: [bot setup](https://open.feishu.cn/document/client-docs/bot-v3/bot-overview), [receive message event](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive), [official SDK long connection](https://github.com/larksuite/node-sdk#long-connection).

## 2. Start on this Windows PC

From PowerShell:

```powershell
Set-Location 'D:\noct_\Documents\NFCWeb\szumiee.tech\tools\feishu-codex'
npm.cmd ci
npm.cmd run doctor
.\setup.ps1
```

The wizard prompts for App ID and a hidden App Secret, then starts the bridge. It saves configuration under `%LOCALAPPDATA%\FeishuCodexBridge`, with directory access restricted to your Windows account and SYSTEM. The secret is stored as plaintext inside that restricted directory, not in the website. Existing configuration is not overwritten. The wizard defaults to this website as the project.

Copy the printed `/pair ...` line into the bot's private chat from **mobile or desktop Feishu**. Restart the foreground bridge if the pairing code expires. Once paired, stop it with Ctrl+C and optionally run:

```powershell
.\start-background.ps1
```

This starts a hidden supervisor and restarts the bridge after failures. It does not install a login task or change your power settings. For automatic startup, create a Windows Task Scheduler task under your own signed-in Windows account, triggered **At log on**, to run PowerShell with `-NoProfile -WindowStyle Hidden -File "D:\noct_\Documents\NFCWeb\szumiee.tech\tools\feishu-codex\run.ps1"`. Do not run it as SYSTEM, which has a different Codex login. Only one bridge instance may run at a time.

Keep the PC awake and online. A sleeping or powered-off PC cannot receive or execute work. Enable Feishu mobile OS notifications and leave the bot chat unmuted to receive completion alerts.

## 3. Using the phone

```text
/help
Inspect the website and explain why the mobile menu is broken.
Fix it and run the relevant checks.
/status
/stop
/new
```

If Codex needs permission, the bot shows the command/reason and a request code. Reply `/approve CODE` or `/deny CODE`. Approvals are scoped to that request; permission grants last only the current turn. Nothing automatically selects approval. Requests expire after 15 minutes. For questions, use `/answer CODE your answer`; multiple answers are separated by `|`.

Local Codex permissions and organization restrictions still apply. Unsupported protocol interactions return an error rather than silently granting permission. You can add project aliases to the private `config.json` and restart; `/project alias` only selects those configured paths. `codexPath` must name a directly executable Codex binary, not a Windows `.cmd` shim. After a desktop Codex update moves its binary, update that path or install a stable CLI executable.

## 4. Moving to an always-on server

No equipment purchase is required if you rent a VM. A practical **starting estimate** for this small Node website is **2 vCPUs, 4 GB RAM, and 30–40 GB SSD** on a maintained Linux distribution. Increase RAM/CPU for larger builds, browser tests, containers or databases. These are workload estimates, not official Codex minimums. No GPU is required unless your project itself needs one.

You need:

- An always-on VM or spare computer with outbound access to Feishu and OpenAI, in a region/account configuration supported by both services.
- Node.js 22 or later and the Codex CLI, signed in on the server. Your PC's login is not automatically present there.
- A project checkout, dependencies, and any environment variables or database access required to run/test it. Those do not migrate automatically.
- SSH access for administration. The bridge uses outbound connections; do not expose Codex App Server to the internet.

Copy this bridge folder (excluding `node_modules` and `.protocol`) to the server and run `npm ci`. Copy your project separately or clone its repository. Sign in with `codex login` (use `codex login --device-auth` if supported/needed for a headless machine).

Create `~/.local/share/FeishuCodexBridge` with mode `700`. Copy `config.example.json` to `config.json` there and set mode `600`. Edit App ID, Secret, project paths, and an absolute `codexPath`. Start with `npm start` and pair it interactively.

Stop the Windows bridge before starting the server bot: Feishu long connections for the same application distribute events between clients, so running both is not a failover strategy. Start a new server conversation: thread IDs/history on your PC do not automatically exist on the server.

For restart and boot persistence, adapt `feishu-codex.service.example`, save it as `~/.config/systemd/user/feishu-codex.service`, and run:

```sh
systemctl --user daemon-reload
systemctl --user enable --now feishu-codex
# Once, with administrator privileges, to run user services without an SSH login:
sudo loginctl enable-linger "$USER"
```

Use your actual absolute Node/Codex paths: systemd does not load interactive shell startup files. Do the first pairing in the foreground before enabling the service so no pairing code needs to be copied from service logs.

## Verification and troubleshooting

- `npm test`: simulated task routing, owner isolation, duplicate events, approvals, cancellation, questions, restart and delivery retry checks.
- `npm run doctor`: local configuration, Codex protocol handshake and authentication check; does not start an inference task or validate Feishu credentials.
- Bot cannot receive messages: check app publication, availability, private-message permission, long connection mode and `im.message.receive_v1` subscription.
- Bot cannot send: check `im:message:send_as_bot`, publication and that the bot is in your private chat.
- No response: confirm the host is awake, the foreground bridge is connected, and the account has paired. A missed task during downtime is not guaranteed to be delivered later; verify acknowledgement before assuming it started.
- Reconnects can redeliver events. Recent message IDs are persisted to suppress duplicate tasks. There is a small crash window after accepting a message but before starting its task; check `/status` if no acknowledgement/result arrives. The bridge deliberately avoids automatically replaying uncertain tasks.
- Outgoing messages are persisted and retried, using the same Feishu UUID. A very long outage can exceed Feishu's deduplication window and cause a repeated notification.
- To change the paired owner, stop the bridge, back up and remove its private `state.json`, then restart and pair locally. This resets bridge conversation mappings and pending replies, not Codex's own history.

Protocol reference: <https://learn.chatgpt.com/docs/app-server>.
