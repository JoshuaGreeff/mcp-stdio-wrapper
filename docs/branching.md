# Branching Strategy

## Overview

This repository uses a lightweight staged flow:

- `main`
  - protected stable branch
  - should always represent releasable code
- `dev`
  - integration branch for ongoing work
  - feature branches should normally target `dev`

## Why This Repo Uses `dev`

For many small projects, GitHub Flow with short-lived branches directly into `main` is enough.

This repository intentionally keeps a `dev` branch because:

- `main` is protected and treated as the stable release branch
- security and workflow hardening changes can be grouped and verified before promoting to `main`
- the project is still being actively outfitted, so a staging branch reduces churn on the release branch

## Expected Flow

1. branch from `dev`
2. open pull requests back into `dev`
3. let `CI`, `CodeQL`, and `Fuzz` validate the integration branch
4. when satisfied, open a promotion pull request from `dev` into `main`
5. publish releases from `main` tags only

## Branch Protection Guidance

Recommended:

- keep `main` more strict than `dev`
- require pull requests and passing checks on `main`
- optionally allow a lighter rule set on `dev` if you want faster integration

Current live `main` ruleset requires:

- `CI`
  - matrix `test` jobs on Windows and Linux for Node `20` and `22`
- `CodeQL`
  - `analyze (javascript-typescript)`
- `Scorecard`
  - `analysis`
- `Fuzz`
  - `fuzz`

Reasonable future tightening:

- require additional review approvals once there is at least one trusted non-owner reviewer

## Notes

- do not publish releases from `dev`
- do not tag releases from `dev`
- keep release tags on commits reachable from `main`
