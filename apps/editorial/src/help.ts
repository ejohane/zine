export const EDITORIAL_HELP_TEXT = `Usage:
  editorial experiment-create --file <experiment.json>
  editorial experiment-update --experiment-id <id> --file <update.json>
  editorial experiment-status [--experiment-id <id>]
  editorial experiment-lock --experiment-id <id>
  editorial experiment-fail --experiment-id <id> --message <sanitized-message>
  editorial experiment-abandon --experiment-id <id> [--reason <reason>]
  editorial experiment-variant-publish --experiment-id <id> --variant-id <id> --label <A|B> --name <name> --description <description> --edition <edition.json> --snapshot <snapshot.json> --candidates <candidates.json> --validation <validation.json> --markdown <edition.md>
  editorial experiment-decide --experiment-id <id> --preference <A|B|NEITHER> [--notes <notes>] [--client-event-id <id>]
  editorial experiment-promote --experiment-id <id> --variant-id <id>
  editorial snapshot --output <snapshot.json> [--date YYYY-MM-DD] [--timezone America/Chicago] [--discovery <external-discovery.json>]
  editorial rank --file <snapshot.json> --output <candidates.json>
  editorial replay --directory <editorial-artifacts-directory> --output <replay-report.json>
  editorial portfolio-override --file <candidates.json> --output <candidates.json> --candidate-id <id> --action <include|exclude> --reason <reason>
  editorial run-start --run-id <id> --date <YYYY-MM-DD> --workflow-version <version> --prompt-version <version> --model <model>
  editorial run-fail --run-id <id> --stage <stage> --message <sanitized-message>
  editorial validate --file <draft.json> --output <edition.json> --report <validation.json>
  editorial render --file <edition.json> --output <edition.md>
  editorial publish --edition <edition.json> --snapshot <snapshot.json> --candidates <candidates.json> --validation <validation.json> --markdown <edition.md>

Environment:
  ZINE_ACCESS_TOKEN       PAT used for Zine reads and editorial persistence
  ZINE_X_ARCHIVE_TOKEN    optional PAT override for X archive reads`;
