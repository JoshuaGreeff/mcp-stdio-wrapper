# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- explicit session lifecycle tools for multi-step smoke tests
- property-based fuzz tests and a scheduled fuzz workflow
- a fuller published security policy with supported versions and reporting expectations
- a documented `dev` integration branch strategy

### Changed

- wrapper docs and guidance now describe both one-shot and session-scoped smoke-test flows
- pinned GitHub Actions workflow dependencies to immutable commit SHAs
- tightened workflow hardening beyond the initial branch protection and token-scope fixes
- CI, CodeQL, and Fuzz workflows now validate both `main` and `dev`

## [0.1.1] - 2026-03-28

### Added

- built-in wrapper guidance surfaces via `wrapper://how-to-use` and `tool_usage_guide`
- publishing checklist and package/release hardening docs
- Scorecard workflow, `.nvmrc`, `.gitattributes`, and package verification in CI

### Changed

- release workflow now supports first-publish token auth and follow-on npm trusted publishing via GitHub OIDC
- release packaging and npm metadata were tightened for public distribution
- automatic GitHub release asset upload was removed so the publish workflow can run with read-only `contents` permissions

## [0.1.0] - 2026-03-27

### Added

- initial stdio MCP bridge server
- bridge tools for tools, resources, and prompts
- target stderr surfacing on failures
- per-call target timeout support
- setup, reference, troubleshooting, and maintainer documentation
- CI, release, CodeQL, and Dependabot automation
