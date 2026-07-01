# AI-Assisted Workflow Guide

This guide walks you through using Claude Code and the skills in this repo to follow the team development workflow. Each section matches a phase of your iteration cycle.

## Prerequisites

- GitHub CLI authenticated: `gh auth login`
- Claude Code installed and working
- `docs/team-agreement.md` and `docs/product-requirements.md` are updated and committed to the repo

## Step 1: Create GitHub Issues

Ask Claude to turn the plan into issues:

```plaintext
> Read the iteration 1 plan and create GitHub issues for each requirement
  and task. The team members are listed in docs/team-agreement.md.
  Use the "Iteration 1" milestone.
```

Check GitHub to verify: correct labels, milestone, assignees, and acceptance criteria on each issue.

## Step 2: Work on an Issue (Branch, Commit, PR)

> **Note:** Before you can work on actual features, you need to scaffold your tech stack and update `README.md` and `CLAUDE.md` with your project's setup, commands, and architecture. Without this, Claude won't know how to generate code that fits your project.

**Branch:** Pick an issue and create a branch:

```plaintext
> Create a branch for issue #3 (task: setup CI pipeline). I am <username>.
```

Claude creates a branch following the naming convention: `<username>/task/issue-3-setup-ci-pipeline`

**Commit:** After making changes, commit with the issue reference:

```plaintext
> Commit my changes
```

**PR:** Push and open a pull request:

```plaintext
> /pr-workflow 3
```

Claude verifies the branch name, checks diff size, pushes, and creates a PR with `Closes #3` and the PR template filled in.

## Step 3: Retrospective

At the end of an iteration, create the retrospective issue:

```plaintext
> /retrospective 1
```

Claude creates a GitHub issue with the right labels (`task` + `retrospective`), milestone, and all team members assigned. The three sections (what went well, what didn't, lessons learned) are for the team to fill in — be specific and actionable.

## What to Verify on GitHub

After completing these steps, your repo should show:

- **Milestone view** — all iteration issues in one place with open/closed status
- **Issue list** — features and tasks with correct labels and assignees
- **PR list** — PRs linked to issues with review status
- **Commit history** — every commit references an issue number
- **Branch list** — branches follow the naming convention

The analytics scripts parse labels, branch names, and PR metadata. If conventions are not followed, your work won't be attributed to you.
