# Security Policy

## Supported Versions

Security fixes are applied to the latest released version on the `main` branch line.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

## Security Scope

`MCP Stdio Wrapper` is intended for local development and smoke testing of stdio MCP servers.

It launches arbitrary commands supplied at runtime. That means:

- only use it with trusted target commands
- treat target env vars as sensitive
- do not expose this wrapper as a public multi-tenant service
- assume the launched target process has the same local-machine trust requirements as any other developer-run tool

## Reporting A Vulnerability

Please report vulnerabilities privately before opening a public issue.

Preferred reporting path:

- GitHub Security Advisories / private vulnerability reporting on this repository:
  https://github.com/JoshuaGreeff/mcp-stdio-wrapper/security/advisories/new

If private reporting is unavailable, contact the maintainer privately through GitHub rather than opening a public issue first.

- Maintainer contact profile:
  https://github.com/JoshuaGreeff

Please include:

- affected version
- reproduction steps
- impact
- any suggested mitigation or fix

## Response Expectations

- initial acknowledgement target: within 7 days
- status update target: within 14 days when a report is confirmed
- coordinated disclosure is preferred after a fix or mitigation is available

## Current Security Boundaries

- one bridge call launches one target process
- no persistent credential store
- target stderr is surfaced only to the caller handling the bridge result
- the wrapper does not attempt sandboxing or privilege reduction for the launched target command
- the wrapper is not intended to be exposed as a shared remote execution service
