import { execFileSync } from "node:child_process";
import {
  repositoryName,
  protectionPolicies,
  requiredCheck,
  assertAppliedPolicy,
} from "./policy.mjs";

// Uses the user's existing gh authentication. Never reads tokens or CI credentials.
function api(path, method = "GET", body) {
  const args = [
    "api",
    path,
    "--method",
    method,
    "-H",
    "Accept: application/vnd.github+json",
    "-H",
    "X-GitHub-Api-Version: 2022-11-28",
  ];
  if (body !== undefined) args.push("--input", "-");
  const result = execFileSync("gh", args, {
    encoding: "utf8",
    input: body === undefined ? undefined : JSON.stringify(body),
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result.trim() ? JSON.parse(result) : null;
}

try {
  const base = `repos/${repositoryName}`;
  const repo = api(base);
  if (
    repo.full_name !== repositoryName ||
    repo.private ||
    !repo.permissions?.admin
  )
    throw new Error(
      "Authenticated admin access to the expected public repository is required.",
    );
  for (const branch of ["main", "stage", "dev"])
    api(`${base}/branches/${branch}`);
  const checks = api(`${base}/commits/main/check-runs?per_page=100`).check_runs;
  const gate =
    checks.find(
      (check) =>
        check.name === requiredCheck && check.app?.slug === "github-actions",
    ) ?? checks.find((check) => check.app?.slug === "github-actions");
  if (!gate)
    throw new Error(
      "Wait for the initial CI run to register its GitHub Actions app, then retry.",
    );
  const policies = protectionPolicies(repo.owner.id, gate.app.id);
  if (!process.argv.includes("--apply")) {
    console.log(
      JSON.stringify(
        { repository: repositoryName, mode: "preview", policies },
        null,
        2,
      ),
    );
  } else {
    api(base, "PATCH", {
      default_branch: "main",
      allow_merge_commit: true,
      allow_squash_merge: true,
      allow_rebase_merge: false,
      delete_branch_on_merge: false,
      allow_auto_merge: false,
      has_issues: true,
      has_wiki: false,
      description:
        "Offline desktop privacy tool for text and screenshots. Local OCR, rules and optional on-device AI; reversible text aliases and permanent image redaction. MIT source. Windows preview; macOS/Linux in development.",
    });
    api(`${base}/topics`, "PUT", {
      names: [
        "privacy",
        "offline",
        "redaction",
        "pii",
        "tauri",
        "rust",
        "react",
        "open-source",
        "ocr",
      ],
    });
    const current = api(`${base}/rulesets?includes_parents=false&per_page=100`);
    const configured = [];
    for (const policy of policies) {
      const existing = current.find((item) => item.name === policy.name);
      const endpoint = existing
        ? `${base}/rulesets/${existing.id}`
        : `${base}/rulesets`;
      const saved = api(endpoint, existing ? "PUT" : "POST", policy);
      const verified = api(`${base}/rulesets/${saved.id}`);
      assertAppliedPolicy(verified, policy, policy.name);
      configured.push({
        id: verified.id,
        name: verified.name,
        enforcement: verified.enforcement,
      });
    }
    api(`${base}/private-vulnerability-reporting`, "PUT");
    if (!api(`${base}/private-vulnerability-reporting`).enabled)
      throw new Error("Private reporting verification failed.");
    api(`${base}/actions/permissions/workflow`, "PUT", {
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: false,
    });
    api(`${base}/actions/permissions/fork-pr-contributor-approval`, "PUT", {
      approval_policy: "all_external_contributors",
    });
    const workflow = api(`${base}/actions/permissions/workflow`);
    const forks = api(
      `${base}/actions/permissions/fork-pr-contributor-approval`,
    );
    if (
      workflow.default_workflow_permissions !== "read" ||
      workflow.can_approve_pull_request_reviews ||
      forks.approval_policy !== "all_external_contributors"
    )
      throw new Error("Actions permission verification failed.");
    api(base, "PATCH", {
      security_and_analysis: {
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "enabled" },
      },
    });
    const security = api(base).security_and_analysis;
    if (
      security?.secret_scanning?.status !== "enabled" ||
      security?.secret_scanning_push_protection?.status !== "enabled"
    )
      throw new Error("Secret protection verification failed.");
    api(`${base}/vulnerability-alerts`, "PUT");
    api(`${base}/automated-security-fixes`, "PUT");
    console.log(
      JSON.stringify(
        {
          repository: repositoryName,
          configured,
          privateVulnerabilityReporting: true,
          workflow,
          forks,
          secretPushProtection: true,
          requiredCheck,
          actionsId: gate.app.id,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  // Never echo HTTP bodies or authentication output.
  console.error(
    error.stderr
      ? "GitHub administration request failed; check owner permissions and repository settings."
      : error.message,
  );
  process.exitCode = 1;
}
