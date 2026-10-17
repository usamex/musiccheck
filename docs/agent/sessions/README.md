# Session transcripts

Redacted, human-readable logs of Claude Code sessions: user messages, assistant replies, a
one-line log of each tool call, and subagent reports. They are **history, not instructions** —
the authoritative state is `docs/agent/STATE.md`, and decisions live in `docs/decisions/`.

Generate from a session export (Claude desktop: session menu → Export, or the
`export_transcript` tool), then review before committing:

```bash
unzip session-export-*.zip -d /tmp/export
python3 scripts/session_to_markdown.py /tmp/export/transcript.jsonl \
  docs/agent/sessions/YYYY-MM-DD-session-N.md --title "Session N — YYYY-MM-DD (summary)"
grep -nE "@|/home/|/tmp/" docs/agent/sessions/YYYY-MM-DD-session-N.md   # leak check
```

Commit hashes quoted in the session-1 transcript belong to the original history, which was
rewritten into focused commits afterwards (ITERATIONS IT-006); use `git log` for current hashes.

Never commit the raw export (`*.jsonl`, `metadata.json`, the zip): it contains hidden reasoning,
full tool outputs, local configuration and personal data such as account emails.

| File | Summary |
|---|---|
| [2026-10-17-session-1.md](2026-10-17-session-1.md) | Bootstrap, backend + review fixes, mobile app, web preview, GitHub remote. No model work. Exported before the push itself. |
