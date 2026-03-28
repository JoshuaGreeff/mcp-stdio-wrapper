# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

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
