# Git Poison

Minimal VS Code extension scaffold with a sample command and an optional command to install a Git pre-commit hook.

## Commands
- **Git Poison: Hello** (`gitPoison.hello`) — test command.
- **Git Poison: Install Pre-commit Hook** (`gitPoison.installHook`) — writes a simple POSIX `pre-commit` hook to `.git/hooks/` in the first workspace folder.

## Dev
```bash
npm install
npm run watch   # then press F5 to launch the Extension Development Host
```

## Notes
- The hook uses only `sh` + `git` and writes status to `.git/git-poison/hook.json` for possible UI integration.
- Ensure your repo is opened as the first workspace folder.
# vscode-git-poison
