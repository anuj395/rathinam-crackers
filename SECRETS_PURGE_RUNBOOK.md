# Git History Secrets Purge — Runbook

WARNING: Rewriting git history is destructive. Coordinate with your team before proceeding and ensure you have backups and push permissions. This runbook guides a safe purge of sensitive values from the repository history using `git-filter-repo` (preferred) or `bfg` (alternative).

Overview
- Create an offline backup (mirror clone) of the repository.
- Identify secret patterns to remove (exact values or regex-friendly tokens).
- Run `git-filter-repo` with a replace-text file or a list of regexes.
- Verify the rewritten history locally.
- Force-push to remote and notify collaborators to reclone or rebase.
- Rotate any credentials that were leaked (immediately) — do not wait for push.

Prerequisites
- Install `git-filter-repo` (recommended):
  - macOS: `brew install git-filter-repo` (or `pip3 install git-filter-repo`)
  - Linux: `pip3 install git-filter-repo` or follow https://github.com/newren/git-filter-repo
- OR install BFG as an alternative: https://rtyley.github.io/bfg-repo-cleaner/
- Sufficient GitHub permissions to force-push to protected branches (or coordinate with repo admins).

Safety-first checklist
1. Notify team and pause merges to `main`/protected branches.
2. Create an offline backup:

```bash
git clone --mirror <repo-url> ../repo-backup-$(date +%Y%m%d-%H%M%S)
```

3. Identify sensitive patterns (do NOT paste secrets into shared files). Use tokens or identifiers.
4. Fill `tools/secrets-patterns.txt` with the exact values or safe regex patterns (local file only).

Example patterns to consider (edit before running):
- AWS_SECRET_ACCESS_KEY
- AWS_ACCESS_KEY_ID
- DATABASE_URL (or actual connection string)
- SESSION_SECRET and other JWT secrets
- Any long-looking base64/hex strings committed in `.env` files

How to run (git-filter-repo recommended)

1. Prepare a `replace.txt` file in the repository root with lines of the form:

```
# lines starting with "#" are comments
<exact-secret-string>==>REMOVED_IN_REPO
```

or use `tools/secrets-patterns.txt` to generate `replace.txt` using a safe, manual review.

2. Perform a dry-run by cloning and running filter-repo on the clone:

```bash
# in a safe working folder
git clone --mirror <repo-url> repo-mirror
cd repo-mirror
# run replace (this rewrites history) - double-check your replace.txt first
git filter-repo --replace-text ../replace.txt
```

3. Inspect the result locally. Check `git log`, file contents, and that no unwanted changes occurred.

4. Force-push to remote (ONLY AFTER COORDINATION):

```bash
# from repo-mirror
git push --force --all origin
git push --force --tags origin
```

5. Notify collaborators to reclone or follow recovery steps:
- `git fetch origin --prune` then rebase local work on top of updated branches, or reclone.

Alternative: BFG usage (simpler but less flexible)

```bash
# Example: delete all passwords matching a string
bfg --replace-text replace.txt --no-blob-protection repo.git
cd repo.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

Post-purge steps (mandatory)
- Rotate every credential that appeared in the repo.
- Revoke leaked API keys and generate new ones.
- Remove any temporary backup clones from shared machines.
- Update repository `README` or onboarding docs to never commit secrets and add `.env.example`.

Notes and caveats
- This process rewrites history and changes commit SHAs. Any PRs and forks will be affected.
- If you prefer, I can prepare the exact `replace.txt` file with the patterns you confirm (do NOT paste secrets in chat). Provide tokens or identifiers (names of env vars) and I will create the file locally for your review.

Contact & rollback
- If anything goes wrong, you can restore from the mirror clone backup created earlier.

---
