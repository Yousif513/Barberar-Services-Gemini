# worklog harvester-claude-release-run
role: harvester (not registrable in agents[]: the role enum has no harvester, see feedback harv-harvester-role-cannot-be-registered-in-agents)
mode: repair (learning pass over the claude-code release-gap run)    profile: regulated
started: 2026-10-06    ended: 2026-10-06
branch: claude-code (primora-fix). No application code, migration, capability record or other agent's worklog was touched.

claims-held: none
claims-released: n/a

did
- Read feedback[] (30 entries, 25 open), every worklog, and the session digest. Added 10 feedback entries for skill-relevant items nobody had recorded (status order and evidence token naming, scan vocabulary, silent zero-row updates after a policy is removed, invoker functions over tightened policies, audit coverage widened by deny-list, dialog primitive mechanics, native dialogs versus the confirmation contract, reviewer passes lost to usage limits, in-place function patching, harvester not registrable).
- harvest into the cross-project store (34 observations), copied the six earlier PRIMORA observations from the project-local store into the main store, ran promote.
- Opened lessons 0008 to 0012 in the skill; adopted 0008, 0009, 0011, 0012 by editing references/multi-agent.md, references/verification.md, references/stack-adapters.md, agents/adminwright-ux-reviewer.md, agents/adminwright-qa.md, agents/adminwright-security.md, SKILL.md; 0010 left proposed (script change). CHANGELOG [Unreleased] updated. evals/run.py clean.

verified
- evals/run.py: all fixtures match. unittest discover: 119 tests, 2 failures, both in the optional ocr CLI smoke tests (the ocr CLI is not usable on this machine); nothing this pass touched.

decided
- Declined as single-project or not the skill's: column-level exposure under row policies (skill text is correct about rows), audit allow-list and bulk cap, silent zero-row updates, Tailwind 4 traps, dialog mechanics, native-dialog guard spelling, usage-limit resume, in-place function patching, Windows shell quoting (project contract file), owner decisions (project).

found
- Skill defects worth a script change: set and add resolve evidence without a project root; emit to stdout is not UTF-8 on Windows; content scan matches whole files across word boundaries; agents[].role has no harvester.

next
- Rerun scripts/install_agents.py so project copies of the ux-reviewer, qa and security role files pick up the no-claim rule. Make the lesson 0010 script change, then rerun evals.

blocked-on
- none
