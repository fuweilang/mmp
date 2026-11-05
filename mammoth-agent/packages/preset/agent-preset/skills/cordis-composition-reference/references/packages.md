# Loadable Harness plugin packages

This file is GENERATED from workspace manifests (`scripts/gen-plugin-packages.ts`) and verified fresh by `pnpm run verify-plugin-packages` (part of `doc-sync`); do not edit it by hand.

Every package below exports a Cordis plugin that a bundle patch can name in a Loader row. `Config` marks packages whose row accepts a `config` mapping; query `Config.listConfigs` through `cordis_inspect_query` (filter by `name`, then query the `entry` id) for the mounted schema. Packages under `experimental` are pre-stable.

## acp

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-acp` | yes | Automation-only Agent Client Protocol server for driving DeepSeek Harness agents over JSON-RPC stdio |

## api

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-api-account-controller` | no | Expose safe account operations over authenticated Remote |
| `@mammoth-ai/mmp-api-gateway` | yes | Typert Remote Host dispatcher and Client API endpoint |
| `@mammoth-ai/mmp-api-job-controller` | yes | Job Remote observation stream and the reference-counted client job-output service |
| `@mammoth-ai/mmp-api-remote-access` | no | Method-level Remote access control for non-owner Peers and the per-Peer access snapshot |
| `@mammoth-ai/mmp-api-remotes` | no | Remote BFF assembly for application-selected Host capabilities |
| `@mammoth-ai/mmp-api-session-controller` | yes | Session Remote commands, cold reads, and live control transport |
| `@mammoth-ai/mmp-api-settings-controller` | yes | Remote owner for the configuration surfaces over the settings-domain seams |
| `@mammoth-ai/mmp-api-terminal-controller` | yes | Session-owned interactive terminals with shell discovery, screen recovery and typed Remote control |
| `@mammoth-ai/mmp-api-workspace-controller` | yes | Workspace Remote commands and reconnect-safe state transport |
| `@mammoth-ai/mmp-api-workspace-files` | yes | Workspace file service and Client resource provider: bounded reads, directory listing, and live metadata over the workspaceFiles Remote namespace |

## attachment

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-attachment-local` | yes | Private content-addressed MMP_HOME attachment storage |

## boot

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-config-editor` | no | Persist plugin configuration through profile patches and Loader reconciliation |
| `@mammoth-ai/mmp-hmr` | yes | Coordinated module and profile configuration hot reload |
| `@mammoth-ai/mmp-plugin-manager` | yes | Current-profile plugin and bundle management shared by mmp CLI, Web and agent tools |
| `@mammoth-ai/mmp-plugin-market` | yes | Configured plugin market indexes for the Web Discover page and the plugin_market agent tool |

## browser-use

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-browser-use` | no | Exclusive named browser-use provider registration |

## bundle

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-acp-app` | no | The mmp ACP profile bundle: automation-only JSON-RPC stdio and process lifecycle over mmp-base |
| `@mammoth-ai/mmp-headless` | yes | The mmp one-shot bundle: a direct core Agent/Session runner over mmp-base with no Host, HTTP, or browser layer |
| `@mammoth-ai/mmp-sdk-app` | yes | The mmp SDK profile bundle: stdio JSON-RPC serving and process lifecycle over mmp-base |
| `@mammoth-ai/mmp-web-app` | yes | The mmp browser-surface bundle: the web patch layer over mmp-base plus the runtime glue plugin (frontend dist serving, bash runtime variables, URL line) |

