#!/usr/bin/env bash
set -euo pipefail

# Interactive helper to run git-filter-repo to purge secrets from history.
# This script does NOT run automatically unless you confirm.

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

PATTERNS_FILE="tools/secrets-patterns.txt"
REPLACE_FILE="tools/replace.txt"
BACKUP_DIR="../repo-backup-$(date +%Y%m%d-%H%M%S)"

echo "Purge helper — repository: $ROOT_DIR"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install it first (pip3 install git-filter-repo) or use BFG. Aborting." >&2
  exit 1
fi

if [ ! -f "$PATTERNS_FILE" ]; then
  echo "No $PATTERNS_FILE found. Copy the example and edit it with exact patterns (local file, DO NOT share):"
  echo "  cp tools/secrets-patterns.example.txt $PATTERNS_FILE"
  exit 1
fi

echo "Step 1: creating an offline mirror backup at: $BACKUP_DIR"
git clone --mirror "$ROOT_DIR" "$BACKUP_DIR"

echo "Step 2: Building replace file from $PATTERNS_FILE -> $REPLACE_FILE"
# Create replace file expected by git-filter-repo. Format: exact_string==>replacement
# We'll replace matches with the token REMOVED_IN_REPO to be safe.
> "$REPLACE_FILE"
while IFS= read -r line; do
  # skip comments and empty lines
  [[ "$line" =~ ^# ]] && continue
  [[ -z "$line" ]] && continue
  # If line contains '=', treat RHS as placeholder or value
  if [[ "$line" == *=* ]]; then
    key="${line%%=*}"
    val="${line#*=}"
    if [[ "$val" == "REDACTED" ]]; then
      echo "# pattern for $key remains placeholder — replace REDACTED with actual secret before running" >> "$REPLACE_FILE"
    else
      # escape '->' and '==' not needed; write exact replacement
      echo "$val==>REMOVED_IN_REPO" >> "$REPLACE_FILE"
    fi
  else
    # treat whole line as literal secret
    echo "$line==>REMOVED_IN_REPO" >> "$REPLACE_FILE"
  fi
done < "$PATTERNS_FILE"

echo "Replace file generated at $REPLACE_FILE. Review it now. Press ENTER to open it, or Ctrl-C to abort."
read -r
${EDITOR:-vi} "$REPLACE_FILE"

echo "Ready to run git-filter-repo on the mirror clone. This will rewrite history in the local mirror. Continue? (yes/no)"
read -r ans
if [[ "$ans" != "yes" ]]; then
  echo "Aborted by user. The mirror backup is at: $BACKUP_DIR"
  exit 0
fi

# Run filter in the mirror clone
pushd "$BACKUP_DIR" >/dev/null

# Safety: show a preview of refs and size before running
git for-each-ref --format='%(refname)' refs/heads refs/tags | sed 's@refs/heads/@HEAD:@;s@refs/tags/@TAG:@'

git filter-repo --replace-text "$REPLACE_FILE"

# Garbage collect
git reflog expire --expire=now --all || true
git gc --prune=now --aggressive || true

popd >/dev/null

echo "Filter complete on mirror clone. Inspect the mirror at: $BACKUP_DIR"
echo "If everything looks good, you can force-push the rewritten history (requires coordination):"
cat <<'CMD'
cd <mirror-dir>
# push all branches and tags
git push --force --all origin
git push --force --tags origin
CMD

echo "Remember to rotate the leaked credentials immediately and notify the team to reclone." 
