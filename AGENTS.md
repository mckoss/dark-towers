# Repository working agreements

## Default completion workflow

For implementation requests, complete the repository workflow without additional prompting: commit and push small fixes directly to `main`; for non-trivial changes, open and squash-merge a pull request. Then monitor the configured deployment and report only after the exact commit is healthy in production.

Stop for approval only when a required action is destructive, credentials or deployment context do not match, or deployment failure recovery would expand the requested scope.