## client

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-client-connection` | yes | Authenticated RPC transport and generation lifecycle |
| `@mammoth-ai/mmp-client-file-upload` | no | Agent-scoped browser file upload, streaming intake, and staged receipt service |
| `@mammoth-ai/mmp-client-hmr` | yes | Web client graph synchronization and rebuilt-bundle reload transport |
| `@mammoth-ai/mmp-client-locale` | no | Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dictionaries |
| `@mammoth-ai/mmp-client-modules` | no | Client module system, dual-face: node half composes the __MMP_BOOT__ entry graph (incremental mmp.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam |
| `@mammoth-ai/mmp-client-product-analytics` | yes | Desktop product event collection and authenticated Host reporting |
| `@mammoth-ai/mmp-client-resources` | no | Unified client resource model: protocol-registered providers turn URL addresses into live values, consumed through the useResource global standard hook |
| `@mammoth-ai/mmp-client-shortcuts` | yes | Application keyboard command registry and physical-key routing |
| `@mammoth-ai/mmp-client-ui-agent-preset` | no | Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor |
| `@mammoth-ai/mmp-client-ui-approval` | no | Approval composer takeover over the scoped Remote Event waterfall |
| `@mammoth-ai/mmp-client-ui-attachment` | no | Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots |
| `@mammoth-ai/mmp-client-ui-brand-official` | no | Official DeepSeek Harness brand occupants for the Web client's sidebar slots |
| `@mammoth-ai/mmp-client-ui-chat` | no | Chat Conversation target, node definitions, renderers, and details surface |
| `@mammoth-ai/mmp-client-ui-commands` | no | Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry |
| `@mammoth-ai/mmp-client-ui-context-menu` | no | Typed, plugin-extensible context menus with captured targets and shared Web presentation |
| `@mammoth-ai/mmp-client-ui-conversation` | no | Target-neutral Conversation assembly, shell, composer, queue, and view navigation |
| `@mammoth-ai/mmp-client-ui-deliverables` | no | Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references for Web |
| `@mammoth-ai/mmp-client-ui-directory-picker-browse` | no | In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives |
| `@mammoth-ai/mmp-client-ui-directory-picker-native` | no | Native directory-picker surface: the renderless workspace directory-flow occupant driving the local Desktop or Host OS chooser |
| `@mammoth-ai/mmp-client-ui-entry-customization` | no | Customize plugin entries in the left sidebar, conversation views, and right sidebar, and quickly create new plugins. |
| `@mammoth-ai/mmp-client-ui-file-actions` | no | Original-file saving and image clipboard actions for Web and Desktop |
| `@mammoth-ai/mmp-client-ui-file-drag` | no | Application-owned file drag transfers and localized failure feedback |
| `@mammoth-ai/mmp-client-ui-goal` | no | Session goal surface: GoalBar docked above the composer, read from the goal session projection |
| `@mammoth-ai/mmp-client-ui-input-trigger` | no | Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources |
| `@mammoth-ai/mmp-client-ui-jobs` | no | Session-header background-job list with on-demand streaming record panels |
| `@mammoth-ai/mmp-client-ui-layout` | no | Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels) |
| `@mammoth-ai/mmp-client-ui-message-feedback` | no | The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dialog behind both ratings and /feedback, backed by the messageFeedback and sessionFeedback Host Remotes |
| `@mammoth-ai/mmp-client-ui-model-selection` | no | Model selection over the shared model catalog, Session projection, and session.selectModel |
| `@mammoth-ai/mmp-client-ui-open-in-app` | no | Web "Open In..." controls: the Session-header split button opening the workspace directory in an installed application, and the document preview's default-application controls for one file |
| `@mammoth-ai/mmp-client-ui-permission-presets` | no | Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection |
| `@mammoth-ai/mmp-client-ui-plan` | no | Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews |
| `@mammoth-ai/mmp-client-ui-plugin-manager` | yes | Plugin management for the mmp web client: the sidebar Plugins panel installs, enables, disables, retries, and composes installed plugin packages |
| `@mammoth-ai/mmp-client-ui-plugin-market` | no | Discover tab of the mmp web Plugins page: browse configured plugin market indexes and install their bundles |
| `@mammoth-ai/mmp-client-ui-reference` | no | Unified Web @file and @session reference source |
| `@mammoth-ai/mmp-client-ui-renderer` | no | Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root |
| `@mammoth-ai/mmp-client-ui-schedule` | no | Host task management page and Session reminder catalog |
| `@mammoth-ai/mmp-client-ui-secret-mask` | no | Web display masking for recognized credentials in sent user text |
| `@mammoth-ai/mmp-client-ui-session` | no | Session Controller adapter for React and session-scoped slots |
| `@mammoth-ai/mmp-client-ui-settings` | no | Settings domain base plugin: shared configuration forms and the canonical settings slot-type contract |
| `@mammoth-ai/mmp-client-ui-settings-account` | yes | Manage DeepSeek login and open Platform billing pages |
| `@mammoth-ai/mmp-client-ui-settings-agent-loop` | no | Settings page of the agent loop on the mmp web client's Plugins page: the parallel tool-call cap of the agent-loop namespace |
| `@mammoth-ai/mmp-client-ui-settings-general` | no | Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome content, settings dictionaries, and the versioned welcome notice |
| `@mammoth-ai/mmp-client-ui-settings-models` | yes | Models settings and shared product-onboarding dialogs over existing settings and credential joins |
| `@mammoth-ai/mmp-client-ui-settings-plugin-inventory` | no | Read-only Cordis Loader inventory tab in Web Plugins settings |
| `@mammoth-ai/mmp-client-ui-settings-plugins` | no | Built-in plugins settings section for the mmp web client: the Settings navigation entry and the tab chrome feature-owned tabs register into |
| `@mammoth-ai/mmp-client-ui-settings-session-log` | no | General settings control for Session-log upload with DeepSeek API requests |
| `@mammoth-ai/mmp-client-ui-settings-shell` | no | Settings page of the shell executor on the mmp web client's Plugins page: the command timeout and the per-stream output cap of the shell namespace |
| `@mammoth-ai/mmp-client-ui-settings-subagent` | no | Settings page of Subagent delegation on the mmp web client's Plugins page: recursion depth, parallel capacity, and the models agents may choose for subagents |
| `@mammoth-ai/mmp-client-ui-settings-web-search` | no | Settings page of the DeepSeek web-search provider on the mmp web client's Plugins page: its API key, endpoint, and per-request search budget |
| `@mammoth-ai/mmp-client-ui-shortcuts` | no | Keyboard shortcut reference, recording, and local preference editing |
| `@mammoth-ai/mmp-client-ui-sidebar` | no | Sidebar plugin: session multi-level tree, search, grouping, state dots |
| `@mammoth-ai/mmp-client-ui-sidebar-browser` | no | Sandboxed Web browser tabs for the right Sidebar |
| `@mammoth-ai/mmp-client-ui-sidebar-documentpreview` | yes | Extensible Sidebar previews for Office documents, spreadsheets, Markdown, code, images, PDF, HTML, and plain text |
| `@mammoth-ai/mmp-client-ui-sidebar-files` | no | The workspace files page and one workspace directory tree per pane beside docked and floating file previews, listed lazily over the workspaceFiles Remote namespace |
| `@mammoth-ai/mmp-client-ui-sidebar-right` | no | Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigation service over it |
| `@mammoth-ai/mmp-client-ui-sidebar-terminal` | no | Interactive shell tabs for the right Sidebar |
| `@mammoth-ai/mmp-client-ui-skill` | no | Web skill references and the dedicated skill tool row |
| `@mammoth-ai/mmp-client-ui-subagent` | no | Subagent conversation catalog, continuation routing UI, and '@' reference source |
| `@mammoth-ai/mmp-client-ui-theme` | yes | Theme plugin: Host bootstrap for the pre-plugin palette; ThemeRuntime for light/dark/system state and icon replacements; --dsw-* token styles and Appearance settings row |
| `@mammoth-ai/mmp-client-ui-tool` | no | Client Tool call-tree renderer and keyed per-tool presentation slot |
| `@mammoth-ai/mmp-client-ui-trajectory` | yes | Trajectory event ledger and timing overview with live tool-result inspection |
| `@mammoth-ai/mmp-client-ui-user-questions` | no | Web ask_user_question composer takeover and plan-review presentation UI |
| `@mammoth-ai/mmp-client-ui-workflow-run` | no | Durable workflow-run Conversation Node and nested member disclosure for mmp web |
| `@mammoth-ai/mmp-client-ui-workspace` | no | Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots |

## compaction

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-command-compact` | no | Human-facing slash command for explicit session compaction |
| `@mammoth-ai/mmp-compaction-basic` | yes | Token-meter-driven compaction policy and LLM summarization backend for the DeepSeek Harness |
| `@mammoth-ai/mmp-compaction-image-offload` | no | Durable image offload for image-capable routes: replace over-budget request images with placeholders and retry |
| `@mammoth-ai/mmp-compaction-tool-result-pruner` | yes | Replay-safe model-free head/middle/tail pruning for tool-result surface nodes |

