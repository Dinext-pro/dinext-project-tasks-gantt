"""Run the real critical-path scenario on the disposable GitHub CI bench."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from contextlib import suppress
from pathlib import Path


def main() -> None:
	workspace = Path(os.environ["GITHUB_WORKSPACE"]).resolve()
	temporary = Path(os.environ["RUNNER_TEMP"]).resolve()
	bench = temporary / "dinext-test-bench"
	app = bench / "apps/dinext_project_tasks_gantt"
	output = temporary / "critical-path-acceptance"
	output.mkdir(exist_ok=True)
	report = output / "cypress.xml"
	expected_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=workspace, text=True).strip()
	app_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=app, text=True).strip()
	assert app_sha == expected_sha, "The bench must execute the exact PR revision"
	assert (bench / "sites/ci.test/site_config.json").is_file()
	settings = {
		**os.environ,
		"DEV_SERVER": "1",
		"CYPRESS_baseUrl": "http://127.0.0.1:8000",
		"CYPRESS_benchPath": str(bench),
		"CYPRESS_site": "ci.test",
	}
	with (output / "server.log").open("w") as server_log:
		server = subprocess.Popen(
			["bench", "--site", "ci.test", "serve", "--port", "8000", "--noreload"],
			cwd=bench,
			env=settings,
			stdout=server_log,
			stderr=subprocess.STDOUT,
			start_new_session=True,
		)
		try:
			for _ in range(120):
				assert server.poll() is None, "The development server exited"
				try:
					with urllib.request.urlopen(
						"http://127.0.0.1:8000/api/method/ping", timeout=2
					) as response:
						if response.status == 200:
							break
				except urllib.error.URLError:
					pass
				time.sleep(0.5)
			else:
				raise RuntimeError("The disposable development server did not become ready")
			command = [
				str(temporary / "cypress-tools/node_modules/.bin/cypress"),
				"run",
				"--project",
				str(app),
				"--browser",
				"electron",
				"--spec",
				"cypress/integration/critical_path.js",
				"--reporter",
				"junit",
				"--reporter-options",
				f"mochaFile={report},toConsole=true",
				"--config",
				f"screenshotsFolder={output / 'screenshots'},video=false",
			]
			with (output / "cypress.log").open("w") as cypress_log:
				result = subprocess.run(
					command, cwd=app, env=settings, stdout=cypress_log, stderr=subprocess.STDOUT, timeout=600
				)
			print((output / "cypress.log").read_text(), flush=True)
			result.check_returncode()
			cases = list(ET.parse(report).getroot().iter("testcase"))
			assert cases, "Cypress must execute at least one scenario"
			assert all(case.find(tag) is None for case in cases for tag in ("failure", "error", "skipped"))
			(output / "environment.json").write_text(
				json.dumps(
					{
						"tested_sha": expected_sha,
						"bench_app_sha": app_sha,
						"site": "ci.test",
						"tests": len(cases),
						"failures": 0,
						"skipped": 0,
						"synthetic_data_only": True,
					},
					indent=2,
				)
			)
		finally:
			with suppress(ProcessLookupError):
				os.killpg(server.pid, signal.SIGTERM)
			try:
				server.wait(timeout=10)
			except subprocess.TimeoutExpired:
				with suppress(ProcessLookupError):
					os.killpg(server.pid, signal.SIGKILL)
				server.wait()
			with (output / "cleanup.log").open("w") as cleanup_log:
				subprocess.run(
					[
						"bench",
						"--site",
						"ci.test",
						"execute",
						"dinext_project_tasks_gantt.tests.ui_test_helpers.cleanup_critical_path",
					],
					cwd=bench,
					env=settings,
					stdout=cleanup_log,
					stderr=subprocess.STDOUT,
					check=True,
					timeout=180,
				)
	print(f"Critical-path acceptance passed: {len(cases)} scenario(s) at {expected_sha}")


if __name__ == "__main__":
	main()
