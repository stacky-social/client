# Group I — Simulated Feedback Polish: Implementation Plan

**Date:** 2026-05-13

---

## Steps

### Step 1 — Write spec and plan docs
Create `docs/superpowers/specs/` and `docs/superpowers/plans/` directories and write this plan + the design spec.
Commit: `Add Group I spec and plan for simulated feedback polish`

### Step 2 — Fix per-robot avatar cycling + remove dead avatar state
In `src/components/ReplySection.tsx`:
- Remove `const [avatar, setAvatar] = useState(avatars[0])` (dead state).
- In the simulated replies map, change `<Avatar src={avatar} />` to `<Avatar src={avatars[index % avatars.length]} />`.
Commit: `Fix per-robot avatar cycling in ReplySection`

### Step 3 — SIMULATED badge: add uppercase text transform
In the `<Badge>` for each simulated reply, add `tt="uppercase"` prop.
Commit: `Add uppercase transform to SIMULATED badge`

### Step 4 — Flatten Feedback paper nesting + improve countdown label
- Replace the inner nested `<Paper>` (for advice/praise) with a plain `<div>` styled identically.
- Change button countdown label from `Submit? (Wait ${countdown} seconds)` to `Wait ${countdown}s…`.
Commit: `Flatten feedback paper nesting, improve countdown label`

### Step 5 — Verify build
Run `pnpm build` from the worktree root. Fix any TypeScript errors.

### Step 6 — Open PR
Target `tarcode2004/enhancement/listy-injection-main-app`.
Include spec/plan links and judgment calls in PR body.