## computer-use

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-computer-use` | no | Exclusive named computer-use provider registration |

## context

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-agent-instructions` | yes | Workspace context loader for AGENTS.md/CLAUDE.md instruction files |
| `@mammoth-ai/mmp-file-reference-local` | yes | Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes |
| `@mammoth-ai/mmp-harness-dev-context` | no | Model context naming the DeepSeek Harness checkout and Web GUI URL without letting either change the system prompt |
| `@mammoth-ai/mmp-session-reference` | yes | Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver) |
| `@mammoth-ai/mmp-time-context` | yes | Durable per-step context with the current time and elapsed time |
| `@mammoth-ai/mmp-tmux-context` | yes | Opt-in durable per-step context with this agent's tmux pane and window location |

## core

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-agent` | no | Agent interface, registry, initiator scope, and event vocabulary for the DeepSeek Harness |
| `@mammoth-ai/mmp-agent-default-model` | yes | Default model selection shared by Agent entry points |
| `@mammoth-ai/mmp-agent-loop` | yes | The concrete agent loop plugin for the DeepSeek Harness |
| `@mammoth-ai/mmp-agent-tool-presentation` | yes | Deprecated tool presentation selector; use mmp-tool-executor-native or mmp-tool-executor-ptc directly |
| `@mammoth-ai/mmp-session` | no | Event-sourced session store for the DeepSeek Harness |
| `@mammoth-ai/mmp-system-prompt` | yes | System prompt assembly registry for the DeepSeek Harness |
| `@mammoth-ai/mmp-tool-executor-native` | no | Native tool execution plugin |
| `@mammoth-ai/mmp-tool-executor-ptc` | yes | PTC program execution, tool bindings, and generated SDK prompts |
| `@mammoth-ai/mmp-tools` | no | Tool registry and execution pipeline for the DeepSeek Harness |

## credentials

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-authorization` | no | Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human |
| `@mammoth-ai/mmp-credentials-local` | yes | File-backed credentials provider ($MMP_HOME/.env under the live process environment) for the DeepSeek Harness |
| `@mammoth-ai/mmp-deepseek-account-platform` | yes | Authorize DeepSeek accounts through browser PKCE |

