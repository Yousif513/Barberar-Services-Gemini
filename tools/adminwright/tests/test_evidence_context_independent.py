# SPDX-License-Identifier: Apache-2.0
"""Independent adversarial CLI tests; no candidate implementation is changed here."""
import hashlib
import json
import os
import subprocess
from pathlib import Path
import unittest
import test_manifest as upstream


class IndependentEvidenceContext(upstream.TempProject):
    profile = "regulated"

    def setUp(self):
        super().setUp()
        upstream.TestHonestTiering.build_honest_manifest(self)

    def bind_test(self, body, name="tests/user.spec.ts"):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        data = self.read()
        data["entities"][0]["capabilities"][0]["tests"] = [name]
        data["screens"][0]["tests"] = [name]
        data["crossCutting"]["authorization"]["policyTests"] = [name]
        self.write(data)
        return path

    def blocked(self, rule):
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        self.assertIn("[" + rule + "]", out, out + err)
        return out

    def allowed(self):
        code, out, err = self.validate()
        self.assertEqual(code, 0, out + err)

    def review(self, assertions, extra=None):
        source = self.root / "src/users.js"
        source.parent.mkdir(exist_ok=True)
        source.write_text("export const query=users.list;\n", encoding="utf-8")
        data = {
            "classification": "Independent SOURCE REVIEW",
            "reviewer": "security-independent",
            "files": [{"path": "src/users.js", "sha256_utf8_crlf_to_lf": hashlib.sha256(source.read_bytes().decode('utf-8').replace('\r\n','\n').encode('utf-8')).hexdigest()}],
            "source_assertions": assertions,
        }
        if extra:
            data.update(extra)
        path = self.root / ".admin-console/evidence/independent-review.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
        manifest = self.read()
        manifest["entities"][0]["capabilities"][0]["evidence"] = [str(path.relative_to(self.root))]
        self.write(manifest)
        return path, data

    def test_baseline_control_is_honest_at_regulated_profile(self):
        self.allowed()

    def test_random_uuid_and_negative_pattern_can_coexist_without_authority(self):
        self.bind_test("import {randomUUID} from 'node:crypto'; test('user.list /admin/users',()=>{const id=randomUUID(); assert.doesNotMatch(listUsers(id), /mock|sample/);});")
        self.allowed()
        manifest = self.read()
        self.assertEqual(manifest["profile"], "regulated")
        self.assertEqual(manifest["entities"][0]["capabilities"][0]["reviewedBy"], "qa")

    def test_runtime_overlap_rejects_for_every_authoritative_binding_field(self):
        self.bind_test("test('user.list /admin/users',()=>{const id=crypto.randomUUID(); expect(listUsers(id)).toBeTruthy();});")
        original = self.read()
        for kind in ("dataBinding", "sourceOfTruth", "dataSources"):
            with self.subTest(kind=kind):
                manifest = json.loads(json.dumps(original))
                if kind == "dataBinding":
                    manifest["entities"][0]["capabilities"][0][kind] = "tests/user.spec.ts"
                elif kind == "sourceOfTruth":
                    manifest["entities"][0][kind] = "tests/user.spec.ts"
                else:
                    manifest["screens"][0][kind] = ["tests/user.spec.ts"]
                self.write(manifest)
                self.blocked("placeholder-scan")

    def test_runtime_overlap_with_source_directory_or_fragment_is_not_test_only(self):
        self.bind_test("test('user.list /admin/users',()=>{const id=crypto.randomUUID(); expect(listUsers(id)).toBeTruthy();});")
        original = self.read()
        for binding in ("tests", ".", "tests/user.spec.ts#export", "./tests/user.spec.ts"):
            with self.subTest(binding=binding):
                manifest = json.loads(json.dumps(original))
                manifest["entities"][0]["capabilities"][0]["dataBinding"] = binding
                self.write(manifest)
                self.blocked("placeholder-scan")

    def test_root_level_test_file_binding_is_not_isolated(self):
        self.bind_test("test('user.list /admin/users',()=>{const id=crypto.randomUUID(); expect(listUsers(id)).toBeTruthy();});", "users.test.mjs")
        manifest = self.read()
        manifest["entities"][0]["capabilities"][0]["dataBinding"] = "users.test.mjs"
        self.write(manifest)
        self.blocked("placeholder-scan")

    def test_absolute_runtime_binding_is_not_isolated(self):
        path = self.bind_test("test('user.list /admin/users',()=>{const id=crypto.randomUUID(); expect(listUsers(id)).toBeTruthy();});")
        manifest = self.read()
        manifest["entities"][0]["capabilities"][0]["dataBinding"] = str(path.resolve())
        self.write(manifest)
        self.blocked("placeholder-scan")

    def test_assertion_decoys_are_not_executable_assertions(self):
        prefixes = [
            "import assert from 'node:assert';\n",
            "// assert.equal(user.list(), 1);\n",
            "/* expect(user.list()).toBeTruthy(); */\n",
            "const note='assert.equal(user.list(),1)';\n",
            "const re=/assert.equal(user.list(),1)/;\n",
            "const assertiveness='user.list';\n",
        ]
        for prefix in prefixes:
            with self.subTest(prefix=prefix):
                self.bind_test(prefix + "test('user.list /admin/users',()=>{});")
                self.blocked("test-asserts-nothing")

    def test_readme_with_assertion_text_and_correct_token_is_not_a_test(self):
        self.bind_test("test('user.list /admin/users',()=>assert.equal(1,1));", "tests/README.md")
        self.blocked("test-asserts-nothing")

    def test_independent_wrong_capability_token_cannot_bind(self):
        self.bind_test("test('different.system',()=>assert.equal(realQuery().length,2));")
        self.blocked("evidence-token-match")

    def test_decoy_token_cannot_be_promoted_from_comment_import_or_literal(self):
        prefixes = ["// user.list /admin/users\n", "import token from '/admin/users';\n", "const token='user.list /admin/users';\n"]
        for prefix in prefixes:
            with self.subTest(prefix=prefix):
                self.bind_test(prefix + "test('different.system',()=>expect(realQuery()).toBeTruthy());")
                self.blocked("evidence-token-match")

    def test_positive_released_fallback_identifiers_are_still_blocked(self):
        identifiers = ["mockUsers", "m\u043eckUsers", "m_o_c_kUsers", "fake_users", "gmockRepositoryImpl", "usemockdata"]
        for identifier in identifiers:
            with self.subTest(identifier=identifier):
                self.bind_test("test('user.list /admin/users',()=>{const rows=" + identifier + "; assert.equal(rows.length,2);});")
                self.blocked("placeholder-scan")

    def test_negative_assertion_does_not_allow_positive_fallback_elsewhere(self):
        self.bind_test("test('user.list /admin/users',()=>{assert.doesNotMatch(wire(),/mock/); const rows=mockUsers; assert.equal(rows.length,2);});")
        self.blocked("placeholder-scan")

    def test_review_negative_clause_control_with_fresh_source_hash(self):
        self.review(["No mock fallback. List/detail are checked through the same parser."])
        self.allowed()

    def test_review_negation_does_not_launder_same_sentence_positive_clauses(self):
        clauses = [
            "No mock fallback, but empty results return mockUsers.",
            "No mock fallback and the screen uses fakeRows for an empty response.",
            "No sample fallback; the UI returns mockUsers instead.",
            "No mock fallback. Records are generated with randomUUID for the live table.",
        ]
        for clause in clauses:
            with self.subTest(clause=clause):
                self.review([clause])
                self.blocked("placeholder-scan")

    def test_review_negative_text_cannot_launder_other_fields(self):
        extras = [
            {"dataBinding": "mockUserRepository.findAll"},
            {"records": [{"name": "fake customer", "id": "sample-1"}]},
            {"source_assertions_extra": "uses placeholder rows"},
        ]
        for extra in extras:
            with self.subTest(extra=extra):
                self.review(["No mock data."], extra)
                self.blocked("placeholder-scan")

    def test_review_nested_claims_do_not_get_unbounded_negative_context(self):
        self.review(["No mock fallback.", {"claim": "mockUsers rendered on zero rows"}])
        self.blocked("placeholder-scan")

    def test_review_fresh_hash_is_not_an_exemption_for_runtime_binding(self):
        path, _body = self.review(["No mock fallback."])
        manifest = self.read()
        manifest["entities"][0]["capabilities"][0]["dataBinding"] = str(path.relative_to(self.root))
        self.write(manifest)
        self.blocked("placeholder-scan")

    def test_review_confusable_positive_identifier_stays_blocked(self):
        self.review(["No sample fallback. The screen returns m\u043eckUsers for empty results."])
        self.blocked("placeholder-scan")

    def test_review_bad_source_hash_restores_strict_scan(self):
        path, body = self.review(["No mock fallback."])
        body["files"][0]["sha256_utf8_crlf_to_lf"] = "f" * 64
        path.write_text(json.dumps(body), encoding="utf-8")
        self.blocked("placeholder-scan")

    def test_review_source_path_traversal_cannot_qualify_context(self):
        path, body = self.review(["No mock fallback."])
        external = self.tmp / "source.js"
        external.write_text("export const query=users.list;\n", encoding="utf-8")
        body["files"] = [{"path": "../source.js", "sha256_utf8_crlf_to_lf": hashlib.sha256(external.read_bytes().decode('utf-8').replace('\r\n','\n').encode('utf-8')).hexdigest()}]
        path.write_text(json.dumps(body), encoding="utf-8")
        self.blocked("placeholder-scan")

    def test_binary_and_oversized_review_cannot_receive_negation_allowance(self):
        path, body = self.review(["No mock fallback."])
        path.write_bytes(json.dumps(body).encode("utf-8") + b"\xff")
        self.blocked("evidence-file-invalid")
        path.write_bytes(json.dumps(body).encode("utf-8") + b" " * upstream.acm.EVIDENCE_READ_LIMIT)
        self.blocked("evidence-file-oversized")

    def test_exact_size_limit_scans_last_byte_instead_of_truncating(self):
        path = self.root / "evidence/tests.log"
        payload = b"test run\n" + b" " * (upstream.acm.EVIDENCE_READ_LIMIT - len(b"test run\n") - len(b"mock")) + b"mock"
        self.assertEqual(len(payload), upstream.acm.EVIDENCE_READ_LIMIT)
        path.write_bytes(payload)
        self.blocked("placeholder-scan")

    def test_path_traversal_and_directory_cannot_be_test_evidence(self):
        external = self.tmp / "external.test.mjs"
        external.write_text("test('user.list /admin/users',()=>assert.equal(1,1));", encoding="utf-8")
        original = self.read()
        for value in ("../external.test.mjs", "tests"):
            with self.subTest(value=value):
                manifest = json.loads(json.dumps(original))
                manifest["entities"][0]["capabilities"][0]["tests"] = [value]
                self.write(manifest)
                self.blocked("evidence-path-missing")

    def test_symlink_outside_root_cannot_receive_test_context(self):
        external = self.tmp / "external.test.mjs"
        external.write_text("test('user.list /admin/users',()=>assert.equal(1,1));", encoding="utf-8")
        link = self.root / "tests/linked.test.mjs"
        try:
            link.symlink_to(external)
            evidence_path = "tests/linked.test.mjs"
        except OSError as exc:
            if os.name != "nt":
                self.skipTest("Host does not authorize filesystem aliases: " + str(exc))
            # A Windows junction requires no symbolic-link privilege. Both the
            # alias and its target are verified beneath this test's owned temp
            # directory; only the junction itself is later removed, not its target.
            outside_dir = self.tmp / "external-directory"
            outside_dir.mkdir()
            (outside_dir / "external.test.mjs").write_text("test('user.list /admin/users',()=>assert.equal(1,1));", encoding="utf-8")
            junction = self.root / "tests/linked-directory"
            owned = self.tmp.resolve()
            self.assertIn(owned, junction.parent.resolve().parents)
            self.assertIn(owned, outside_dir.resolve().parents)
            env = dict(os.environ, VALIDATOR_TEST_ALIAS=str(junction), VALIDATOR_TEST_TARGET=str(outside_dir))
            proc = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:VALIDATOR_TEST_ALIAS -Target $env:VALIDATOR_TEST_TARGET -ErrorAction Stop | Out-Null"], capture_output=True, env=env)
            if proc.returncode:
                self.skipTest("Host denies symlinks and junction creation: " + proc.stderr.decode("utf-8", errors="replace"))
            self.assertEqual(junction.resolve(), outside_dir.resolve())
            self.addCleanup(junction.rmdir)
            evidence_path = "tests/linked-directory/external.test.mjs"
        manifest = self.read()
        manifest["entities"][0]["capabilities"][0]["tests"] = [evidence_path]
        self.write(manifest)
        self.blocked("evidence-path-missing")

    def test_global_validator_and_upstream_suite_are_unchanged(self):
        original = Path("C:/Users/Yousif's PC/.claude/skills/adminwright")
        self.assertEqual(hashlib.sha256((original / "scripts/admin_console_manifest.py").read_bytes()).hexdigest(), "7bf69a8383b32749ad1b855f312e24fad3cb786b5f552f60abb3580ce641d316")
        self.assertEqual(hashlib.sha256((original / "tests/test_manifest.py").read_bytes()).hexdigest(), "472045c15f0138762886950c406ef548aec0646b30691a11e5001fff170b05bf")
        self.assertEqual((Path(__file__).parent / "test_manifest.py").read_bytes(), (original / "tests/test_manifest.py").read_bytes())


if __name__ == "__main__":
    unittest.main()
