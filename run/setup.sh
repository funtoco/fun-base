#!/usr/bin/env bash
set -euo pipefail

WORKTREE_PATH="${CODEX_WORKTREE_PATH:-$(pwd)}"
MAIN_CHECKOUT_PATH="${FUN_BASE_MAIN_CHECKOUT_PATH:-/Users/nishimuratomooakira/workspace/funtoco/fun-base}"

cd "$WORKTREE_PATH"

echo "==> Preparing FunBase worktree: $WORKTREE_PATH"

echo "==> Fetching latest origin/main for this worktree"
git fetch origin main

worktree_status="$(git status --porcelain)"
if git merge-base --is-ancestor HEAD origin/main; then
  has_local_commits=no
else
  has_local_commits=yes
fi

if [ -z "$worktree_status" ] && [ "$has_local_commits" = "no" ]; then
  git merge --ff-only origin/main
else
  echo "==> Skipping worktree fast-forward (dirty=$([ -n "$worktree_status" ] && echo yes || echo no), has-local-commits=$has_local_commits)"
fi

if [ -d "$MAIN_CHECKOUT_PATH/.git" ] || git -C "$MAIN_CHECKOUT_PATH" rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> Refreshing main checkout: $MAIN_CHECKOUT_PATH"
  git -C "$MAIN_CHECKOUT_PATH" fetch origin main

  main_branch="$(git -C "$MAIN_CHECKOUT_PATH" branch --show-current || true)"
  main_status="$(git -C "$MAIN_CHECKOUT_PATH" status --porcelain)"
  if [ "$main_branch" = "main" ] && [ -z "$main_status" ]; then
    git -C "$MAIN_CHECKOUT_PATH" pull --ff-only origin main
  else
    echo "==> Skipping main checkout pull (branch=$main_branch, dirty=$([ -n "$main_status" ] && echo yes || echo no))"
  fi

  for env_file in .env.local .env; do
    source_env="$MAIN_CHECKOUT_PATH/$env_file"
    target_env="$WORKTREE_PATH/$env_file"
    if [ -f "$source_env" ]; then
      cp -p "$source_env" "$target_env"
      echo "==> Copied $env_file from main checkout"
    fi
  done
else
  echo "==> Main checkout not found at $MAIN_CHECKOUT_PATH; skipping env sync"
fi

echo "==> Initializing submodules"
git submodule update --init --recursive

echo "==> Setup complete"