## deliverables

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-deliverable-file-references` | no | Shared model guidance for file links and deliverables across DeepSeek Harness hosts |
| `@mammoth-ai/mmp-tool-present` | yes | Explicit workspace file delivery declarations for the DeepSeek Harness |
| `@mammoth-ai/mmp-workspace-changes` | yes | Per-turn workspace file changes recorded from git working-tree snapshots and whole-file captures, with per-file comparisons, for the DeepSeek Harness |

## document

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-office-to-pdf` | yes | Shared Office-to-PDF conversion with bounded queues and caching |

## experimental

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-action-cards` | yes | Optional action cards below answers: one shared proposal tool, card state, user actions and status notices |
| `@mammoth-ai/mmp-client-ui-action-cards` | no | Action cards below completed answers: the shared card frame, kind bodies and the compact tool row |
| `@mammoth-ai/mmp-client-ui-creation-recommendations` | no | Body of the personalized page card: location choice, creation progress, Keep, Undo and Restore |
| `@mammoth-ai/mmp-client-ui-plugin-recommendations` | no | Official plugin card body with catalog text and enabling |
| `@mammoth-ai/mmp-creation-recommendations` | no | Create persistent removable interface plugins from explicit conversation needs |
| `@mammoth-ai/mmp-cua` | no | Shared Computer Use application objects, authorization, and logged tool execution |
| `@mammoth-ai/mmp-experimental-agent-team` | yes | Implicit-root Agent Teams roster, direct peer messaging, and shared task DAG |
| `@mammoth-ai/mmp-experimental-api-speech-to-text` | yes | Authenticated experimental speech transcription for browser clients |
| `@mammoth-ai/mmp-experimental-auto-review` | no | Per-tool LLM authorization review for the DeepSeek Harness Auto permission preset |
| `@mammoth-ai/mmp-experimental-browser-use-chrome-devtools-mcp` | yes | Experimental per-Session Chromium browser tools through chrome-devtools-mcp |
| `@mammoth-ai/mmp-experimental-browser-use-playwright-mcp` | yes | Experimental per-Session Chromium browser tools through @playwright/mcp |
| `@mammoth-ai/mmp-experimental-browser-use-stagehand-native` | yes | Experimental Stagehand browser tools with separately configured native models |
| `@mammoth-ai/mmp-experimental-claude-code-mods` | yes | Experimental bridge: load Claude Code mods (hooks modules) and run their hook chains on DeepSeek Harness extension points |
| `@mammoth-ai/mmp-experimental-client-ui-agent-team` | no | Web Agent Teams roster, task board, and teammate navigation |
| `@mammoth-ai/mmp-experimental-client-ui-claude-code-mods` | no | Web band above the prompt for Claude Code mods: draws each session's mod tree and sends button presses back to the bridge |
| `@mammoth-ai/mmp-experimental-client-ui-cot-translation` | yes | Optional machine translation of expanded reasoning, preserving original Session text |
| `@mammoth-ai/mmp-experimental-client-ui-forge` | yes | Sidebar panel for a Session's change requests, with a worktree option for new Sessions and its Host Remote |
| `@mammoth-ai/mmp-experimental-client-ui-stats` | no | Per-turn and per-step context, timing, cache, and tool-cost table contributed as an experimental conversation View |
| `@mammoth-ai/mmp-experimental-client-ui-voice-input` | no | Record speech and insert editable text into the conversation draft |
| `@mammoth-ai/mmp-experimental-computer-use-cua-driver-mcp` | yes | Experimental computer use through an installed Cua Driver MCP executable |
| `@mammoth-ai/mmp-experimental-computer-use-cua-driver-native` | no | Experimental computer-use provider embedding the Cua Driver native npm SDK |
| `@mammoth-ai/mmp-experimental-cua-macos` | yes | macOS native provider for shared Computer Use application and window objects |
| `@mammoth-ai/mmp-experimental-forge` | yes | Provider-neutral change request registry with shared status polling |
| `@mammoth-ai/mmp-experimental-forge-github` | yes | GitHub provider for the experimental forge registry, read through the GitHub CLI on the host |
| `@mammoth-ai/mmp-experimental-forge-session` | yes | Binds change requests to the Session that created, pushed, or tracked them |
| `@mammoth-ai/mmp-experimental-inspector` | yes | Experimental cross-realm CDP hub for Host debugging and Client Runtime inspection |
| `@mammoth-ai/mmp-experimental-ptc-runtime-python` | yes | CPython subprocess implementation of the DeepSeek Harness PTC execution seam |
| `@mammoth-ai/mmp-experimental-session-inspector` | no | Experimental virtualized Session log and live Chat group/node inspectors |
| `@mammoth-ai/mmp-experimental-speech-to-text` | yes | Experimental speech recognition with independently selectable providers |
| `@mammoth-ai/mmp-experimental-speech-to-text-sensevoice` | yes | Local SenseVoice ONNX transcription with a managed sherpa-onnx process |
| `@mammoth-ai/mmp-experimental-subagent-oar` | yes | Experimental one-shot subagents through OAR runtimes |
| `@mammoth-ai/mmp-experimental-tool-agent-team` | yes | Scoped model-facing Agent Teams tools over ctx.agentTeams |
| `@mammoth-ai/mmp-experimental-tool-subagent-oar` | yes | Delegate standalone tasks to configured external subagent providers |
| `@mammoth-ai/mmp-experimental-tool-worktree` | no | Model tool that creates and enters a new Git worktree |
| `@mammoth-ai/mmp-experimental-translator` | yes | Machine translation with reusable Session results |
| `@mammoth-ai/mmp-experimental-worktree` | yes | Creates a named Git worktree and changes the calling Session working directory |
| `@mammoth-ai/mmp-hooks-claude-code` | yes | Bridge plugin: run a Claude Code hooks.json / settings hook config on the DeepSeek Harness interception seams |
| `@mammoth-ai/mmp-hooks-codex` | yes | Bridge plugin: run a Codex hooks.json hook config on the DeepSeek Harness interception seams |
| `@mammoth-ai/mmp-plugin-recommendations` | no | Official plugin suggestions with explicit user activation and persistent conversation decisions |
| `@mammoth-ai/mmp-session-title-all-prompts-llm` | yes | All-user-messages LLM provider plugin for DeepSeek Harness session titles |
| `@mammoth-ai/mmp-skill-badge` | no | Bundled mmp badge skill provider for DeepSeek Harness |
| `@mammoth-ai/mmp-tool-ralph` | yes | Model-facing fresh-agent Ralph loop over the workflow and subagent seams |
| `@mammoth-ai/mmp-tool-session-query` | yes | Workspace-authorized model-facing session history search, trace, and event read tools |
| `@mammoth-ai/mmp-tool-terminal` | yes | Six model-facing persistent PTY tools with owner isolation and generic background-job integration |
| `@mammoth-ai/mmp-webhook` | no | Fire-and-forget webhook rule runtime that creates Workspace-backed DeepSeek Harness Sessions |
| `@mammoth-ai/mmp-webhook-github` | yes | Signed GitHub HTTP webhook adapter for the DeepSeek Harness webhook runtime |

## extensions

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-client-ui-cordis` | no | Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch |
| `@mammoth-ai/mmp-cordis-client-runner` | no | Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries |
| `@mammoth-ai/mmp-cordis-host-runner` | yes | Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages |
| `@mammoth-ai/mmp-tool-cordis` | no | Read-only runtime API inspection for Harness plugin development |

