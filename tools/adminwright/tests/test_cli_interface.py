"""CLI applicability contract; web and security gates remain mandatory."""
import copy
import unittest
import test_manifest as upstream

class CliInterfaceRegression(upstream.TempProject):
    profile = "regulated"

    def setUp(self):
        super().setUp()
        upstream.TestHonestTiering.build_honest_manifest(self)
        entry = self.root / "scripts" / "inspect.mjs"
        entry.parent.mkdir()
        entry.write_text("export const inspect = () => 1;\n", encoding="utf-8")
        tests = self.root / "tests" / "recovery.test.mjs"
        tests.write_text("test('recovery.inspect', () => { assert.equal(inspect(), 1); });\n", encoding="utf-8")
        data = self.read()
        cap = copy.deepcopy(data["entities"][0]["capabilities"][0])
        cap.update(id="recovery.inspect", interfaceKind="cli", cliEntrypoint="scripts/inspect.mjs", uiRoutes=[], serverOperations=["scripts/inspect.mjs"], tests=["tests/recovery.test.mjs"])
        data["entities"][0]["capabilities"].append(cap)
        self.write(data)

    def change(self, **fields):
        data = self.read()
        data["entities"][0]["capabilities"][-1].update(fields)
        self.write(data)

    def test_cli_without_web_route_passes_only_with_real_local_entrypoint(self):
        code, out, err = self.validate()
        self.assertEqual(code, 0, out + err)
        code, out, err = upstream.run("coverage", "--manifest", self.manifest, "--project-root", self.root)
        self.assertEqual(code, 0, out + err)
        code, out, err = upstream.run("emit", "--manifest", self.manifest, "--format", "gap-report")
        self.assertEqual(code, 0, out + err)
        self.assertNotIn("cli-interface", out + err)

    def test_add_and_set_resolve_cli_files_under_the_manifest_project_root(self):
        data = self.read()
        cap = data["entities"][0]["capabilities"].pop()
        cap["serverOperations"].append("scripts/missing.mjs")
        self.write(data)
        import json
        code, out, err = upstream.run("add", "--manifest", self.manifest, "--kind", "capability", "--entity", "user", "--json", json.dumps(cap))
        self.assertEqual(code, 0, out + err)
        before = self.manifest.read_bytes()
        code, out, err = upstream.run("set", "--manifest", self.manifest, "--path", "entities[user].capabilities[recovery.inspect].cliEntrypoint", "--value", "scripts/missing.mjs")
        self.assertEqual(code, 2, out + err)
        self.assertIn("cli-interface", err)
        self.assertEqual(before, self.manifest.read_bytes())

    def test_invalid_or_nonlocal_entrypoints_refuse_in_plan_and_release(self):
        for entry in ["", "../escape.mjs", "/tmp/inspect.mjs", "C:/inspect.mjs", "scripts/../scripts/inspect.mjs", "scripts//inspect.mjs", "scripts/missing.mjs", "scripts", "scripts/inspect.txt"]:
            with self.subTest(entry=entry):
                self.change(cliEntrypoint=entry)
                for phase in ["plan", "release"]:
                    code, out, err = self.validate(phase=phase)
                    self.assertEqual(code, 1, out + err)
                    self.assertIn("cli-interface", out)

    def test_unknown_interface_and_web_decoy_refuse(self):
        for kind in ["shell", "", None, 1, "web"]:
            with self.subTest(kind=kind):
                self.change(interfaceKind=kind)
                code, out, err = self.validate(phase="plan")
                self.assertEqual(code, 1, out + err)
                self.assertIn("cli-interface", out)

    def test_cli_cannot_claim_a_web_route_or_screen(self):
        self.change(uiRoutes=["/admin/users"])
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        self.assertIn("cli-interface", out)
        self.change(uiRoutes=[])
        data = self.read()
        data["screens"][0]["capabilities"].append("recovery.inspect")
        self.write(data)
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        self.assertIn("cli-interface", out)

    def test_default_web_still_requires_route_and_screen(self):
        data = self.read()
        data["entities"][0]["capabilities"][0]["uiRoutes"] = []
        self.write(data)
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        self.assertIn("required-field-empty", out)
        self.assertIn("capability-screen-link", out)

    def test_cli_cannot_suppress_tests_policy_evidence_or_independent_review(self):
        for fields, rule in [({"tests": []}, "required-field-empty"), ({"authorizationPolicies": []}, "required-field-empty"), ({"evidence": []}, "required-field-empty"), ({"reviewedBy": "impl"}, "reviewer-identity")]:
            with self.subTest(fields=fields):
                original = self.read()
                self.change(**fields)
                code, out, err = self.validate()
                self.assertEqual(code, 1, out + err)
                self.assertIn(rule, out)
                self.write(original)

    def test_entrypoint_must_be_a_declared_server_operation(self):
        self.change(serverOperations=["UserRepository.findForAdmin"])
        code, out, err = self.validate(phase="plan")
        self.assertEqual(code, 1, out + err)
        self.assertIn("cli-interface", out)

    def test_empty_and_oversized_entrypoint_refuse(self):
        p = self.root / "scripts" / "inspect.mjs"
        for body in [b"", b" \n\t", b"\xff", b" " * (1024 * 1024 + 1)]:
            p.write_bytes(body)
            code, out, err = self.validate(phase="plan")
            self.assertEqual(code, 1, out + err)
            self.assertIn("cli-interface", out)

if __name__ == "__main__":
    unittest.main()
