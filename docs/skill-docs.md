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
2. Remove any duplicate copies or placeholder directories under `.claude/skills/` and `.github/skills/` once references are migrated.
3. When updating a skill, edit only the canonical file.
4. As skills are touched, migrate any remaining full copies into `.opencode/skill/` and remove legacy locations.

## Legacy Locations

Legacy skill-doc paths under `.claude/skills/` and `.github/skills/` are deprecated. Use `.opencode/skill/<skill-name>/SKILL.md` as the single source of truth.
