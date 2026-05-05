# Security

The MVP follows a local-first threat model.

## Defaults

- The local API binds only to `127.0.0.1`.
- Every local API route requires a per-process `x-cubism-local-token` value issued by the Electron main process. Loopback binding is a defense-in-depth boundary, not the only access control.
- `/session` and `/responses` require both local API authentication and a user-supplied OpenAI API key before proxying to OpenAI.
- Model discovery is limited to explicitly configured search roots.
- Character text chat uses Codex App Server ChatGPT authentication instead of embedding an OpenAI API key.
- Direct OpenAI API keys are used only for the local realtime/responses proxy routes and are saved through Electron `safeStorage`. The app rejects API key persistence when encrypted storage is unavailable.
- Renderer `nodeIntegration` is disabled.
- Renderer `contextIsolation` is enabled.
- Renderer sandboxing is enabled.
- IPC is exposed only through `preload/preload.ts`.
- Content Security Policy limits network access to the app origin, `https://api.openai.com`, and the local API port.
- Dynamic `file:` requests are filtered by Electron `webRequest`; only Live2D asset suffixes required by Cubism models are allowed (`.model3.json`, `.moc3`, texture images, motion/expression/physics/pose/display/userdata JSON files).
- Audio data is not persisted by the storage schema.

## Codex App Server

Codex App Server is used for text chat and developer tooling. The desktop app starts `codex app-server --listen stdio://` and communicates over JSON-RPC. It does not read macOS Keychain, Linux Secret Service, Windows Credential Manager, or Codex auth files directly.

Codex sign-in is delegated to the App Server managed browser flow:

1. The app calls `account/login/start` with `{ "type": "chatgpt" }`.
2. Codex App Server returns an `authUrl`.
3. The app opens that URL in the user's browser.
4. Codex App Server completes the local callback and emits `account/login/completed` and `account/updated`.
5. The app calls `account/read` only to display the resulting account status.

Sign-out calls `account/logout`. The app does not store ChatGPT access tokens.

Character chat starts an ephemeral thread with `approvalPolicy: "never"` and an empty Codex environment list, so it does not receive workspace or local environment access for conversational turns. Instructions also prohibit local file, directory, terminal, and workspace inspection. File edits and shell execution for developer tooling must be routed through approval-aware UI before becoming a production feature. The `ApprovalManager` package keeps the approval contract separate from transport parsing.

## Release Checklist

- Confirm Live2D Publication License Agreement requirements for the distribution model.
- Add installer signing and macOS notarization.
- Run API key leak checks against logs and crash reports.
- Add path traversal tests before importing zipped Live2D assets.
- Add IPC fuzz tests for all preload-exposed commands.
