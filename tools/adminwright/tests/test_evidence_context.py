# SPDX-License-Identifier: Apache-2.0
"""Project-local regression contract. Original upstream tests stay unmodified."""
import hashlib
import json
from pathlib import Path
import unittest
import test_manifest as upstream


class EvidenceContextRegression(upstream.TempProject):
    profile = "regulated"

    def setUp(self):
        super().setUp()
        upstream.TestHonestTiering.build_honest_manifest(self)

    def set_test(self, body, name="tests/user.spec.ts"):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
        data = self.read()
        data["entities"][0]["capabilities"][0]["tests"] = [name]
        data["screens"][0]["tests"] = [name]
        data["crossCutting"]["authorization"]["policyTests"] = [name]
        self.write(data)
        return target

    def assert_pass(self):
        code, out, err = self.validate()
        self.assertEqual(code, 0, out + err)

    def assert_blocked(self, rule):
        code, out, err = self.validate()
        self.assertEqual(code, 1, out + err)
        self.assertIn("[" + rule + "]", out, out + err)
        return out

    def test_isolated_uuid_fixtures_are_valid_executable_test_evidence(self):
        self.set_test("import { randomUUID } from 'node:crypto';\ntest('user.list via /admin/users', () => { const id=randomUUID(); expect(listUsers(id)).toBeTruthy(); });")
        self.assert_pass()

    def test_same_test_path_in_runtime_binding_keeps_strict_placeholder_scan(self):
        self.set_test("test('user.list',()=>{ const id=crypto.randomUUID(); expect(listUsers(id)).toBeTruthy(); });")
        data=self.read();data["entities"][0]["capabilities"][0]["dataBinding"]="tests/user.spec.ts";self.write(data)
        self.assert_blocked("placeholder-scan")

    def test_test_directory_alone_does_not_make_a_production_fixture_a_test(self):
        self.set_test("export const randomUsers = [{name:'fake'}]; // assert.equal user.list\n")
        self.assert_blocked("placeholder-scan")

    def test_imports_comments_and_string_literals_are_not_assertions(self):
        for body in [
            "import assert from 'node:assert'; test('user.list',()=>{});",
            "test('user.list',()=>{ /* assert.equal(1,1) */ });",
            "test('user.list',()=>{ const note=\"assert.equal(1,1)\"; });",
            "test('user.list',()=>{ const re=/assert.equal(1,1)/; });",
        ]:
            with self.subTest(body=body):
                self.set_test(body)
                self.assert_blocked("test-asserts-nothing")

    def test_non_executable_readme_cannot_be_test_evidence(self):
        self.set_test("user.list\nassert.equal(listUsers().length,3)\n", "tests/README.md")
        self.assert_blocked("test-asserts-nothing")

    def test_decoy_tokens_in_comments_imports_and_unrelated_literals_do_not_bind(self):
        for prefix in ["// user.list /admin/users\n", "import x from '/admin/users';\n", "const decoy='user.list /admin/users';\n"]:
            with self.subTest(prefix=prefix):
                self.set_test(prefix+"test('unrelated',()=>{ expect(count()).toBe(3); });")
                self.assert_blocked("evidence-token-match")

    def test_real_negative_security_assertions_may_name_prohibited_data(self):
        self.set_test("test('user.list',()=>{ assert.doesNotMatch(listUsers(), /mock|sample/); });")
        self.assert_pass()

    def test_positive_fixture_fallback_identifier_in_tests_is_still_rejected(self):
        self.set_test("test('user.list',()=>{const rows=mockUsers; expect(rows.length).toBe(3);});")
        self.assert_blocked("placeholder-scan")

    def review(self, assertion):
        target=self.root/'.admin-console/evidence/security-review.json';target.parent.mkdir(parents=True,exist_ok=True)
        source=self.root/'src/users.js';source.parent.mkdir(exist_ok=True);source.write_text('export const query=users.list;\n',encoding='utf-8')
        body={"classification":"Independent SOURCE REVIEW","reviewer":"security-other","files":[{"path":"src/users.js","sha256_utf8_crlf_to_lf":hashlib.sha256(source.read_bytes().decode('utf-8').replace('\r\n','\n').encode('utf-8')).hexdigest()}],"source_assertions":[assertion]}
        target.write_text(json.dumps(body),encoding='utf-8')
        data=self.read();data['entities'][0]['capabilities'][0]['evidence']=['.admin-console/evidence/security-review.json'];self.write(data)
        return target,body

    def test_scoped_negative_review_clause_is_not_a_fixture(self):
        self.review("Unexpected sensitive row fields cause an explicit error, not widening or sample fallback. List/detail use the same parser.")
        self.assert_pass()

    def test_review_denial_does_not_launder_another_positive_mock_claim(self):
        self.review("No mock fallback. The UI instead returns mockUsers on empty results.")
        self.assert_blocked("placeholder-scan")

    def test_review_without_current_source_hash_is_not_eligible_for_context(self):
        target,body=self.review("No sample fallback.")
        body['files'][0]['sha256_utf8_crlf_to_lf']='0'*64;target.write_text(json.dumps(body),encoding='utf-8')
        self.assert_blocked("placeholder-scan")

    def test_review_prose_in_production_path_stays_strict(self):
        _,body=self.review("No sample fallback.")
        target=self.root/'src/review.json';target.write_text(json.dumps(body),encoding='utf-8')
        data=self.read();data['entities'][0]['capabilities'][0]['evidence']=['src/review.json'];self.write(data)
        self.assert_blocked("placeholder-scan")

    def test_oversized_evidence_cannot_hide_reserved_text_after_read_limit(self):
        target=self.root/'evidence/tests.log';target.write_bytes(b'good output\n'+b' '*upstream.acm.EVIDENCE_READ_LIMIT+b'mock rows')
        self.assert_blocked("evidence-file-oversized")

    def test_invalid_utf8_evidence_is_not_accepted_with_replacement_decoding(self):
        (self.root/'evidence/tests.log').write_bytes(b'good output\n\xff')
        self.assert_blocked("evidence-file-invalid")

    def test_path_traversal_is_not_eligible_for_test_context(self):
        outside=self.tmp/'outside.test.mjs';outside.write_text("test('user.list',()=>assert.equal(1,1));",encoding='utf-8')
        data=self.read();data['entities'][0]['capabilities'][0]['tests']=['../outside.test.mjs'];self.write(data)
        self.assert_blocked("evidence-path-missing")

    def test_implemented_queue_requires_relevant_linked_capability_test(self):
        self.set_test("test('unrelated',()=>{expect(count()).toBe(3);});")
        data=self.read();data['workQueues']=[{'id':'users-waiting','purpose':'Find waiting users','roles':['ops'],'source':'pg:users','priorityRule':'age','sla':'one day','actions':['user.list'],'status':'implemented','rationale':'','tests':['tests/user.spec.ts']}];self.write(data)
        out=self.assert_blocked('evidence-token-match')
        self.assertIn('workQueues[users-waiting].tests',out)

    def test_real_dotted_operation_call_is_relevant_without_test_title_decoy(self):
        self.set_test("test('current rows',()=>{expect(UserRepository.findForAdmin().length).toBe(3);});")
        data=self.read();data['screens'][0]['tests']=[];data['screens'][0]['status']='in-progress';self.write(data)
        code,out,err=self.validate()
        self.assertNotIn('[evidence-token-match]',out,out+err)

    def test_uuid_template_interpolation_is_isolated_fixture_data(self):
        self.set_test("import {randomUUID} from 'node:crypto'; test('user.list /admin/users',()=>{const sql=`select '${randomUUID()}'`;assert.equal(query(sql).length,1);});")
        self.assert_pass()

    def test_review_denial_with_prose_semicolon_keeps_its_context(self):
        self.review("Client allows eleven keys; unexpected sensitive fields cause an explicit error, not widening or sample fallback. Other fields are discarded.")
        self.assert_pass()

    def test_bare_runtime_directory_root_file_and_absolute_bindings_remain_strict(self):
        body="test('user.list /admin/users',()=>{const id=crypto.randomUUID();assert.equal(listUsers(id).length,1);});"
        for binding in ['tests','tests#fixture-path','./tests',str(self.root/'tests'),'tests/user.spec.ts#L1']:
            with self.subTest(binding=binding):
                self.set_test(body)
                data=self.read();data['entities'][0]['capabilities'][0]['dataBinding']=binding;self.write(data)
                self.assert_blocked('placeholder-scan')
        self.set_test(body,'users.test.mjs')
        for binding in ['users.test.mjs',str(self.root/'users.test.mjs')]:
            with self.subTest(binding=binding):
                data=self.read();data['entities'][0]['capabilities'][0]['dataBinding']=binding;self.write(data)
                self.assert_blocked('placeholder-scan')

    def test_unknown_report_type_does_not_infer_negative_context(self):
        target=self.root/'evidence/notes.txt';target.write_text('No sample fallback.\n',encoding='utf-8')
        data=self.read();data['entities'][0]['capabilities'][0]['evidence']=['evidence/notes.txt'];self.write(data)
        self.assert_blocked('placeholder-scan')


if __name__ == '__main__':
    unittest.main()
