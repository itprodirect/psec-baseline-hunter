import { expect, test, type Page } from "@playwright/test";

const PACKET_HIGHWAY_PATH = "/packet-highway";
const UNKNOWN_DEVICE_MAC = "02:de:c0:01:00:07";
const UNKNOWN_DEVICE_IP = "192.168.50.77";

test("Packet Highway guided sample preserves privacy and trust cues", async ({ page }) => {
  await page.goto(PACKET_HIGHWAY_PATH);

  await expect(page.getByRole("heading", { name: "Traffic Visualizer" })).toBeVisible();

  await loadGuidedSample(page);

  await expect(page.getByRole("status").filter({ hasText: "Sample data" })).toContainText(
    "fully synthetic sample"
  );
  await expect(page.getByRole("heading", { name: /Unknown device/ })).toBeVisible();
  await expect(page.getByText("Not in your device list", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Unencrypted web traffic seen" })
      .filter({ hasText: "HTTP traffic can expose page activity" })
      .first()
  ).toBeVisible();

  await expect(page.getByText(UNKNOWN_DEVICE_MAC)).toHaveCount(0);
  await expect(page.getByText(UNKNOWN_DEVICE_IP)).toHaveCount(0);
  await expect(page.getByText("Grouped by site")).toBeVisible();

  await page.getByRole("button", { name: "Show technical details" }).click();
  await expect(page.getByRole("button", { name: "Hide technical details" })).toBeVisible();
  await expect(page.getByText(UNKNOWN_DEVICE_MAC)).toBeVisible();
  await expect(page.getByText(UNKNOWN_DEVICE_IP)).toBeVisible();
  await expect(page.getByText("Full query names from DNS/mDNS traffic.")).toBeVisible();

  await page.getByRole("button", { name: "Hide technical details" }).click();
  await expect(page.getByRole("button", { name: "Show technical details" })).toBeVisible();
  await expect(page.getByText(UNKNOWN_DEVICE_MAC)).toHaveCount(0);
  await expect(page.getByText(UNKNOWN_DEVICE_IP)).toHaveCount(0);
});

test("Packet Highway scene supports keyboard device selection", async ({ page }) => {
  await page.goto(PACKET_HIGHWAY_PATH);
  await loadGuidedSample(page);

  const tvNode = page.getByRole("button", { name: /Show details for Living Room TV/i });
  await tvNode.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: /Living Room TV/ })).toBeVisible();
  await expect(page.getByText("On your device list")).toBeVisible();
  await expect(page.getByText("Not in your device list", { exact: true })).toHaveCount(0);
});

test("Packet Highway saved-analysis JSON import shows provenance notice", async ({ page }) => {
  await page.goto(PACKET_HIGHWAY_PATH);

  await uploadSyntheticAnalysis(page, syntheticAnalysisFixture());

  await expect(page.getByRole("status").filter({ hasText: "Saved analysis JSON" })).toContainText(
    "not raw-capture evidence"
  );
  await expect(page.getByText("Synthetic saved analysis loaded.")).toBeVisible();
});

test("Packet Highway truncated synthetic analysis shows partial-analysis notice", async ({ page }) => {
  await page.goto(PACKET_HIGHWAY_PATH);

  await uploadSyntheticAnalysis(page, syntheticAnalysisFixture({ truncated: true }));

  await expect(page.getByRole("status").filter({ hasText: "Partial analysis" })).toContainText(
    "malformed or truncated tail"
  );
});

