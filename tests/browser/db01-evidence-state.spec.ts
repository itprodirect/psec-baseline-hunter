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

test("Network Statement ignores a late response after site controls change", async ({ page }) => {
  await page.route("**/api/observations**", async (route) => {
    await fulfillJson(route, 200, {
      success: true,
      observations: [
        observationEntry("site-a", "Site A", "2026-08-10T10:00:00.000Z"),
        observationEntry("site-b", "Site B", "2026-08-09T10:00:00.000Z"),
      ],
    });
  });

  let siteARequested = false;
  let releaseSiteA = () => {};
  const heldSiteAResponse = new Promise<void>((resolve) => {
    releaseSiteA = resolve;
  });
  await page.route("**/api/statement**", async (route) => {
    const url = new URL(route.request().url());
    const siteId = url.searchParams.get("siteId") || "unknown";
    if (siteId === "site-a") {
      siteARequested = true;
      await heldSiteAResponse;
    }
    try {
      await fulfillJson(route, 200, statementFixture(siteId));
    } catch (error) {
      if (siteId !== "site-a") throw error;
    }
  });

  try {
    await page.goto("/statement");
    await expect.poll(() => siteARequested).toBe(true);
    await page.getByRole("combobox", { name: "Site" }).click();
    await page.getByRole("option", { name: /Site B/ }).click();
    await expect(page.getByText("Report for site-b.").first()).toBeVisible();

    releaseSiteA();
    await page.waitForTimeout(100);
    await expect(page.getByText("Report for site-b.").first()).toBeVisible();
    await expect(page.getByText("Report for site-a.")).toHaveCount(0);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Markdown" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const markdown = await readFile(downloadPath!, "utf8");
    expect(markdown).toContain("Report for site-b.");
    expect(markdown).not.toContain("Report for site-a.");
  } finally {
    releaseSiteA();
  }
});

