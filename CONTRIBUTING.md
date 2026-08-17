# Contributing to Mimori

Thanks for your interest in contributing. Mimori is a self-hosted template — most people will fork it and adapt it to their own business rather than contribute upstream, and that's an intended use case, not a fallback. This guide is for changes you'd like to bring back to the shared template.

## Before you start

- For anything beyond a small fix, open an issue first describing the problem or proposal. It avoids duplicated work and lets maintainers weigh in on approach before code is written.
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the data model, RLS design, and recurrence/escalation engines before touching `supabase/migrations/` or the scheduled functions — changes there have correctness and security implications across every deployment.

## Development setup

Follow the [Local Development](./README.md#local-development) section of the README. You'll need your own free-tier Supabase project — never develop against or commit real project credentials (see [SECURITY.md](./SECURITY.md)).

## Making changes

- Keep pull requests focused — one feature or fix per PR.
- New/changed database behavior needs a new numbered migration under `supabase/migrations/` (don't edit existing, already-released migrations).
- Match existing code style (TypeScript, Tailwind utility classes, the Material Design 3 token system in `tailwind.config.ts`) rather than introducing new patterns.
- Run `npm run type-check` and `npm run lint` before opening a PR.
- Update `README.md` / `ARCHITECTURE.md` if you change setup steps, env vars, or the data model.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your changes with clear, descriptive commits.
3. Open a PR describing what changed and why, and how you tested it (screenshots welcome for UI changes).
4. Be responsive to review feedback — PRs that go stale without updates may be closed.

## Reporting bugs / requesting features

Use the issue templates under **New Issue**. For security-sensitive bugs, see [SECURITY.md](./SECURITY.md) instead of filing a public issue.

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). Be respectful and constructive.