## feedback

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-command-feedback` | no | Log-only session feedback: the record event, the sessionFeedback Host Remote, and the human-facing slash command |
| `@mammoth-ai/mmp-message-feedback` | yes | Canonical Session-log ratings and notes for finalized assistant messages |

## fs

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-fs-local` | yes | Local-filesystem implementation of the DeepSeek Harness filesystem seam (ctx.fs) |
| `@mammoth-ai/mmp-fs-observation-policy` | no | File-context policy plugin for the DeepSeek Harness — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API) |
| `@mammoth-ai/mmp-fs-sandbox` | yes | Sandbox-enforcing implementation of the DeepSeek Harness filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through |
| `@mammoth-ai/mmp-tool-fs` | yes | Model-facing filesystem tools (read, write, edit) over the DeepSeek Harness filesystem seam (ctx.fs) |
| `@mammoth-ai/mmp-tool-fs-search` | yes | Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep) |
| `@mammoth-ai/mmp-tool-str-replace-editor` | yes | Model-facing view, create, literal replace, and line insert tool over the Harness filesystem service |

## goal

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-command-goal` | no | Human-facing slash command for persisted same-session goals |
| `@mammoth-ai/mmp-goal` | yes | Event-sourced same-session goal state and lifecycle service for the DeepSeek Harness |
| `@mammoth-ai/mmp-goal-round-driver` | no | Race-fenced same-session goal-round driver |
| `@mammoth-ai/mmp-tool-goal` | yes | Model-facing same-session goal tools with execution-time authority checks |

## guard

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-repeat-tool-reminder` | yes | Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls |
| `@mammoth-ai/mmp-tool-call-timeout-policy` | no | Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins |

