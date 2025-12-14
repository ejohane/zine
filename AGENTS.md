## MCP Agent Mail: coordination for multi-agent workflows

What it is

- A mail-like layer that lets coding agents coordinate asynchronously via MCP tools and resources.
- Provides identities, inbox/outbox, searchable threads, and advisory file reservations, with human-auditable artifacts in Git.

Why it's useful

- Prevents agents from stepping on each other with explicit file reservations (leases) for files/globs.
- Keeps communication out of your token budget by storing messages in a per-project archive.
- Offers quick reads (`resource://inbox/...`, `resource://thread/...`) and macros that bundle common flows.

## Project Identity

- **project_key**: `/Users/erikjohansson/dev/zine`
- Use this absolute path for all MCP Agent Mail tool calls in this repository.

## Quick Tool Reference

| Task               | Tool                        | Notes                                                                 |
| ------------------ | --------------------------- | --------------------------------------------------------------------- |
| Start a session    | `macro_start_session`       | Combines ensure_project, register, reserve, inbox fetch               |
| Send a message     | `send_message`              | `send_message(project_key, sender, to, subject, body_md, thread_id?)` |
| Reply to message   | `reply_message`             | Preserves thread, inherits importance/ack flags                       |
| Check inbox        | `fetch_inbox`               | `fetch_inbox(project_key, agent_name, limit=20, since_ts?)`           |
| Mark as read       | `mark_message_read`         | Per-recipient read receipt                                            |
| Acknowledge        | `acknowledge_message`       | For messages with `ack_required=true`                                 |
| Reserve files      | `file_reservation_paths`    | Returns `{granted: [], conflicts: []}`                                |
| Release files      | `release_file_reservations` | Call when done editing                                                |
| Search messages    | `search_messages`           | FTS5 query over subject and body                                      |
| Summarize thread   | `summarize_thread`          | Extracts participants, key points, action items                       |
| Request contact    | `request_contact`           | For cross-agent communication approval                                |
| Respond to contact | `respond_contact`           | Accept or deny contact requests                                       |

## Contact Policies

Agents have configurable contact policies that control who can message them:

- `open`: Accept any targeted messages in the project
- `auto` (default): Allow when shared context exists (same thread participants, overlapping file reservations, recent prior contact)
- `contacts_only`: Require an approved contact link first
- `block_all`: Reject all new contacts

Cross-agent messaging may require a `request_contact` → `respond_contact` handshake before messages can be delivered.

## Search Syntax (FTS5)

- **Phrase search**: `"build plan"` (exact match)
- **Prefix search**: `mig*` (matches migration, migrate, etc.)
- **Boolean operators**: `plan AND users NOT legacy`
- **Field boosting**: subject and body are both indexed

How to use effectively

1. Same repository
   - Register an identity: call `ensure_project`, then `register_agent` using this repo's absolute path as `project_key`.
   - Reserve files before you edit: `file_reservation_paths(project_key, agent_name, ["src/**"], ttl_seconds=3600, exclusive=true)` to signal intent and avoid conflict.
   - Communicate with threads: use `send_message(..., thread_id="FEAT-123")`; check inbox with `fetch_inbox` and acknowledge with `acknowledge_message`.
   - Read fast: `resource://inbox/{Agent}?project=<abs-path>&limit=20` or `resource://thread/{id}?project=<abs-path>&include_bodies=true`.
   - Tip: set `AGENT_NAME` in your environment so the pre-commit guard can block commits that conflict with others' active exclusive file reservations.

2. Across different repos in one project (e.g., Next.js frontend + FastAPI backend)
   - Option A (single project bus): register both sides under the same `project_key` (shared key/path). Keep reservation patterns specific (e.g., `frontend/**` vs `backend/**`).
   - Option B (separate projects): each repo has its own `project_key`; use `macro_contact_handshake` or `request_contact`/`respond_contact` to link agents, then message directly. Keep a shared `thread_id` (e.g., ticket key) across repos for clean summaries/audits.

Macros vs granular tools

- Prefer macros when you want speed or are on a smaller model: `macro_start_session`, `macro_prepare_thread`, `macro_file_reservation_cycle`, `macro_contact_handshake`.
- Use granular tools when you need control: `register_agent`, `file_reservation_paths`, `send_message`, `fetch_inbox`, `acknowledge_message`.

Common pitfalls

- "from_agent not registered": always `register_agent` in the correct `project_key` first.
- "FILE_RESERVATION_CONFLICT": adjust patterns, wait for expiry, or use a non-exclusive reservation when appropriate.
- Auth errors: if JWT+JWKS is enabled, include a bearer token with a `kid` that matches server JWKS; static bearer is used only when JWT is disabled.

## Integrating with Beads (dependency-aware task planning)

Beads provides a lightweight, dependency-aware issue database and a CLI (`bd`) for selecting "ready work," setting priorities, and tracking status. It complements MCP Agent Mail's messaging, audit trail, and file-reservation signals. Project: [steveyegge/beads](https://github.com/steveyegge/beads)

Recommended conventions

- **Single source of truth**: Use **Beads** for task status/priority/dependencies; use **Agent Mail** for conversation, decisions, and attachments (audit).
- **Shared identifiers**: Use the Beads issue id (e.g., `bd-123`) as the Mail `thread_id` and prefix message subjects with `[bd-123]`.
- **Reservations**: When starting a `bd-###` task, call `file_reservation_paths(...)` for the affected paths; include the issue id in the `reason` and release on completion.

Typical flow (agents)

1. **Pick ready work** (Beads)
   - `bd ready --json` → choose one item (highest priority, no blockers)
2. **Reserve edit surface** (Mail)
   - `file_reservation_paths(project_key, agent_name, ["src/**"], ttl_seconds=3600, exclusive=true, reason="bd-123")`
3. **Announce start** (Mail)
   - `send_message(..., thread_id="bd-123", subject="[bd-123] Start: <short title>", ack_required=true)`
4. **Work and update**
   - Reply in-thread with progress and attach artifacts/images; keep the discussion in one thread per issue id
5. **Complete and release**
   - `bd close bd-123 --reason "Completed"` (Beads is status authority)
   - `release_file_reservations(project_key, agent_name, paths=["src/**"])`
   - Final Mail reply: `[bd-123] Completed` with summary and links

Mapping cheat-sheet

- **Mail `thread_id`** ↔ `bd-###`
- **Mail subject**: `[bd-###] …`
- **File reservation `reason`**: `bd-###`
- **Commit messages (optional)**: include `bd-###` for traceability

Event mirroring (optional automation)

- On `bd update --status blocked`, send a high-importance Mail message in thread `bd-###` describing the blocker.
- On Mail "ACK overdue" for a critical decision, add a Beads label (e.g., `needs-ack`) or bump priority to surface it in `bd ready`.

Pitfalls to avoid

- Don't create or manage tasks in Mail; treat Beads as the single task queue.
- Always include `bd-###` in message `thread_id` to avoid ID drift across tools.