test("Packet Highway guided sample works at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PACKET_HIGHWAY_PATH);

  await expect(page.getByRole("heading", { name: "Traffic Visualizer" })).toBeVisible();

  await loadGuidedSample(page);

  await expect(page.getByRole("status").filter({ hasText: "Sample data" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Unknown device/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show technical details" })).toBeVisible();
});

test.describe("reduced motion", () => {
  test("Packet Highway replaces animation controls with the reduced-motion notice", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(PACKET_HIGHWAY_PATH);
    await loadGuidedSample(page);

    await expect(
      page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ).resolves.toBe(true);
    await expect(page.getByText(/Animation off \(reduced motion\)/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause traffic animation" })).toHaveCount(0);
  });
});

async function loadGuidedSample(page: Page) {
  await page.getByRole("button", { name: "Load guided sample" }).click();
  await expect(page.getByRole("group", { name: /Interactive Packet Highway map/i })).toBeVisible();
}

async function uploadSyntheticAnalysis(page: Page, capture: ReturnType<typeof syntheticAnalysisFixture>) {
  await page.getByLabel("Upload a packet capture file").setInputFiles({
    name: "synthetic-analysis.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(capture)),
  });
  await page.getByRole("button", { name: "Analyze traffic" }).click();
  await expect(page.getByRole("group", { name: /Interactive Packet Highway map/i })).toBeVisible();
}

function syntheticAnalysisFixture({ truncated = false } = {}) {
  const firstSeen = "2026-06-01T19:00:00.000Z";
  const lastSeen = "2026-06-01T19:00:01.000Z";

  return {
    version: 1,
    meta: {
      fileName: "synthetic-analysis.json",
      format: "fixture",
      packetCount: 2,
      byteCount: 256,
      startTime: firstSeen,
      endTime: lastSeen,
      durationMs: 1000,
      truncated,
      ignoredPackets: 0,
      generatedAt: "2026-06-01T19:00:02.000Z",
    },
    devices: [
      {
        id: "gateway",
        mac: "02:00:00:00:00:01",
        ips: ["192.168.50.1"],
        name: "Synthetic Gateway",
        vendor: "Example Networks",
        role: "gateway",
        isKnown: true,
        packetsSent: 1,
        packetsReceived: 1,
        bytesSent: 128,
        bytesReceived: 128,
        firstSeen,
        lastSeen,
        categories: ["http"],
        externalPeerCount: 1,
        dnsQueryCount: 0,
        notes: null,
      },
      {
        id: "dev-1",
        mac: "02:00:00:00:00:02",
        ips: ["192.168.50.77"],
        name: "Synthetic Unknown Device",
        vendor: null,
        role: "device",
        isKnown: false,
        packetsSent: 1,
        packetsReceived: 1,
        bytesSent: 128,
        bytesReceived: 128,
        firstSeen,
        lastSeen,
        categories: ["http"],
        externalPeerCount: 1,
        dnsQueryCount: 1,
        notes: null,
      },
    ],
    externalEndpoints: [
      {
        id: "ext-1",
        ip: "203.0.113.99",
        isAggregate: false,
        packets: 2,
        bytes: 256,
        categories: ["http"],
      },
    ],
    flows: [
      {
        id: "flow-http",
        fromId: "dev-1",
        toId: "ext-1",
        protocol: "tcp",
        port: 80,
        category: "http",
        packets: 2,
        bytes: 256,
        bytesFromInitiator: 128,
        firstSeen,
        lastSeen,
        scope: "external",
      },
    ],
    animationEvents: [
      {
        t: 0.5,
        flowId: "flow-http",
        fromId: "dev-1",
        toId: "ext-1",
        category: "http",
        size: 1,
      },
    ],
    dnsQueries: [
      {
        name: "portal.example.net",
        count: 1,
        kind: "dns",
      },
    ],
    summary: {
      headline: "Synthetic saved analysis loaded.",
      lines: ["Synthetic browser smoke fixture only."],
      stats: {
        deviceCount: 1,
        knownDeviceCount: 0,
        externalEndpointCount: 1,
        flowCount: 1,
        dnsQueryCount: 1,
        uniqueDnsNames: 1,
        categoryBytes: {
          http: 256,
        },
      },
    },
    alerts: [
      {
        id: "alert-http",
        ruleId: "unencrypted-http",
        level: "review",
        title: "Unencrypted web traffic seen",
        detail: "Synthetic fixture used old-style unencrypted web connections.",
        deviceIds: ["dev-1"],
        flowIds: ["flow-http"],
      },
    ],
  };
}
