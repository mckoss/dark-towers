# Dark Towers working agreements

## Branching, CI, and merge workflow

- Small, low-risk changes may go directly to `main` in the primary checkout unless `main` is protected. Run the relevant local tests, commit the change, and push it to GitHub without waiting for an additional prompt.
- For non-trivial changes, create a feature branch in a sibling worktree named `dark-towers-<feature-name>`. Never check out the feature branch in the primary checkout.
- Before publishing feature work, run all relevant local tests and checks. Commit the completed change, push the feature branch, and open or update its pull request.
- Wait until all required GitHub CI checks are green, then tell the user the change is ready to merge. Do not merge without the user's explicit confirmation.
- After confirmation, squash-merge the pull request. Remove the local worktree, delete the local branch, and delete the remote branch.
- Monitor post-merge CI and the production deployment for the exact merged commit. Report when production is ready; do not claim a change is live merely because CI passed.

## Worktree data

Runtime data lives in the gitignored `data/` directory. When work in a sibling feature worktree needs the existing local dataset, symlink `data/` from the primary checkout after verifying both paths. Keep the symlink, its target data, `config.json`, and all secrets out of commits.

## Production deployment

GitHub is the deployment control plane. Successful CI on `main` triggers the Railway production deployment configured by `railway.json`; do not deploy with the Railway CLI. After a push or merge to `main`, monitor the GitHub checks, the Railway deployment record for the exact commit, and `https://dark-towers.org/api/health` before reporting that production is ready.