## host

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-host-directory-picker-auto` | no | Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the DeepSeek Harness web GUI host |
| `@mammoth-ai/mmp-host-directory-picker-browse` | yes | In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem) |
| `@mammoth-ai/mmp-host-directory-picker-native` | no | Native-OS-chooser backend of the directory-picker seam for the DeepSeek Harness web GUI host |
| `@mammoth-ai/mmp-host-frontend-static` | yes | SPA dist server for the Web shell: owns the webserver fallback seat, serving explicit index entries and static assets with traversal rejection and 404 misses |
| `@mammoth-ai/mmp-host-open-in-app` | yes | Host half of open-in-app: resolved application catalog, icons, and the launch endpoint as three webServer routes |
| `@mammoth-ai/mmp-host-plugin-inventory` | no | Read-only Remote projection of current Cordis Loader plugin state |
| `@mammoth-ai/mmp-host-product-telemetry-otel` | yes | Explicit product usage events exported through OpenTelemetry HTTP logs |
| `@mammoth-ai/mmp-host-webserver` | yes | Web route-registration plugin: HTTP and upgrade routes, per-Peer index transform taps, and static dist fallback |

## interaction

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-commands` | no | Plugin-owned human command registry for DeepSeek Harness UIs |
| `@mammoth-ai/mmp-permission-presets` | yes | User-facing permission presets (ctx.permissionPresets) for the DeepSeek Harness: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events |
| `@mammoth-ai/mmp-tool-ask-user` | yes | Model-facing ask_user_question tool over the ctx.userQuestions seam |
| `@mammoth-ai/mmp-user-approval` | yes | User-approval seam (ctx.approval) for the DeepSeek Harness: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default |
| `@mammoth-ai/mmp-user-questions` | no | Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs |

## jobs

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-jobs-local` | yes | Process-local implementation of the DeepSeek Harness background job registry seam |
| `@mammoth-ai/mmp-tool-jobs` | yes | Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry |

## llm

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-deepseek-llm-api-extensions` | no | Additive request-field registry for the official DeepSeek LLM API adapter |
| `@mammoth-ai/mmp-llm` | no | Provider-neutral LLM service interface for the DeepSeek Harness |
| `@mammoth-ai/mmp-llm-deepseek-account` | yes | DeepSeek account provider authentication and discovery |
| `@mammoth-ai/mmp-llm-deepseek-api-key` | yes | DeepSeek api-key provider authentication and discovery |
| `@mammoth-ai/mmp-llm-pi-ai` | yes | pi-ai-backed DeepSeek adapter for the DeepSeek Harness LLM seam (design-verification twin of mmp-llm-deepseek) |
| `@mammoth-ai/mmp-llm-retry` | yes | Provider-routed LLM request retry policy for the DeepSeek Harness |
| `@mammoth-ai/mmp-plugin-package-inventory-deepseek` | yes | Active Loader-backed plugin package inventory for official DeepSeek LLM API requests |
| `@mammoth-ai/mmp-token-meter` | yes | Replay-aware token measurement service (ctx.tokenMeter) for the DeepSeek Harness |

## lsp

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-lsp` | no | Abstract LSP capability seam (ctx.lsp) for the DeepSeek Harness — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy |
| `@mammoth-ai/mmp-lsp-stdio` | yes | Generic stdio language-server provider for the DeepSeek Harness LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace |
| `@mammoth-ai/mmp-tool-lsp` | yes | Model-facing lsp tool over the DeepSeek Harness LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization |

## mcp

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-mcp-client` | yes | MCP client bridge: connects to MCP servers and registers their tools on ctx.tools |
| `@mammoth-ai/mmp-mcp-resources` | no | Scoped MCP resource discovery and reading through shared model tools |

## plan

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-plan-mode` | yes | Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit |

## preset

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-agent-preset` | yes | Declare an Agent capability composition in Cordis YAML |
| `@mammoth-ai/mmp-agent-preset-registry` | yes | Declarative Agent preset registry and profile-backed editing |
| `@mammoth-ai/mmp-persona` | yes | Composition-authored deployment persona section for the DeepSeek Harness |

