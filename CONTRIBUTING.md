# Contributing

Thank you for your interest in contributing to migra-es.

---

## Getting started

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/migra-es.git
   cd migra-es
   npm install
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## Development environment

```bash
# Start in watch mode (auto-reloads on file changes)
npm run dev

# View live logs
tail -f logs/application-$(date +%Y-%m-%d).log
```

You need Redis and access to at least one Elasticsearch cluster (source and/or destination) to test migration flows.

---

## Code style

- ES modules (`import`/`export`) throughout
- JSX files use `.jsx` extension; plain JS uses `.js`
- No TypeScript — keep types as JSDoc comments where helpful
- No test suite is configured yet — manual testing against real clusters is the current approach
- Keep functions small and single-purpose; prefer named exports
- Log meaningful events with `logger.info` / `logger.warn` / `logger.error` at the layer that has context

---

## Commit messages

Use the imperative mood and a short summary line (under 72 characters):

```
Add checkpoint resume for scroll-based migrations

Fix dashboard showing 0 docs for completed tasks

Refactor bulkIndex to handle _type preservation
```

---

## Pull requests

1. Ensure your branch is up to date with `main`
2. Describe what the PR does and why in the PR body
3. Reference any related issues
4. Keep PRs focused — one logical change per PR

---

## Reporting bugs

Open an issue on GitHub with:
- Steps to reproduce
- Expected behaviour
- Actual behaviour
- Node.js version (`node --version`)
- Relevant log output from `logs/error-*.log`

---

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) as the project.

Copyright (c) 2024 Rodrigo Tornis — Tornis Tecnologia (www.tornis.com.br)
