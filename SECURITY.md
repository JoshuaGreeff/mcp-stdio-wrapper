# Security Policy

## Supported Use

`MCP Stdio Wrapper` is intended for local development and smoke testing of stdio MCP servers.

It launches arbitrary commands supplied at runtime. That means:

- only use it with trusted target commands
- treat target env vars as sensitive
- do not expose this wrapper as a public multi-tenant service

## Reporting

If you find a security issue, report it privately to the maintainer before opening a public issue.

Recommended public repo setup:

- enable GitHub Security Advisories
- use private vulnerability reporting on GitHub
- avoid posting exploit details in public issues before a fix is available

## Current Security Boundaries

- one bridge call launches one target process
- no persistent credential store
- target stderr is surfaced only to the caller handling the bridge result
- the wrapper does not attempt sandboxing or privilege reduction for the launched target command