## ptc-runtime

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-ptc-runtime-node` | yes | Node PTC execution with async function, REPL and VM Script evaluators and optional retained state |

## sandbox

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-sandbox-local` | yes | Local process-sandbox backends for the DeepSeek Harness sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed |
| `@mammoth-ai/mmp-sandbox-policy` | yes | Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family |

## schedule

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-schedule` | yes | Host-wide durable reminders with shared management and delivery to existing or new Sessions |
| `@mammoth-ai/mmp-tool-schedule` | no | Model-facing scheduled task tools (schedule_create, schedule_list, schedule_view, schedule_edit) over the Host ctx.schedule service |

## sdk

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-sdk-jsonrpc-server` | yes | Stdio JSON-RPC server plugin for out-of-process DeepSeek Harness SDK clients |

## session

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-message-quotes` | no | Selected-text quotation and Markdown blockquote presentation |
| `@mammoth-ai/mmp-session-checkpoint-policy` | no | Semantic session durability checkpoints before model requests and tool side effects |
| `@mammoth-ai/mmp-session-log-deepseek` | yes | Incremental lossless session-log request extension for the official DeepSeek LLM API |
| `@mammoth-ai/mmp-session-persistence-jsonl` | yes | JSONL durable session persistence backend for the DeepSeek Harness |
| `@mammoth-ai/mmp-session-projection` | no | Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state |
| `@mammoth-ai/mmp-session-projection-cache` | yes | Persisted projection cache (ctx.sessionProjectionCache): durable per-session checkpoint records on the session_projcache storage domain (per-record layout), throttled write-behind, and the cached listing read |
| `@mammoth-ai/mmp-session-stats` | no | Whole-log conversation counts and wall times projection (sessionStats) for the DeepSeek Harness |
| `@mammoth-ai/mmp-session-telemetry-otel` | yes | Feedback-authorized Session logs over byte-bounded OpenTelemetry HTTP requests |
| `@mammoth-ai/mmp-session-title` | yes | Log-backed session title service and provider registry for the DeepSeek Harness |
| `@mammoth-ai/mmp-session-title-first-prompt-llm` | yes | First-message LLM provider plugin for DeepSeek Harness session titles |
| `@mammoth-ai/mmp-session-turn-outline` | no | Whole-log turn outline projection (turnOutline) for the DeepSeek Harness |
| `@mammoth-ai/mmp-tool-working-directory` | no | Read and change the active Session working directory |
| `@mammoth-ai/mmp-working-directory` | yes | Session working directories with durable changes and model context |

## session-query

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-session-log-export` | yes | Web Session-log ZIP export and Session Markdown copy |
| `@mammoth-ai/mmp-session-query-sqlite` | yes | Concrete ctx.sessionQuery backend with SQLite FTS5 search |

## settings

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-settings` | no | Abstract user-settings seam (ctx.settings) for the DeepSeek Harness |

## shell

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-bash-local` | yes | Local-subprocess implementation of the DeepSeek Harness bash executor seam |
| `@mammoth-ai/mmp-bash-sandbox` | yes | Sandbox-consuming implementation of the DeepSeek Harness bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@mammoth-ai/mmp-pwsh-local` | yes | Local PowerShell implementation of the DeepSeek Harness bash executor seam |
| `@mammoth-ai/mmp-pwsh-sandbox` | yes | Sandbox-consuming implementation of the DeepSeek Harness PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@mammoth-ai/mmp-shell-env` | yes | Tool-independent managed MMP_* shell environment registry |
| `@mammoth-ai/mmp-tool-bash` | yes | Model-facing bash tool with optional generic background-job and sandbox-escalation support |
| `@mammoth-ai/mmp-tool-bash-persistent` | yes | Model-facing owner-scoped persistent Bash tool backed by the Harness PTY service |
| `@mammoth-ai/mmp-tool-pwsh` | yes | Model-facing pwsh tool over the bash executor seam |
| `@mammoth-ai/mmp-tool-pwsh-persistent` | yes | Model-facing owner-scoped persistent PowerShell tool backed by the Harness PTY service |

## skill

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-skill` | yes | Agent skill provider registry for the DeepSeek Harness |
| `@mammoth-ai/mmp-skill-filesystem` | yes | Local filesystem skill provider for the DeepSeek Harness |
| `@mammoth-ai/mmp-skill-office` | yes | Bundled Word, PowerPoint, and Excel workflows and LibreOffice Kit operations |
| `@mammoth-ai/mmp-tool-skill` | yes | Model-facing skill loading tool for the DeepSeek Harness |
| `@mammoth-ai/mmp-tool-workspace-dependencies` | yes | The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload |

## spill

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-spill-local` | yes | Local-filesystem implementation of the DeepSeek Harness spill storage seam (private session-scoped files) |
| `@mammoth-ai/mmp-spill-policy` | yes | Token-budgeted tool-result retention with recoverable text and image paths |

