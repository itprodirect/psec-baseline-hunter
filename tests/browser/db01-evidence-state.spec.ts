import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";

const DIFF_PATH = "/diff";

test("Diff keeps the API evidence status in the UI and downloaded export", async ({ page }) => {
  await installRunsFixture(page);
  await page.route("**/api/diff", async (route) => {
    await fulfillJson(route, 200, {
      success: true,
      data: diffFixture("insufficient-evidence"),
    });
  });

  await page.goto(DIFF_PATH);
  await page.getByRole("button", { name: "Compare Runs" }).click();

  const evidenceStatus = page.getByRole("status", { name: "Evidence status: insufficient-evidence" });
  await expect(evidenceStatus).toHaveAttribute("data-evidence-status", "insufficient-evidence");
  await expect(evidenceStatus).toContainText("insufficient-evidence");
  await expect(page.getByText(/Device absence was not evaluated because the evidence/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Change Summary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Save comparison/i })).toHaveCount(0);

  await page.getByRole("tab", { name: "Export" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "All Changes" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const csv = await readFile(downloadPath!, "utf8");

  expect(csv).toContain("Evidence Status,insufficient-evidence");
  expect(csv).toContain("External Reachability,not-established");
  expect(csv).toContain("Device absence was not evaluated");
  expect(csv).not.toMatch(/Network baseline is stable|No hosts removed|No ports closed|network safe|critical exposure/i);
});

test("an incompatible retry clears the prior Diff and its export controls", async ({ page }) => {
  await installRunsFixture(page);
  let comparisonCalls = 0;
  await page.route("**/api/diff", async (route) => {
    comparisonCalls += 1;
    if (comparisonCalls === 1) {
      await fulfillJson(route, 200, {
        success: true,
        data: diffFixture("supported"),
      });
      return;
    }

    await fulfillJson(route, 422, {
      success: false,
      code: "comparison_incompatible_site",
      error: "The selected observations do not contain compatible site evidence.",
    });
  });

  await page.goto(DIFF_PATH);
  await page.getByRole("button", { name: "Compare Runs" }).click();
  await expect(page.getByRole("status", { name: "Evidence status: supported" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Export" })).toBeVisible();

  const baselineSelector = page
    .getByText("Baseline (older)", { exact: true })
    .locator("..");
  await baselineSelector.getByRole("button").first().click();
  await baselineSelector
    .getByRole("button")
    .filter({ hasText: "baseline-c" })
    .click();

  await expect(page.getByRole("status", { name: /Evidence status:/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Export" })).toHaveCount(0);

  await page.getByRole("button", { name: "Compare Runs" }).click();
  await expect(
    page.getByText("The selected observations do not contain compatible site evidence.")
  ).toBeVisible();
  await expect(page.getByRole("status", { name: /Evidence status:/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Export" })).toHaveCount(0);
});

test("Scorecard ignores an older response after the selected run changes", async ({ page }) => {
  await installRunsFixture(page);

  let currentRequested = false;
  let releaseCurrent = () => {};
  const heldCurrentResponse = new Promise<void>((resolve) => {
    releaseCurrent = () => resolve();
  });

  await page.route("**/api/scorecard/**", async (route) => {
    const runUid = decodeURIComponent(route.request().url().split("/").pop() || "");
    if (runUid === "current-a") {
      currentRequested = true;
      await heldCurrentResponse;
    }

    try {
      await fulfillJson(route, 200, {
        success: true,
        data: scorecardFixture(runUid),
      });
    } catch (error) {
      if (runUid !== "current-a") throw error;
    }
  });

  try {
    await page.goto("/scorecard");
    await expect.poll(() => currentRequested).toBe(true);

    await page.getByRole("button", { name: "site-a - current-a" }).click();
    await page.getByRole("button", { name: /baseline-b/ }).click();
    await expect(page.getByText("Summary for baseline-b.")).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Evidence status: supported" })
    ).toHaveAttribute("data-evidence-status", "supported");

    releaseCurrent();
    await page.waitForTimeout(100);
    await expect(page.getByText("Summary for baseline-b.")).toBeVisible();
    await expect(page.getByText("Summary for current-a.")).toHaveCount(0);
  } finally {
    releaseCurrent();
  }
});

async function installRunsFixture(page: Page) {
  await page.route("**/api/runs", async (route) => {
    await fulfillJson(route, 200, {
      success: true,
      runs: [
        runFixture("current-a", "current-a", "2026-08-10T10:00:00.000Z"),
        runFixture("baseline-b", "baseline-b", "2026-08-08T10:00:00.000Z"),
        runFixture("baseline-c", "baseline-c", "2026-08-06T10:00:00.000Z"),
      ],
      stats: { totalRuns: 3, networks: 1 },
    });
  });
}

function runFixture(runUid: string, folderName: string, timestamp: string) {
  return {
    runUid,
    network: "site-a",
    runFolder: `runs/${folderName}`,
    folderName,
    timestamp,
    runType: "active-scan-upload",
    keyFiles: {},
    contentHash: `${runUid}-hash`,
    stats: {
      keyFileCount: 5,
      hasPortsScan: true,
      hasHostsUp: true,
      hasDiscovery: true,
    },
    createdAt: timestamp,
    extractionId: `${runUid}-extraction`,
  };
}

function diffFixture(status: "supported" | "insufficient-evidence") {
  const supported = status === "supported";
  const completeCoverage = coverageFixture(true);
  const currentCoverage = coverageFixture(supported);

  return {
    baselineRunUid: "baseline-b",
    currentRunUid: "current-a",
    baselineTimestamp: "2026-08-08T10:01:00.000Z",
    currentTimestamp: "2026-08-10T10:01:00.000Z",
    network: "site-a",
    newHosts: [],
    removedHosts: [],
    identityUncertain: [],
    portsOpened: [],
    portsClosed: [],
    riskFindings: [],
    summary: supported
      ? "No supported point-in-time changes were identified in the compared observations."
      : "Comparison evidence is insufficient for device-absence, service-closure, or no-change conclusions.",
    evidence: {
      version: "psec.evidence.v1",
      status,
      reasonCodes: supported
        ? ["external-reachability-not-established"]
        : ["partial-coverage", "external-reachability-not-established"],
      coverage: {
        baseline: completeCoverage,
        current: currentCoverage,
      },
      identity: { status: "supported", uncertainCount: 0 },
      vantage: {
        kind: "unverified-scan-vantage",
        externalReachability: "not-established",
      },
      supports: {
        deviceAbsence: supported,
        portClosure: supported,
        stableBaseline: false,
        externalReachability: false,
        comparisonPersistence: supported,
        llmSummary: supported,
      },
      limitations: [
        ...(supported
          ? []
          : [
              "At least one observation has partial coverage; missing evidence cannot support device absence, port closure, or no-change conclusions.",
            ]),
        "The scan vantage records observations only; reachability beyond that vantage was not established.",
      ],
    },
  };
}

function scorecardFixture(runUid: string) {
  return {
    runUid,
    network: "site-a",
    timestamp: runUid === "current-a"
      ? "2026-08-10T10:01:00.000Z"
      : "2026-08-08T10:01:00.000Z",
    totalHosts: runUid === "current-a" ? 10 : 8,
    openPorts: 4,
    uniqueServices: 3,
    riskPorts: 0,
    topPorts: [],
    riskPortsDetail: [],
    summary: `Summary for ${runUid}.`,
    evidence: {
      version: "psec.evidence.v1",
      status: "supported",
      reasonCodes: ["external-reachability-not-established"],
      coverage: { current: coverageFixture(true) },
      identity: { status: "not-applicable", uncertainCount: 0 },
      vantage: {
        kind: "unverified-scan-vantage",
        externalReachability: "not-established",
      },
      supports: {
        deviceAbsence: false,
        portClosure: false,
        stableBaseline: false,
        externalReachability: false,
        comparisonPersistence: false,
        llmSummary: true,
      },
      limitations: [
        "The scan vantage records observations only; reachability beyond that vantage was not established.",
      ],
    },
  };
}

function coverageFixture(complete: boolean) {
  const expectedSources = [
    "ports",
    "discovery",
    "hosts_up",
    "arp_snapshot",
    "scan_metadata",
  ];
  return {
    status: complete ? "complete" : "partial",
    score: complete ? 1 : 0.4,
    partial: !complete,
    deviceCount: 1,
    scopeKnown: true,
    expectedSources,
    presentSources: complete ? expectedSources : ["ports"],
    missingSources: complete ? [] : expectedSources.slice(1),
  };
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
