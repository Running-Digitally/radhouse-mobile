#!/usr/bin/env python3
"""Attended, exact published-main analysis. No credentials in argv or output."""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ORIGINS = {"https://github.com/Running-Digitally/radhouse-mobile.git", "git@github.com:Running-Digitally/radhouse-mobile.git"}
SERVER = "https://sonarqube.satishsurath.com"
ROOT = Path(__file__).resolve().parents[1]


def git(*args, cwd=ROOT):
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


def admit():
    if git("remote", "get-url", "origin") not in ORIGINS:
        raise RuntimeError("Wrong repository origin")
    if git("branch", "--show-current") != "main":
        raise RuntimeError("Scan refused: clean published main is required")
    if git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("Scan refused: checkout contains local changes")
    revision = git("rev-parse", "HEAD")
    remote = git("ls-remote", "--exit-code", "origin", "refs/heads/main").split()
    if not remote or revision != remote[0]:
        raise RuntimeError("Scan refused: HEAD differs from live GitHub main")
    return revision


def normalize_project_token(value, *, from_keychain=False):
    # security(1) hex-encodes passwords containing line breaks. Decode only its
    # output, and accept repeated copies only when they are the very same token.
    if from_keychain and re.fullmatch(r"(?:0x)?[0-9a-fA-F]+", value):
        try:
            value = bytes.fromhex(value.removeprefix("0x")).decode("utf-8")
        except ValueError:
            raise RuntimeError("Invalid mobile project-analysis credential encoding") from None
    parts = value.split()
    if (not parts or len(set(parts)) != 1
            or not re.fullmatch(r"sqp_[A-Za-z0-9]{40}", parts[0])):
        raise RuntimeError("A single mobile project-analysis token is required")
    return parts[0]


def token():
    value = os.environ.get("SONAR_TOKEN", "")
    from_keychain = not value
    if not value:
        result = subprocess.run([
            "security", "find-generic-password", "-s", "homelab/sonarqube/radhouse-mobile",
            "-a", "radhouse-mobile-analysis", "-w"], capture_output=True, text=True, check=False)
        if result.returncode == 0:
            value = result.stdout.strip()
    if not value:
        raise RuntimeError("Dedicated mobile project-analysis credential is required")
    return normalize_project_token(value, from_keychain=from_keychain)


def validation_environment():
    return {key: value for key, value in os.environ.items() if not key.startswith("SONAR")}


def validate_snapshot(snapshot):
    environment = validation_environment()
    virtualenv = snapshot / ".quality" / "python"
    subprocess.run([sys.executable, "-m", "venv", str(virtualenv)],
                   cwd=snapshot, env=environment, check=True)
    environment["PATH"] = str(virtualenv / "bin") + os.pathsep + environment.get("PATH", "")
    subprocess.run([str(virtualenv / "bin" / "python3"), "-m", "pip", "install",
                    "--disable-pip-version-check", "-r", "requirements-quality.txt"],
                   cwd=snapshot, env=environment, check=True)
    subprocess.run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
                   cwd=snapshot, env=environment, check=True)
    subprocess.run(["npm", "run", "quality"], cwd=snapshot, env=environment, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--scanner", type=Path)
    args = parser.parse_args()
    revision = admit()
    if args.check_only:
        print(f"Admitted published main {revision}; no upload")
        return
    scanner = str(args.scanner.resolve()) if args.scanner else shutil.which("sonar-scanner")
    if not scanner or not Path(scanner).is_file():
        raise RuntimeError("Install the official scanner or supply --scanner /absolute/path")
    with tempfile.TemporaryDirectory(prefix="radhouse-mobile-sonar-") as temporary:
        snapshot = Path(temporary) / "source"
        subprocess.run(["git", "clone", "--quiet", "--no-hardlinks", str(ROOT), str(snapshot)], check=True)
        subprocess.run(["git", "checkout", "--quiet", "--detach", revision], cwd=snapshot, check=True)
        # Generate coverage in this committed snapshot. Never import a stale local report.
        validate_snapshot(snapshot)
        if git("status", "--porcelain", "--untracked-files=all", cwd=snapshot):
            raise RuntimeError("Validation modified the committed snapshot")
        if admit() != revision:
            raise RuntimeError("Published revision changed during validation")
        environment = validation_environment()
        environment["SONAR_TOKEN"] = token()
        subprocess.run([scanner, f"-Dsonar.host.url={SERVER}",
                        f"-Dsonar.scm.revision={revision}",
                        "-Dsonar.qualitygate.wait=true", "-Dsonar.qualitygate.timeout=300"],
                       cwd=snapshot, env=environment, check=True)
        print(f"Scanner and quality gate completed for {revision}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        # No scanner environment or token-bearing command is included here.
        raise SystemExit(str(error)) from None
