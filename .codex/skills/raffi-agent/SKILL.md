---
name: raffi-agent
description: Manage funtoco/fun-docs issue workflow by splitting parent issues into granular child issues, linking parent-child checklists, adding child issues to ProjectV2 board "タスク管理" in No Status, and closing parent issues with Japanese team-facing comments. Also covers fun-base migration/runbook checks and fun-base-infra branch protection requirement/apply/verification operations used in docs issues like #237 and #572-#574.
---

# Raffi Agent

Execute the recurring fun-docs issue management flow with consistent Japanese comments for team and leader visibility.

## Core Rules
- Write issue comments in Japanese unless the user explicitly asks otherwise.
- Keep parent issues as high-level trackers and move execution to child issues.
- Keep newly created child issues in `open` and `No Status` unless the user asks for another status.
- Use label `notion:タスク` for this workflow.

## Workflow
1. Read the parent issue body and comments and extract actionable tasks.
2. Split the tasks into granular child issues with clear completion criteria.
3. Include `親Issue: #<number>` and `Status: No Status` in each child issue body.
4. Update the parent issue body with `分割タスク（No Status）` checklist links.
5. Post a Japanese summary comment on the parent issue.
6. Add all child issues to project `タスク管理`.
7. Verify all child issues are visible in `No Status`.
8. Close the parent issue only when explicitly requested.

## Migration Issue Mode (fun-base / issue #237 style)
Use this mode when the issue includes migration, Supabase operations, or tenant sync rollout.

1. Keep execution split by lifecycle:
- infra migration (submodule repo) first
- app PR with submodule pointer update second
2. For local non-destructive migration apply, use:
- `npx supabase start`
- `npx supabase db push --local`
3. Use `npx supabase db reset` only when full replay is required; it wipes local data.
4. If migration apply fails with duplicate version, rename the new migration timestamp/version so every migration is unique.
5. Validate sync behavior with:
- `curl -X POST "https://localhost:3000/api/cron/sync-by-type?type=people" -H "Content-Type: application/json" -k`
- `curl -X POST "https://localhost:3000/api/cron/sync-by-type?type=visas" -H "Content-Type: application/json" -k`
6. For tenant-connector bootstrap tasks, use SQL function checks:
- `select * from combine_tenant_with_connector('<法人名>', '<法人ID>');`
7. Known safe logs:
- `SUPABASE_AUTH_EXTERNAL_FACEBOOK_* is unset` warnings are non-blocking when Facebook login is not used.
- `open supabase/people-images: no such file or directory` can appear in local reset flow; treat as project-specific storage setup follow-up, not production DB risk.

## Branch Protection Issue Mode (fun-base-infra / issue #572-#574 style)
Use this mode when the issue is about `funtoco/fun-base-infra` branch protection requirement definition, settings apply, or verification.

1. Confirm current protection state first:
- `gh api repos/funtoco/fun-base-infra/branches/main/protection`
- If response is `Branch not protected (404)`, treat as not configured yet.
2. For requirement-definition issues, document clearly:
- protected branch (`main`)
- review rule (minimum approvals and stale review handling)
- push/force-push/delete restrictions
- required status checks list
- admin exception policy and audit trail requirement
3. For apply issues, set Branch Protection in repo settings/API strictly based on approved requirements.
4. Before enforcing required checks, confirm check contexts actually exist or are intentionally introduced by workflow changes to avoid accidental merge lock.
5. For verification issues, confirm both fail path and pass path:
- unapproved PR cannot merge
- approved PR with all required checks can merge
6. Close issue with a concise Japanese comment that includes what was set/verified and points to the next issue if any.

## DB/Infra Safety Baseline Policy (recommended default)
Apply this as the default for infra/database repositories unless the user explicitly requests a different policy.

1. Protected branch:
- `main` must always be protected.
2. Merge policy:
- PR-only merge (no direct push).
- minimum 1 approval required.
- require conversation resolution before merge.
3. Push/delete policy:
- force-push disabled.
- branch deletion disabled.
4. Status checks policy:
- `Require status checks to pass before merging` enabled (`strict=true`).
- required check contexts must be explicitly listed once CI check names are confirmed.
- avoid leaving required checks empty in long-term operation.
5. Verification policy:
- verify current state via API before and after apply.
- leave a Japanese evidence comment in the issue with key protection fields.

## Command Patterns
```bash
# Create child issue
gh api repos/funtoco/fun-docs/issues \
  -f title='...' \
  -f body='...' \
  -f 'labels[]=notion:タスク'

# Update parent issue body with checklist
gh api repos/funtoco/fun-docs/issues/<PARENT_NUMBER> -X PATCH -f body='...'

# Add issue to project
gh project list --owner funtoco
gh project item-add 1 --owner funtoco --url https://github.com/funtoco/fun-docs/issues/<CHILD_NUMBER>

# Verify No Status
gh project item-list 1 --owner funtoco --format json --limit 500

# Close parent with Japanese comment
gh issue close <PARENT_NUMBER> --repo funtoco/fun-docs --comment '親Issueはクローズします。以降の対応は子Issueで進めます。'
```

## Project Scope Prerequisite
If project operations fail due scope errors, refresh GitHub auth scopes:

```bash
gh auth refresh --hostname github.com -s read:project -s project
```

## Reference
- `references/fun-docs-issue-flow.md`
- `references/fun-base-migration-runbook.md`
- `references/fun-base-branch-protection-runbook.md`
