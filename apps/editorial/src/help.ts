export const EDITORIAL_HELP_TEXT = `Usage:
  editorial snapshot --output <snapshot.json> [--date YYYY-MM-DD] [--timezone America/Chicago]
  editorial rank --file <snapshot.json> --output <candidates.json>
  editorial run-start --run-id <id> --date <YYYY-MM-DD> --workflow-version <version> --prompt-version <version> --model <model>
  editorial run-fail --run-id <id> --stage <stage> --message <sanitized-message>
  editorial validate --file <draft.json> --output <edition.json> --report <validation.json>
  editorial render --file <edition.json> --output <edition.md>
  editorial publish --edition <edition.json> --snapshot <snapshot.json> --candidates <candidates.json> --validation <validation.json> --markdown <edition.md>

Environment:
  ZINE_ACCESS_TOKEN       PAT used for Zine reads and editorial persistence
  ZINE_X_ARCHIVE_TOKEN    optional PAT override for X archive reads`;