test("saved Diff ignores a late response after client-side comparison navigation", async ({ page }) => {
  await installRunsFixture(page);
  let oldRequested = false;
  let releaseOld = () => {};
  const heldOldResponse = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  await page.route("**/api/comparisons**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/comparisons") {
      await fulfillJson(route, 200, {
        success: true,
        comparisons: [savedComparisonFixture("OLD"), savedComparisonFixture("NEW")],
      });
      return;
    }

    const comparisonId = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (comparisonId === "OLD") {
      oldRequested = true;
      await heldOldResponse;
    }
    try {
      await fulfillJson(route, 200, {
        success: true,
        comparison: savedComparisonFixture(comparisonId),
      });
    } catch (error) {
      if (comparisonId !== "OLD") throw error;
    }
  });

  try {
    await page.goto("/diff");
    await page.getByRole("button", { name: "History" }).click();
    await page.getByRole("link", { name: /Saved OLD/ }).click();
    await expect.poll(() => oldRequested).toBe(true);

    await page.goBack();
    await page.getByRole("button", { name: "History" }).click();
    await page.getByRole("link", { name: /Saved NEW/ }).click();
    await expect(page.getByRole("heading", { name: "Saved NEW" })).toBeVisible();

    releaseOld();
    await page.waitForTimeout(100);
    await expect(page).toHaveURL(/\/diff\/NEW$/);
    await expect(page.getByRole("heading", { name: "Saved NEW" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved OLD" })).toHaveCount(0);
  } finally {
    releaseOld();
  }
});

test("Activity renders insufficient evidence without a green no-change state", async ({ page }) => {
  await page.route("**/api/activity", async (route) => {
    await fulfillJson(route, 200, {
      success: true,
      activity: {
        status: "insufficient-evidence",
        source: "registry",
        generatedAt: "2026-08-11T12:00:00.000Z",
        title: "Network Activity",
        summary: "Evidence is insufficient for device absence, closure, or no-change conclusions.",
        site: { networkName: "site-a", networkScope: "192.0.2.0/24" },
        latestObservation: null,
        period: null,
        coverage: null,
        evidence: createEvidenceFixture("insufficient-evidence"),
        limitations: [{ code: "partial-coverage", severity: "warning", message: "Current evidence is partial." }],
        reviewCount: 0,
        events: [],
        availableObservationCount: 2,
        scenario: null,
        supplementalEvidence: [],
      },
    });
  });

  await page.goto("/activity");
  await expect(page.getByText(/Evidence is insufficient for device absence/).first()).toBeVisible();
  await expect(page.getByText("No meaningful changes found")).toHaveCount(0);
});

test("Activity ignores a late device-response mutation after switching to the guided scenario", async ({ page }) => {
  let latestRequestCount = 0;
  let mutationRequested = false;
  let mutationCompleted = false;
  let releaseMutation = () => {};
  const heldMutationResponse = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });

  await page.route("**/api/activity**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith("/device-response")) {
      mutationRequested = true;
      await heldMutationResponse;
      try {
        await fulfillJson(route, 200, {
          success: true,
          responseId: "response-race-device",
        });
        mutationCompleted = true;
      } catch {
        // A superseded request may be aborted by the browser; the UI assertion below
        // remains authoritative for whether stale latest state was restored.
        mutationCompleted = true;
      }
      return;
    }

    if (url.searchParams.get("scenario") === "guided") {
      await fulfillJson(route, 200, {
        success: true,
        activity: guidedActivityRaceFixture(),
      });
      return;
    }

    latestRequestCount += 1;
    await fulfillJson(route, 200, {
      success: true,
      activity: latestActivityRaceFixture(),
    });
  });

  try {
    await page.goto("/activity");
    await expect(page.getByText("Latest registry comparison.")).toBeVisible();
    await page.getByRole("button", { name: "Mine", exact: true }).click();
    await expect.poll(() => mutationRequested).toBe(true);

    await page.getByRole("button", { name: "Guided scenario" }).click();
    await expect(page.getByText("Guided scenario remains authoritative.")).toBeVisible();
    await expect(page.getByText("Guided activity race fixture")).toBeVisible();
    await expect(page.getByText("Synthetic scenario")).toBeVisible();

    releaseMutation();
    await expect.poll(() => mutationCompleted).toBe(true);
    await page.waitForTimeout(100);

    await expect(page.getByText("Guided scenario remains authoritative.")).toBeVisible();
    await expect(page.getByText("Latest registry comparison.")).toHaveCount(0);
    await expect(page.getByText("Late latest device finding")).toHaveCount(0);
    expect(latestRequestCount).toBe(1);
  } finally {
    releaseMutation();
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

function observationEntry(siteId: string, networkName: string, endedAt: string) {
  return {
    registryId: `registry-${siteId}`,
    observationId: `observation-${siteId}`,
    networkName,
    site: { siteId, networkName, networkScope: "192.0.2.0/24" },
    timeRange: { startedAt: endedAt, endedAt, generatedAt: endedAt },
    vantage: {
      type: "active-scan-upload",
      runType: "baselinekit_v0",
      networkName,
      collectorHost: "synthetic-collector",
      target: "192.0.2.0/24",
      notes: [],
    },
    sources: [],
    freshness: { status: "fresh", reason: "Synthetic current evidence." },
  };
}

function statementFixture(siteId: string) {
  const label = `Report for ${siteId}.`;
  const statement = {
    schemaVersion: "psec.network-statement.v1",
    status: "ready",
    title: "Network Statement",
    generatedAt: "2026-08-11T12:00:00.000Z",
    site: { siteId, networkName: siteId, networkScopeRecorded: true },
    selectedPeriod: {
      from: "2026-08-04T00:00:00.000Z",
      to: "2026-08-11T23:59:59.999Z",
      label: "Synthetic period",
      requestedWeeklyRange: false,
      weeklyTitleSupported: false,
      titleReason: "Synthetic regression.",
    },
    evidence: createEvidenceFixture("supported"),
    coverageSummary: {
      primaryObservationCount: 2,
      comparisonCount: 1,
      supplementalPacketHighwayCount: 0,
      hasPartialCoverage: false,
      hasStaleEvidence: false,
      hasInsufficientWeekCoverage: false,
      hasInsufficientComparisonEvidence: false,
    },
    privacy: {
      technicalIdentifiersMinimized: true,
      rawPayloadsExcluded: true,
      absolutePathsExcluded: true,
      secretsExcluded: true,
    },
    sections: [
      {
        id: "selected-period",
        title: "Selected period",
        summary: label,
        secondary: false,
        items: [{ id: "report", severity: "info", text: label, evidenceRefs: [] }],
      },
    ],
  };
  return { success: true, statement, markdown: `# Network Statement\n\n${label}\n` };
}

function savedComparisonFixture(comparisonId: string) {
  const data = diffFixture("supported");
  data.summary = `Comparison ${comparisonId}.`;
  return {
    comparisonId,
    baselineRunUid: "baseline-b",
    currentRunUid: "current-a",
    network: "site-a",
    createdAt: "2026-08-11T12:00:00.000Z",
    title: `Saved ${comparisonId}`,
    diffData: data,
  };
}

function latestActivityRaceFixture() {
  return {
    status: "ready",
    source: "registry",
    generatedAt: "2026-08-11T12:00:00.000Z",
    title: "Network Activity",
    summary: "Latest registry comparison.",
    site: { networkName: "site-a", networkScope: "192.0.2.0/24" },
    latestObservation: {
      observationId: "observation-current",
      checkedAt: "2026-08-11T11:00:00.000Z",
      freshnessStatus: "fresh",
      freshnessReason: "Synthetic browser evidence is current.",
      deviceCount: 1,
    },
    period: {
      label: "Synthetic comparison",
      baselineObservedAt: "2026-08-10T10:00:00.000Z",
      currentObservedAt: "2026-08-11T11:00:00.000Z",
      baselineObservationId: "observation-baseline",
      currentObservationId: "observation-current",
      baselineRunUid: "run-baseline",
      currentRunUid: "run-current",
    },
    coverage: activityCoverageFixture(),
    evidence: createEvidenceFixture("supported"),
    limitations: [],
    reviewCount: 1,
    events: [
      {
        eventId: "event-race-device",
        type: "new-device-observed",
        title: "Late latest device finding",
        summary: "A synthetic device was observed in the latest comparison.",
        reviewReason: "Confirm whether this device is expected.",
        confidence: "strongest",
        confidenceLabel: "Persisted device identity",
        workflowPriority: {
          level: "normal",
          label: "Review",
          reason: "No user response recorded.",
          responseState: null,
        },
        deviceResponse: {
          target: {
            responseId: "response-race-device",
            siteId: "site-a",
            observationId: "observation-current",
            deviceIdHash: "device-hash",
            identity: {
              kind: "persisted-device-id",
              hash: "device-hash",
              label: "Persisted device identifier",
            },
            confidence: "strongest",
            reason: "Synthetic stable identity evidence.",
          },
          statement: null,
          carriedForward: null,
          unavailableReason: null,
        },
        periodHref: "#comparison-period",
        evidenceId: "evidence-race-device",
        evidenceSummary: "Synthetic stable identity evidence.",
        technicalEvidence: {
          ruleId: "device.new",
          ruleVersion: "psec.observation-comparison.v1",
          baselineObservationId: "observation-baseline",
          currentObservationId: "observation-current",
          identityRuleId: "persisted-device-id",
          identityEvidenceIds: { baseline: [], current: ["device-hash"] },
          identityValues: ["device-hash"],
          baselineDevice: null,
          currentDevice: {
            deviceId: "device-race",
            ips: ["192.0.2.20"],
            macs: [],
            hostnames: ["synthetic-device"],
            vendors: [],
          },
          port: null,
          changedFields: ["device"],
          notes: ["Synthetic browser fixture."],
        },
        supplementalEvidence: [],
      },
    ],
    availableObservationCount: 2,
    scenario: null,
    supplementalEvidence: [],
  };
}

function guidedActivityRaceFixture() {
  return {
    status: "ready",
    source: "synthetic-guided-scenario",
    generatedAt: "2026-08-11T12:00:00.000Z",
    title: "Network Activity",
    summary: "Guided scenario remains authoritative.",
    site: { networkName: "guided-site", networkScope: "192.0.2.0/24" },
    latestObservation: {
      observationId: "guided-current",
      checkedAt: "2026-08-11T11:30:00.000Z",
      freshnessStatus: "fresh",
      freshnessReason: "Synthetic guided evidence.",
      deviceCount: 1,
    },
    period: null,
    coverage: activityCoverageFixture(),
    evidence: createEvidenceFixture("supported"),
    limitations: [],
    reviewCount: 0,
    events: [],
    availableObservationCount: 2,
    scenario: {
      title: "Guided activity race fixture",
      steps: ["Keep this guided state after the late mutation response arrives."],
    },
    supplementalEvidence: [],
  };
}

function activityCoverageFixture() {
  return {
    status: "complete",
    score: 1,
    freshnessStatus: "fresh",
    sources: {
      present: ["ports", "discovery"],
      missing: [],
      expected: ["ports", "discovery"],
    },
    vantage: {
      label: "Synthetic active scan",
      runType: "active-scan-upload",
      networkName: "site-a",
    },
    technicalVantage: {
      collectorHost: "synthetic-collector",
      target: "192.0.2.0/24",
      notes: [],
    },
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

function createEvidenceFixture(status: "supported" | "insufficient-evidence") {
  const supported = status === "supported";
  const coverage = coverageFixture(supported);
  return {
    version: "psec.evidence.v1",
    status,
    reasonCodes: supported
      ? ["external-reachability-not-established"]
      : ["partial-coverage", "external-reachability-not-established"],
    coverage: { baseline: coverage, current: coverage },
    identity: { status: supported ? "supported" : "uncertain", uncertainCount: supported ? 0 : 1 },
    vantage: { kind: "unverified-scan-vantage", externalReachability: "not-established" },
    supports: {
      deviceAbsence: supported,
      portClosure: supported,
      stableBaseline: false,
      externalReachability: false,
      comparisonPersistence: supported,
      llmSummary: supported,
    },
    limitations: ["External reachability is not established."],
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
    normalizationStatus: complete ? "complete" : "truncated",
    normalizationReasonCodes: complete ? [] : ["open-port-limit-exceeded"],
    coverageReasonCodes: [],
    targetProvenanceStatus: "verified",
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
