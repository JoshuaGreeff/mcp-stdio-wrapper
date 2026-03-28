# Troubleshooting

## The Wrapper Starts But The Target Does Not

Check:

- `command` points to a real executable
- `args` points to the real target entrypoint
- `cwd` is the correct project directory
- the target server runs successfully outside the wrapper first

## The Target Needs Environment Variables

Use:

- `inheritParentEnv: true` to keep the wrapper process environment
- `env` to add or override the variables the target needs

If you want a minimal isolated target environment, set `inheritParentEnv` to `false`.

## The Call Hangs

Set or lower `timeoutMs`.

Common causes:

- the target build is stale or broken
- the target server never reaches MCP initialize
- the target server is waiting on missing configuration or secrets

## The Wrapper Returns A Target Stderr Tail

That is expected behavior. The wrapper captures target stderr so the failure is easier to diagnose from the calling MCP client.

## My Main MCP Host Still Feels Stale

The wrapper removes the need to refresh the editor host just to relaunch the real target server. It does not change how your editor caches the wrapper process itself.

In practice that is fine because:

- the wrapper is stable
- the target server is launched fresh on every bridge call

## This Feels Slow

That is the tradeoff of the design.

Each bridge call launches a fresh target process, so this project is best for:

- smoke tests
- repeated sanity checks during development

It is not designed as a persistent low-latency proxy.
