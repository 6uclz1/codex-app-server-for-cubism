# Cubism Character Desktop

Local Electron MVP for a Live2D-oriented desktop character app.

The app uses Codex App Server as the primary ChatGPT bridge for character text conversation:

- Live2D display is represented by a controller contract and renderer stage that treats `.model3.json` as the model entrypoint.
- Text conversation goes through `codex app-server` using the locally authenticated ChatGPT/Codex account. It starts an ephemeral Codex thread and sends user messages with `turn/start`.
- Voice conversation is scaffolded around a token-protected local `/session` broker for Realtime WebRTC SDP exchange.
- Direct OpenAI API-key based endpoints remain in the local server as a lower-level integration scaffold, but they are not the primary chat UI path.
- API keys are never embedded in the app. If direct OpenAI endpoints are enabled later, keys must be user supplied and saved through Electron `safeStorage`; persistence is rejected when encrypted storage is unavailable.

## Commands

```sh
npm install
npm test
npm run typecheck
npm run build
npm start
```

`npm run package:dir` builds an unpacked Electron package directory for local inspection. Signed installers and notarization are intentionally left for release-time configuration.

## Repository Layout

```text
apps/desktop
  electron      Electron main process and security policy
  preload       Isolated IPC allowlist
  renderer      React UI
  server        127.0.0.1 local API
packages
  live2d-core       Live2D controller contract and fallback implementation
  conversation-core Responses prompt and emotion directive logic
  codex-client      stdio JSON-RPC client and approval manager
  shared-types      API and domain contracts
  storage           SQLite migrations and repositories
```
