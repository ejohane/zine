# Skill Documentation Locations

## Decision

The canonical location for skill documentation is:

`/.opencode/skill/<skill-name>/SKILL.md`

### Rationale

- The repo already uses `.opencode/skill/` for active skills (e.g. `cloudflare-logpull`).
- Automation and agent instructions reference `.opencode/skill/` paths.
- Keeping a single canonical path avoids drift across duplicated copies.

## Migration Plan

1. Ensure each skill's full documentation lives only in `.opencode/skill/<skill-name>/SKILL.md`.
2. Keep `.claude/skills/<skill-name>/SKILL.md` and `.github/skills/<skill-name>/SKILL.md` as short placeholders that point to the canonical file.
3. When updating a skill, edit only the canonical file and verify any placeholders still point to it.
4. As skills are touched, migrate any remaining full copies into `.opencode/skill/` and replace them with placeholders.
