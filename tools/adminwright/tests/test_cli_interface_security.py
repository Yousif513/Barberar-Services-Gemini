"""Independent security coverage for explicit local CLI applicability."""
import copy
import json
import os
import subprocess
import unittest
import test_manifest as upstream

class IndependentCliSecurity(upstream.TempProject):
    profile = "regulated"

    def setUp(self):
        super().setUp()
        upstream.TestHonestTiering.build_honest_manifest(self)
        self.entry = self.root / "scripts" / "inspect.mjs"
        self.entry.parent.mkdir()
        self.entry.write_text("export const inspect = () => 'bounded';\n", encoding="utf-8")
        (self.root / "tests" / "cli.test.mjs").write_text("test('security.inspectcli', () => assert.ok(inspect()));\n", encoding="utf-8")
        data = self.read()
        cap = copy.deepcopy(data["entities"][0]["capabilities"][0])
        cap.update(id="security.inspectcli", interfaceKind="cli", cliEntrypoint="scripts/inspect.mjs", uiRoutes=[], serverOperations=["scripts/inspect.mjs"], tests=["tests/cli.test.mjs"])
        data["entities"][0]["capabilities"].append(cap)
        self.write(data)
        code, out, err = self.validate()
        self.assertEqual(code, 0, out + err)

    def change(self, **fields):
        data = self.read()
        data["entities"][0]["capabilities"][-1].update(fields)
        self.write(data)

    def reject(self, rule, phase="release"):
        code, out, err = self.validate(phase=phase)
        self.assertEqual(code, 1, out + err)
        self.assertIn(rule, out)

    def test_actual_windows_junction_entrypoint_cannot_escape_file_validation(self):
        real = self.root / "real-scripts"
        self.entry.parent.rename(real)
        subprocess.run(["node", "-e", "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')", str(real), str(self.entry.parent)], check=True, capture_output=True)
        self.reject("cli-interface", "plan")
        self.reject("cli-interface")

    def test_actual_hardlinked_entrypoint_is_not_an_ordinary_single_file(self):
        alias = self.root / "scripts" / "second.mjs"
        os.link(self.entry, alias)
        self.reject("cli-interface", "plan")
        self.reject("cli-interface")

    def test_explicit_cli_does_not_waive_command_controls(self):
        self.change(kind="command", risk="critical", idempotency="", safeguards=[], recovery="", auditEvents=[])
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        for rule in ["high-risk-controls", "idempotency-missing", "audit-events-missing", "separation-of-duties"]:
            self.assertIn(rule, out)

    def test_cli_unknown_role_and_self_review_remain_errors(self):
        self.change(roles=["unassigned-development-role"], reviewedBy="impl")
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        self.assertIn("unknown-role-reference", out)
        self.assertIn("reviewer-identity", out)

    def test_cli_cannot_hide_missing_or_irrelevant_test_evidence(self):
        self.change(tests=["tests/absent.test.mjs"])
        self.reject("evidence-path-missing")
        self.change(tests=["tests/cli.test.mjs"])
        (self.root / "tests" / "cli.test.mjs").write_text("assert.ok(true);\n", encoding="utf-8")
        self.reject("evidence-token-match")

    def test_default_web_route_anchor_and_bad_cli_mode_both_fail_closed(self):
        data = self.read()
        web = data["entities"][0]["capabilities"][0]
        web["uiRoutes"] = []
        self.write(data)
        self.change(cliEntrypoint="../inspect.mjs")
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        self.assertIn("cli-interface", out)
        self.assertIn("capability-screen-link", out)
        self.assertIn("required-field-empty", out)

    def test_cli_helper_requires_verified_root_and_handles_nonstring_discriminator(self):
        cap = self.read()["entities"][0]["capabilities"][-1]
        self.assertIn("project root", upstream.acm.cli_interface_error(cap, None))
        for value in [{"cli": True}, [], False]:
            with self.subTest(value=value):
                candidate = dict(cap, interfaceKind=value)
                self.assertIn("interfaceKind", upstream.acm.cli_interface_error(candidate, self.root))

    def test_real_add_set_keep_cli_context_and_refuse_invalid_batches_atomically(self):
        original = self.read()["entities"][0]["capabilities"][-1]
        valid = dict(original, id="security.secondcli", serverOperations=["scripts/inspect.mjs", "scripts/missing.mjs"])
        invalid = dict(original, id="security.thirdcli", cliEntrypoint="scripts/missing.mjs", serverOperations=["scripts/missing.mjs"])
        before = self.manifest.read_bytes()
        code, out, err = upstream.run("add", "--manifest", self.manifest, "--kind", "capability", "--entity", "user", "--json", json.dumps([valid, invalid]))
        self.assertEqual(code, 2, out + err)
        self.assertIn("cli-interface", err)
        self.assertEqual(before, self.manifest.read_bytes())
        code, out, err = upstream.run("add", "--manifest", self.manifest, "--kind", "capability", "--entity", "user", "--json", json.dumps(valid))
        self.assertEqual(code, 0, out + err)
        selector = "entities[user].capabilities[security.secondcli]."
        code, out, err = upstream.run("set", "--manifest", self.manifest, "--path", selector + "outcome", "--value", "Inspect local integrity")
        self.assertEqual(code, 0, out + err)
        self.assertEqual(self.read()["entities"][0]["capabilities"][-1]["outcome"], "Inspect local integrity")
        before = self.manifest.read_bytes()
        code, out, err = upstream.run("set", "--manifest", self.manifest, "--path", selector + "cliEntrypoint", "--value", "scripts/missing.mjs")
        self.assertEqual(code, 2, out + err)
        self.assertIn("cli-interface", err)
        self.assertEqual(before, self.manifest.read_bytes())

if __name__ == "__main__":
    unittest.main()
