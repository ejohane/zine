# Skill Documentation Locations

## Decision

The canonical location for skill documentation is:

`/.codex/skills/<skill-name>/SKILL.md`

### Rationale

- Codex user-scoped skills already live under `$CODEX_HOME/skills`, so the repo-local analogue should live under `.codex/skills/`.
- Repo-local skills should use Codex-native packaging instead of `.opencode`-specific paths.
- Keeping a single canonical path avoids drift across duplicated copies.

## Migration Plan

1. Ensure each skill's full documentation lives only in `.codex/skills/<skill-name>/SKILL.md`.
2. Remove any duplicate copies or placeholder directories under `.opencode/skill/`, `.claude/skills/`, and `.github/skills/` once references are migrated.
3. When updating a skill, edit only the canonical file.
4. As skills are touched, migrate any remaining full copies into `.codex/skills/` and remove legacy locations.

## Legacy Locations

Legacy skill-doc paths under `.opencode/skill/`, `.claude/skills/`, and `.github/skills/` are deprecated. Use `.codex/skills/<skill-name>/SKILL.md` as the single source of truth.
