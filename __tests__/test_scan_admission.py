"""Offline admission tests; never call GitHub or SonarQube."""
import importlib.util
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("scan", Path(__file__).parents[1] / "scripts/sonar_scan.py")
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)


class AdmissionTests(unittest.TestCase):
    def check(self, responses, message):
        with patch.object(scan, "git", side_effect=responses), self.assertRaisesRegex(RuntimeError, message):
            scan.admit()

    def test_wrong_repository(self):
        self.check(["https://github.com/example/other.git"], "Wrong repository")

    def test_feature_branch(self):
        self.check([next(iter(scan.ORIGINS)), "codex/feature"], "published main")

    def test_dirty_main(self):
        self.check([next(iter(scan.ORIGINS)), "main", "?? private.txt"], "local changes")

    def test_unpublished_main(self):
        self.check([next(iter(scan.ORIGINS)), "main", "", "aaa", "bbb refs/heads/main"], "differs")

    def test_admits_exact_clean_main(self):
        with patch.object(scan, "git", side_effect=[next(iter(scan.ORIGINS)), "main", "", "aaa", "aaa refs/heads/main"]):
            self.assertEqual(scan.admit(), "aaa")


class CredentialIsolationTests(unittest.TestCase):
    def test_dependency_and_quality_children_have_no_sonar_credentials(self):
        with patch.dict(os.environ, {"SONAR_TOKEN": "synthetic-token", "SONAR_SCANNER_JSON_PARAMS": "synthetic-params", "PATH": "/synthetic/bin"}), patch.object(scan.subprocess, "run") as run:
            scan.validate_snapshot(Path("/synthetic/snapshot"))
        self.assertEqual(run.call_count, 4)
        for child in run.call_args_list:
            environment = child.kwargs["env"]
            self.assertFalse(any(key.startswith("SONAR") for key in environment))
            self.assertTrue(environment["PATH"].endswith("/synthetic/bin"))


class CredentialTests(unittest.TestCase):
    TOKEN = "sqp_" + "a" * 40  # Synthetic, never sent to a server.

    def test_environment_token_does_not_read_keychain(self):
        with patch.dict(os.environ, {"SONAR_TOKEN": self.TOKEN}), patch.object(scan.subprocess, "run") as run:
            self.assertEqual(scan.token(), self.TOKEN)
        run.assert_not_called()

    def test_repeated_keychain_token_is_decoded_without_changing_keychain(self):
        encoded = (self.TOKEN + "\n") * 3
        result = subprocess.CompletedProcess([], 0, stdout=encoded.encode().hex())
        with patch.dict(os.environ, {"SONAR_TOKEN": ""}), patch.object(scan.subprocess, "run", return_value=result) as run:
            self.assertEqual(scan.token(), self.TOKEN)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][1], "find-generic-password")

    def test_missing_credential_fails_without_leaking_keychain_errors(self):
        result = subprocess.CompletedProcess([], 44, stdout="", stderr="synthetic private detail")
        with patch.dict(os.environ, {"SONAR_TOKEN": ""}), patch.object(scan.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "Dedicated mobile"):
                scan.token()

    def test_ambiguous_wrong_scope_and_corrupt_credentials_are_rejected(self):
        cases = [self.TOKEN + "\n" + "sqp_" + "b" * 40, "squ_" + "a" * 40,
                 "sqa_" + "a" * 40, "token-name", "", "fff", "ff"]
        for value in cases:
            with self.subTest(case_length=len(value)):
                with self.assertRaises(RuntimeError):
                    scan.normalize_project_token(value, from_keychain=True)


class ScanLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.directory = self.stack.enter_context(tempfile.TemporaryDirectory())
        self.scanner = Path(self.directory).resolve() / "scanner"
        self.scanner.touch()
        self.stack.enter_context(patch.object(sys, "argv", ["sonar_scan.py", "--scanner", str(self.scanner)]))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        self.admit = self.stack.enter_context(patch.object(scan, "admit", return_value="synthetic-revision"))
        self.git = self.stack.enter_context(patch.object(scan, "git", return_value=""))
        self.validate = self.stack.enter_context(patch.object(scan, "validate_snapshot"))
        self.credential = self.stack.enter_context(patch.object(scan, "token", return_value=CredentialTests.TOKEN))
        self.run = self.stack.enter_context(patch.object(scan.subprocess, "run"))

    def test_exact_snapshot_validation_precedes_credential_and_upload(self):
        events = []
        self.validate.side_effect = lambda snapshot: events.append("validate")
        self.credential.side_effect = lambda: events.append("credential") or CredentialTests.TOKEN
        self.run.side_effect = lambda command, **kwargs: events.append("upload") if command[0] == str(self.scanner) else None
        scan.main()
        self.assertEqual(events, ["validate", "credential", "upload"])
        upload = self.run.call_args
        self.assertIn("-Dsonar.scm.revision=synthetic-revision", upload.args[0])
        self.assertIn("-Dsonar.qualitygate.wait=true", upload.args[0])
        self.assertNotIn(CredentialTests.TOKEN, " ".join(upload.args[0]))
        self.assertEqual(upload.kwargs["env"]["SONAR_TOKEN"], CredentialTests.TOKEN)
        self.assertFalse(upload.kwargs["cwd"].exists())  # Snapshot removed after upload.

    def test_changed_main_or_dirty_snapshot_prevents_credential_access(self):
        cases = [("?? changed.py", "synthetic-revision", "modified"), ("", "new-revision", "changed")]
        for dirty, revision, message in cases:
            with self.subTest(message=message):
                self.git.return_value = dirty
                self.admit.side_effect = ["synthetic-revision", revision]
                with self.assertRaisesRegex(RuntimeError, message):
                    scan.main()
        self.credential.assert_not_called()

    def test_validation_failure_prevents_credential_access(self):
        self.validate.side_effect = subprocess.CalledProcessError(1, ["npm", "run", "quality"])
        with self.assertRaises(subprocess.CalledProcessError):
            scan.main()
        self.credential.assert_not_called()

    def test_check_only_does_not_validate_or_upload(self):
        with patch.object(sys, "argv", ["sonar_scan.py", "--check-only"]):
            scan.main()
        self.validate.assert_not_called()
        self.credential.assert_not_called()
        self.run.assert_not_called()

    def test_missing_scanner_stops_before_validation(self):
        with patch.object(sys, "argv", ["sonar_scan.py"]), patch.object(scan.shutil, "which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Install the official scanner"):
                scan.main()
        self.validate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
