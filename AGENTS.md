# Unified AI Agent Rules & Constraints (AGENTS.md)

This file contains the mandatory operational rules, constraints, and verification protocols that **ALL AI models** (Claude Code, Gemini/Antigravity, Cursor, and Codex) must read and verify **BEFORE** taking any action in this workspace.

---

## 1. Pre-Work Verification Checklist (Read before editing)
Before modifying any files or running commands, you **MUST** execute the following steps:
1. **Check Git Status**: Run `git status` and `git diff` to audit the current branch and verify if there are any uncommitted changes left by another model.
2. **Verify Branch Alignment**:
   * If you are **Claude Code**: You must be on the `claude-code` branch. Switch via `git checkout claude-code` if not.
   * If you are **Gemini (Antigravity)**: You must be on the `gemini` branch. Switch via `git checkout gemini` if not.
3. **Read the Changelog**: Open [.coworking_changelog.md](file:///c:/Users/Yousif's%20PC/Desktop/Ai%20Projects/Barberar%20Services-Gemini/.coworking_changelog.md) to review what the other models recently committed.
4. **Sync with Master**: Ensure your branch is updated by merging/pulling the latest stable code from `master` (`git pull origin master`).

---

## 2. Coding & Design Integrity Rules
* **No Full-File Overwrites**: Never overwrite a tracked file completely. Always perform targeted line replacements (search-and-replace) to preserve surrounding hooks, comments, and structure.
* **No Placeholders**: Never write placeholders, mockup stubs, or "TODO" comments. Implement complete, fully functional code structures.
* **Bilingual UI (AR/EN)**: All UI components must support translations. Direct hardcoding of strings is prohibited.
* **RTL Mirroring**: Enable Right-to-Left (RTL) mirroring when the active locale is Arabic (`dir="rtl"`). Mirror flex rows, navigation controls, and icons.
* **Observe the Design System**: Read and follow the localized design system skills (`primora-design-system`, `primora-dashboard-layout`, `primora-data-visualization`) before editing layout components.

---

## 3. Post-Work Verification Checklist (Run before ending session)
Before completing your turn or ending your session, you **MUST** verify codebase health:
1. **Run Mobile Type-Check**: Execute `npm run typecheck:mobile` to verify Expo React Native TS safety.
2. **Run Web Build**: Execute `npm run build --workspace=web_platform` to verify Next.js build compilation.
3. **Log Your Progress**: Append your changes (modified files, commit hash, and next steps) to [.coworking_changelog.md](file:///c:/Users/Yousif's%20PC/Desktop/Ai%20Projects/Barberar%20Services-Gemini/.coworking_changelog.md).
4. **Commit & Push**: Commit your changes to your designated branch and push them to `origin`.

---

*By proceeding with any action in this repository, you agree to follow these guidelines.*