## ssh

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-fs-ssh` | no | Filesystem provider over the shared POSIX SSH helper |
| `@mammoth-ai/mmp-sandbox-ssh` | no | Remote POSIX sandbox argv provider over the shared SSH helper |
| `@mammoth-ai/mmp-ssh` | yes | Shared OpenSSH connection and versioned POSIX remote helper |
| `@mammoth-ai/mmp-subprocess-ssh` | no | Subprocess and terminal provider over the shared POSIX SSH helper |

## storage

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-storage` | no | Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the DeepSeek Harness |
| `@mammoth-ai/mmp-storage-domain` | yes | Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the DeepSeek Harness |
| `@mammoth-ai/mmp-storage-json` | yes | JSON file KV storage backend for the DeepSeek Harness storage hub |
| `@mammoth-ai/mmp-storage-sqlite` | yes | SQLite storage backend (kv facet) for the DeepSeek Harness storage hub |

## subagent

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-subagent` | yes | Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents |
| `@mammoth-ai/mmp-subagent-acp` | yes | Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol |
| `@mammoth-ai/mmp-subagent-claude-code` | yes | One-shot Claude Code subagent provider over the official Agent SDK |
| `@mammoth-ai/mmp-subagent-codex` | yes | One-shot Codex subagent provider over the official app-server protocol |
| `@mammoth-ai/mmp-subagent-mmp-sdk` | yes | Out-of-process SDK subagent backend: drives a child DeepSeek Harness runtime subprocess over stdio JSON-RPC through the TypeScript SDK client |
| `@mammoth-ai/mmp-subagent-fork-in-process` | yes | In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log |
| `@mammoth-ai/mmp-subagent-spawn-in-process` | yes | In-process spawn subagent backend: runs a fresh child agent on ctx.agents |
| `@mammoth-ai/mmp-tool-subagent` | yes | Model-facing subagent delegation tool over the ctx.subagents seam |
| `@mammoth-ai/mmp-tool-subagent-control` | no | Shared messaging, interruption, and child discovery tools for subagents |

## subprocess

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-subprocess-local` | no | Local-subprocess implementation of the DeepSeek Harness subprocess seam |

## telemetry

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-otel` | no | Cordis service for independent ordinary-event and byte-bounded Session-log OTLP channels |

## terminal

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-terminal` | no | Persistent PTY session seam for the DeepSeek Harness — owner-scoped ids, backend registry, interactive sends, reads, signals, and awaited cleanup |
| `@mammoth-ai/mmp-terminal-bash` | yes | Persistent shell PTY backend over the DeepSeek Harness subprocess terminal primitive |

## test-support

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-llm-replay` | yes | Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests) |

## todo

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-tool-todo` | yes | Model-facing todo_write tool over the DeepSeek Harness event-sourced session log |

## typert

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-typert-loader` | yes | Loader integration for generated Typert package contributions |

## web

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-tool-web` | yes | Model-facing web tools (web_search, web_fetch) over the DeepSeek Harness web capability seam (ctx.web) |
| `@mammoth-ai/mmp-web` | yes | Abstract web access capability seam (ctx.web) for the DeepSeek Harness — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy |
| `@mammoth-ai/mmp-web-deepseek-api` | yes | DeepSeek Search and Fetch API providers for the DeepSeek Harness web capability seam (ctx.web) |
| `@mammoth-ai/mmp-web-fetch-http` | yes | Anonymous HTTP(S) fetch provider for the DeepSeek Harness web capability seam (ctx.web) |
| `@mammoth-ai/mmp-web-search-deepseek` | yes | DeepSeek-backed search provider (native web_search via the Anthropic-compatible API) for the DeepSeek Harness web capability seam (ctx.web) |
| `@mammoth-ai/mmp-web-search-exa` | yes | Exa-backed search provider for the DeepSeek Harness web capability seam (ctx.web) |
| `@mammoth-ai/mmp-web-search-perplexity` | yes | Perplexity-backed search provider for the DeepSeek Harness web capability seam (ctx.web) |

## workflow

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-tool-workflow` | yes | Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine |
| `@mammoth-ai/mmp-workflow-ptc` | yes | Workflow orchestration in the shared sandboxed Node PTC runtime |

## workspace

| Package | Config | Description |
|---|---|---|
| `@mammoth-ai/mmp-workspace` | no | Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the DeepSeek Harness |
