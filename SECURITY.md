# Security Policy

## Supported Versions

Mimori is distributed as a self-hosted template rather than a versioned package — there is no upstream instance to patch on your behalf. Each fork/deployment is responsible for pulling in fixes from this repository.

## Reporting a Vulnerability

If you find a security vulnerability in Mimori (e.g. an RLS policy gap, an auth bypass, an injection point, or a way to access another store's/tenant's data), please report it privately rather than opening a public issue:

1. Use GitHub's [private vulnerability reporting](../../security/advisories/new) for this repository (Security tab → "Report a vulnerability").
2. Include steps to reproduce, the affected file(s)/migration(s), and the potential impact.

Please do not include real customer data, credentials, or production URLs in a report — a minimal reproduction against a fresh local Supabase project is sufficient.

You should expect an initial response within a few days. Since this is a community-maintained template rather than a hosted service, there is no bug bounty program.

## Scope Notes

- Mimori ships with Row Level Security (RLS) policies in `supabase/migrations/`. If you find a query or policy that leaks data across roles or stores, that's in scope.
- Each deployment uses its own Supabase project, API keys, and secrets — a vulnerability in *your* deployed instance's configuration (e.g. a leaked service role key) is not a vulnerability in this codebase. See the [README](./README.md#setup--deployment) for correct secret handling.
