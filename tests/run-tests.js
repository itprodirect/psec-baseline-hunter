const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");

const {
  resolvePathWithin,
  sanitizeNetworkName,
} = require("../src/lib/services/path-safety.ts");
const {
  extractZipSafely,
} = require("../src/lib/services/archive-safety.ts");
const { buildTopActions } = require("../src/lib/services/diff-actions.ts");
const {
  assertInventoryCSVFileSize,
  assertInventoryCSVRequestContentLength,
  assertInventoryCSVRowLimit,
  InventoryCSVLimitError,
  isInventoryCSVLimitError,
} = require("../src/lib/services/inventory-csv-safety.ts");
const {
  getSafeErrorMessage,
  sanitizeRunManifestForClient,
  toClientDataPath,
} = require("../src/lib/services/api-response-safety.ts");
const {
  consumeLLMRateLimit,
  getLLMRateLimitIdentity,
  LLM_RATE_LIMIT_ERROR_RESPONSE,
  LLM_RATE_LIMIT_MAX_REQUESTS,
  LLM_RATE_LIMIT_WINDOW_MS,
  resetLLMRateLimitForTesting,
  SHARED_LLM_RATE_LIMIT_IDENTITY,
} = require("../src/lib/services/llm-rate-limit.ts");
const { callLLM } = require("../src/lib/llm/provider.ts");

let total = 0;
let failed = 0;
let testQueue = Promise.resolve();

function run(name, fn) {
  total += 1;
  testQueue = testQueue.then(async () => {
    try {
      await fn();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(error instanceof Error ? error.stack : error);
    }
  });
}

async function finish() {
  await testQueue;

  if (failed > 0) {
    console.error(`\n${failed}/${total} tests failed`);
    process.exit(1);
  }

  console.log(`\n${total} tests passed`);
}

function createDiffData(riskyExposures) {
  return {
    baselineRunUid: "baseline",
    currentRunUid: "current",
    baselineTimestamp: "2026-02-01T10:00:00.000Z",
    currentTimestamp: "2026-02-08T10:00:00.000Z",
    network: "home-lab",
    newHosts: [],
    removedHosts: [],
    portsOpened: [],
    portsClosed: [],
    riskyExposures,
    summary: "summary",
  };
}

function createScorecardData() {
  return {
    runUid: "run-1",
    network: "home-lab",
    timestamp: "2026-02-08T10:00:00.000Z",
    totalHosts: 1,
    openPorts: 1,
    uniqueServices: 1,
    riskPorts: 0,
    topPorts: [],
    riskPortsDetail: [],
    summary: "No critical exposures detected.",
  };
}

const testUserProfile = {
  technicalLevel: "non-technical",
  profession: "small-business-owner",
  contextFactors: [],
  tone: "direct",
  includeNetworkDetails: false,
};

async function getLLMRouteCases() {
  const [
    scorecardSummaryRoute,
    diffSummaryRoute,
    portImpactRoute,
    executiveSummaryRoute,
  ] = await Promise.all([
    import("../src/app/api/llm/scorecard-summary/route.ts"),
    import("../src/app/api/llm/diff-summary/route.ts"),
    import("../src/app/api/llm/port-impact/route.ts"),
    import("../src/app/api/llm/executive-summary/route.ts"),
  ]);

  return [
    {
      name: "scorecard summary",
      path: "/api/llm/scorecard-summary",
      post: scorecardSummaryRoute.POST,
      body: () => ({ scorecardData: createScorecardData() }),
    },
    {
      name: "diff summary",
      path: "/api/llm/diff-summary",
      post: diffSummaryRoute.POST,
      body: () => ({ diffData: createDiffData([]) }),
    },
    {
      name: "port impact",
      path: "/api/llm/port-impact",
      post: portImpactRoute.POST,
      body: () => ({
        port: 3389,
        protocol: "tcp",
        service: "ms-wbt-server",
        userProfile: testUserProfile,
      }),
    },
    {
      name: "executive summary",
      path: "/api/llm/executive-summary",
      post: executiveSummaryRoute.POST,
      body: () => ({
        scorecardData: createScorecardData(),
        userProfile: testUserProfile,
      }),
    },
  ];
}

function createJsonPostRequest(pathname, body, identity) {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": identity,
    },
    body: JSON.stringify(body),
  });
}

function createJsonRequest(pathname, method, body) {
  return new Request(`http://localhost${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createRawJsonRequest(pathname, method, body) {
  return new Request(`http://localhost${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
    },
    body,
  });
}

async function assertJsonError(response, status, errorPattern, context) {
  const message = (assertion) =>
    context ? `${context}: ${assertion}` : undefined;
  const body = await response.json();

  assert.equal(response.status, status, message(`expected status ${status}`));
  assert.equal(body.success, false, message("expected success=false"));
  assert.match(body.error, errorPattern, message("expected matching error"));
}

async function withoutLLMKeys(fn) {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;

  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    return await fn();
  } finally {
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }

    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  }
}

async function withMutedConsoleLog(fn) {
  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    return await fn();
  } finally {
    console.log = originalConsoleLog;
  }
}

function withTempDir(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "psec-archive-test-"));
  try {
    fn(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function withTempCwd(fn) {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "psec-route-test-"));

  try {
    process.chdir(tempDir);
    await fn(tempDir);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeZip(zipPath, entries) {
  const zip = new AdmZip();
  for (const entry of entries) {
    const zipEntry = zip.addFile(entry.name, Buffer.from(entry.content ?? ""));
    if (entry.unsafeName) {
      zipEntry.entryName = entry.unsafeName;
    }
  }
  zip.writeZip(zipPath);
}

function createNmapXml(ports) {
  return [
    "<nmaprun>",
    "<host>",
    "<status state=\"up\" />",
    "<address addr=\"10.0.0.1\" addrtype=\"ipv4\" />",
    "<ports>",
    ...ports.map(
      (port) =>
        `<port protocol="${port.protocol}" portid="${port.port}"><state state="open" /><service name="${port.service}" /></port>`
    ),
    "</ports>",
    "</host>",
    "</nmaprun>",
  ].join("");
}

function writeRunRegistryFixtures() {
  const dataDir = path.join(process.cwd(), "data");
  const scansDir = path.join(dataDir, "test-scans");
  const runsDir = path.join(dataDir, "runs");
  const baselineRunUid = "baseline-run";
  const currentRunUid = "current-run";
  const baselineXmlPath = path.join(scansDir, "baseline.xml");
  const currentXmlPath = path.join(scansDir, "current.xml");

  fs.mkdirSync(scansDir, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });
  fs.writeFileSync(
    baselineXmlPath,
    createNmapXml([{ port: 80, protocol: "tcp", service: "http" }])
  );
  fs.writeFileSync(
    currentXmlPath,
    createNmapXml([
      { port: 80, protocol: "tcp", service: "http" },
      { port: 3389, protocol: "tcp", service: "ms-wbt-server" },
    ])
  );

  fs.writeFileSync(
    path.join(runsDir, "index.json"),
    JSON.stringify(
      {
        version: 1,
        runs: {
          [baselineRunUid]: createRunManifest(
            baselineRunUid,
            "2026-02-01T10:00:00.000Z",
            baselineXmlPath
          ),
          [currentRunUid]: createRunManifest(
            currentRunUid,
            "2026-02-08T10:00:00.000Z",
            currentXmlPath
          ),
        },
        lastUpdated: "2026-02-08T10:00:00.000Z",
      },
      null,
      2
    )
  );

  return { baselineRunUid, currentRunUid };
}

function createRunManifest(runUid, timestamp, portsXmlPath) {
  return {
    runUid,
    network: "home-lab",
    runFolder: path.dirname(portsXmlPath),
    folderName: runUid,
    timestamp,
    runType: "baselinekit_v0",
    keyFiles: {
      ports: [portsXmlPath],
    },
    contentHash: `${runUid}-hash`,
    stats: {
      keyFileCount: 1,
      hasPortsScan: true,
      hasHostsUp: false,
      hasDiscovery: false,
    },
    createdAt: timestamp,
    extractionId: "test-extract",
  };
}

run("resolvePathWithin allows paths inside base directory", () => {
  const baseDir = path.resolve("data/uploads");
  const candidate = path.join(baseDir, "scan.zip");
  const resolved = resolvePathWithin(baseDir, candidate);
  assert.equal(resolved, path.resolve(candidate));
});

run("resolvePathWithin rejects traversal outside base directory", () => {
  const baseDir = path.resolve("data/uploads");
  const outside = path.join(baseDir, "..", "extracted", "scan.xml");
  const resolved = resolvePathWithin(baseDir, outside);
  assert.equal(resolved, null);
});

run("sanitizeNetworkName accepts simple network names", () => {
  assert.equal(sanitizeNetworkName("home-lab"), "home-lab");
  assert.equal(sanitizeNetworkName("  Office LAN  "), "Office LAN");
});

run("sanitizeNetworkName rejects unsafe names", () => {
  assert.equal(sanitizeNetworkName(""), null);
  assert.equal(sanitizeNetworkName("../secret"), null);
  assert.equal(sanitizeNetworkName("office/network"), null);
  assert.equal(sanitizeNetworkName("office\\network"), null);
});

run("extractZipSafely rejects traversal entries before extraction", () => {
  withTempDir((tempDir) => {
    const zipPath = path.join(tempDir, "traversal.zip");
    const extractDir = path.join(tempDir, "extract");
    const outsidePath = path.join(tempDir, "evil.txt");

    writeZip(zipPath, [
      { name: "safe.txt", unsafeName: "../evil.txt", content: "bad" },
    ]);

    assert.throws(
      () => extractZipSafely(zipPath, extractDir),
      /Unsafe ZIP entry rejected/
    );
    assert.equal(fs.existsSync(outsidePath), false);
    assert.equal(fs.existsSync(extractDir), false);
  });
});

run("extractZipSafely rejects absolute path entries before extraction", () => {
  withTempDir((tempDir) => {
    const unsafeNames = ["/evil.txt", "C:/evil.txt"];

    unsafeNames.forEach((unsafeName, index) => {
      const zipPath = path.join(tempDir, `absolute-${index}.zip`);
      const extractDir = path.join(tempDir, `extract-${index}`);

      writeZip(zipPath, [
        { name: "safe.txt", unsafeName, content: "bad" },
      ]);

      assert.throws(
        () => extractZipSafely(zipPath, extractDir),
        /Unsafe ZIP entry rejected/
      );
      assert.equal(fs.existsSync(extractDir), false);
    });
  });
});

run("extractZipSafely rejects archives with too many entries before extraction", () => {
  withTempDir((tempDir) => {
    const zipPath = path.join(tempDir, "too-many.zip");
    const extractDir = path.join(tempDir, "extract");

    writeZip(zipPath, [
      { name: "one.txt" },
      { name: "two.txt" },
      { name: "three.txt" },
    ]);

    assert.throws(
      () => extractZipSafely(zipPath, extractDir, { maxEntryCount: 2 }),
      /too many entries/
    );
    assert.equal(fs.existsSync(extractDir), false);
  });
});

run("extractZipSafely rejects excessive total uncompressed size before extraction", () => {
  withTempDir((tempDir) => {
    const zipPath = path.join(tempDir, "too-large.zip");
    const extractDir = path.join(tempDir, "extract");

    writeZip(zipPath, [
      { name: "scan.xml", content: "12345" },
    ]);

    assert.throws(
      () => extractZipSafely(zipPath, extractDir, { maxTotalUncompressedBytes: 4 }),
      /uncompressed size exceeds limit/
    );
    assert.equal(fs.existsSync(extractDir), false);
  });
});

run("extractZipSafely preserves a valid baseline archive layout", () => {
  withTempDir((tempDir) => {
    const zipPath = path.join(tempDir, "valid.zip");
    const extractDir = path.join(tempDir, "extract");
    const scanPath = path.join(
      extractDir,
      "demo-network",
      "rawscans",
      "2026-01-01_0101_baseline",
      "ports_top200_open.xml"
    );

    writeZip(zipPath, [
      {
        name: "demo-network/rawscans/2026-01-01_0101_baseline/ports_top200_open.xml",
        content: "<nmaprun></nmaprun>",
      },
    ]);

    extractZipSafely(zipPath, extractDir);
    assert.equal(fs.readFileSync(scanPath, "utf8"), "<nmaprun></nmaprun>");
  });
});

run("buildTopActions returns empty list when there are no risky exposures", () => {
  const actions = buildTopActions(createDiffData([]));
  assert.deepEqual(actions, []);
});

run("buildTopActions groups by port/protocol and sorts by affected host count", () => {
  const data = createDiffData([
    { ip: "10.0.0.10", hostname: "a", port: 445, protocol: "tcp", service: "microsoft-ds", changeType: "opened", risk: "P0" },
    { ip: "10.0.0.11", hostname: "b", port: 445, protocol: "tcp", service: "microsoft-ds", changeType: "opened", risk: "P0" },
    { ip: "10.0.0.11", hostname: "b", port: 445, protocol: "tcp", service: "microsoft-ds", changeType: "opened", risk: "P0" },
    { ip: "10.0.0.12", hostname: "c", port: 3389, protocol: "tcp", service: "ms-wbt-server", changeType: "opened", risk: "P0" },
    { ip: "10.0.0.20", hostname: "d", port: 23, protocol: "tcp", service: "telnet", changeType: "opened", risk: "P0" },
    { ip: "10.0.0.21", hostname: "e", port: 23, protocol: "tcp", service: "telnet", changeType: "opened", risk: "P0" },
    { ip: "10.0.0.22", hostname: "f", port: 23, protocol: "tcp", service: "telnet", changeType: "opened", risk: "P0" },
  ]);

  const actions = buildTopActions(data);
  assert.equal(actions.length, 3);
  assert.match(actions[0], /23\/tcp on 3 hosts/);
  assert.match(actions[1], /445\/tcp on 2 hosts/);
  assert.match(actions[2], /3389\/tcp on 1 host/);
});

run("inventory CSV safety accepts a valid CSV within limits", () => {
  const csv = [
    "device,mac,ip",
    "router,00:11:22:33:44:55,192.168.1.1",
    "printer,66:77:88:99:AA:BB,192.168.1.20",
  ].join("\n");

  assert.doesNotThrow(() => assertInventoryCSVFileSize(Buffer.byteLength(csv), { maxBytes: 512 }));
  assert.doesNotThrow(() => assertInventoryCSVRowLimit(csv, { maxRows: 2 }));
});

run("inventory CSV safety rejects oversized uploads before file read", () => {
  assert.throws(
    () => assertInventoryCSVFileSize(11, { maxBytes: 10 }),
    (error) =>
      error instanceof InventoryCSVLimitError &&
      /CSV file is too large/.test(error.message)
  );
});

run("inventory CSV safety rejects oversized request Content-Length before multipart parsing", () => {
  assert.throws(
    () => assertInventoryCSVRequestContentLength("13", { maxBytes: 10, maxMultipartBytes: 12 }),
    (error) =>
      error instanceof InventoryCSVLimitError &&
      /CSV upload request is too large/.test(error.message)
  );
});

run("inventory CSV safety ignores delimiter-only rows when enforcing row limit", () => {
  const csv = [
    "device,mac,ip",
    ",,,",
    " , , ",
    "\"\",\"\",",
    "router,00:11:22:33:44:55,192.168.1.1",
  ].join("\n");

  assert.doesNotThrow(() => assertInventoryCSVRowLimit(csv, { maxRows: 1 }));
});

run("inventory CSV safety rejects too many inventory rows", () => {
  const csv = [
    "device,mac,ip",
    "router,00:11:22:33:44:55,192.168.1.1",
    "printer,66:77:88:99:AA:BB,192.168.1.20",
    "laptop,AA:BB:CC:DD:EE:FF,192.168.1.50",
  ].join("\n");

  assert.throws(
    () => assertInventoryCSVRowLimit(csv, { maxRows: 2 }),
    (error) =>
      error instanceof InventoryCSVLimitError &&
      /CSV contains too many inventory rows/.test(error.message)
  );
});

run("safe API error messages hide unexpected details", () => {
  const sensitivePath = path.join(os.tmpdir(), "psec-secret", "scan.xml");
  const rawError = new Error(`ENOENT: no such file or directory, open '${sensitivePath}'`);

  const message = getSafeErrorMessage(rawError, "Upload failed");

  assert.equal(message, "Upload failed");
  assert.doesNotMatch(message, /psec-secret|scan\.xml|[A-Za-z]:\\/);
});

run("safe API error messages preserve allow-listed validation messages", () => {
  const validationError = new InventoryCSVLimitError(
    "CSV file is too large. Maximum size is 1 MiB."
  );

  const message = getSafeErrorMessage(validationError, "Failed to process CSV", {
    allowClientMessage: isInventoryCSVLimitError,
  });

  assert.equal(message, validationError.message);
});

run("client data paths are relative for files under the project data directory", () => {
  const uploadPath = path.join(process.cwd(), "data", "uploads", "scan.zip");

  const clientPath = toClientDataPath(uploadPath);

  assert.equal(clientPath, "data/uploads/scan.zip");
  assert.equal(path.isAbsolute(clientPath), false);
});

run("run manifests returned to clients do not include absolute file paths", () => {
  const runFolder = path.join(
    process.cwd(),
    "data",
    "extracted",
    "demo",
    "rawscans",
    "2026-01-01_0101_baseline"
  );
  const manifest = {
    runUid: "run-1",
    network: "demo",
    runFolder,
    folderName: "2026-01-01_0101_baseline",
    timestamp: null,
    runType: "baseline",
    keyFiles: {
      ports: [path.join(runFolder, "ports_top200_open.xml")],
    },
    contentHash: "hash",
    stats: {
      keyFileCount: 1,
      hasPortsScan: true,
      hasHostsUp: false,
      hasDiscovery: false,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    extractionId: "extract",
  };

  const safeManifest = sanitizeRunManifestForClient(manifest);

  assert.equal(path.isAbsolute(safeManifest.runFolder), false);
  assert.equal(path.isAbsolute(safeManifest.keyFiles.ports[0]), false);
  assert.match(safeManifest.runFolder, /^data\/extracted\//);
  assert.match(safeManifest.keyFiles.ports[0], /^data\/extracted\//);
});

run("rules POST rejects invalid ports, enums, strings, and malformed JSON", async () => {
  const rulesRoute = await import("../src/app/api/rules/route.ts");
  const baseBody = {
    port: 443,
    protocol: "tcp",
    network: "home-lab",
    action: "override",
    customRisk: "P1",
    reason: "Approved exception",
  };

  await withTempCwd(async () => {
    const cases = [
      {
        name: "port below range",
        body: { ...baseBody, port: 0 },
        error: /port must be an integer from 1 to 65535/,
      },
      {
        name: "port above range",
        body: { ...baseBody, port: 65536 },
        error: /port must be an integer from 1 to 65535/,
      },
      {
        name: "non-integer port",
        body: { ...baseBody, port: 22.5 },
        error: /port must be an integer from 1 to 65535/,
      },
      {
        name: "invalid action",
        body: { ...baseBody, action: "allow" },
        error: /action must be one of: override, whitelist/,
      },
      {
        name: "invalid risk",
        body: { ...baseBody, customRisk: "P9" },
        error: /customRisk must be one of: P0, P1, P2/,
      },
      {
        name: "empty network",
        body: { ...baseBody, network: " " },
        error: /network is required/,
      },
      {
        name: "too-long reason",
        body: { ...baseBody, reason: "x".repeat(1001) },
        error: /reason must be 1000 characters or fewer/,
      },
    ];

    for (const testCase of cases) {
      const response = await rulesRoute.POST(
        createJsonRequest("/api/rules", "POST", testCase.body)
      );
      await assertJsonError(response, 400, testCase.error, testCase.name);
    }

    const malformedResponse = await rulesRoute.POST(
      createRawJsonRequest("/api/rules", "POST", "{")
    );
    await assertJsonError(malformedResponse, 400, /valid JSON/);
  });
});

run("rules POST and PUT preserve valid rule behavior", async () => {
  const [rulesRoute, ruleRoute] = await Promise.all([
    import("../src/app/api/rules/route.ts"),
    import("../src/app/api/rules/[ruleId]/route.ts"),
  ]);

  await withTempCwd(async () => {
    for (const port of [1, 65535]) {
      const response = await rulesRoute.POST(
        createJsonRequest("/api/rules", "POST", {
          port,
          protocol: port === 1 ? "tcp" : "udp",
          network: `home-lab-${port}`,
          action: "whitelist",
          reason: `Valid boundary port ${port}`,
        })
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.rule.port, port);
    }

    const createResponse = await rulesRoute.POST(
      createJsonRequest("/api/rules", "POST", {
        port: 3389,
        protocol: "tcp",
        network: "home-lab",
        action: "override",
        customRisk: "P0",
        reason: "Track exposed RDP",
      })
    );
    const createBody = await createResponse.json();
    const ruleId = createBody.rule.ruleId;

    const invalidUpdateResponse = await ruleRoute.PUT(
      createJsonRequest(`/api/rules/${ruleId}`, "PUT", {
        action: "override",
        customRisk: "P9",
        reason: "reviewed",
      }),
      { params: Promise.resolve({ ruleId }) }
    );
    await assertJsonError(invalidUpdateResponse, 400, /customRisk must be one of/);

    const updateResponse = await ruleRoute.PUT(
      createJsonRequest(`/api/rules/${ruleId}`, "PUT", {
        action: "override",
        customRisk: "P1",
        reason: "Approved with compensating control",
      }),
      { params: Promise.resolve({ ruleId }) }
    );
    const updateBody = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.success, true);
    assert.equal(updateBody.rule.customRisk, "P1");
    assert.equal(updateBody.rule.reason, "Approved with compensating control");
  });
});

run("diff and comparisons POST reject invalid IDs and strings", async () => {
  const [diffRoute, comparisonsRoute] = await Promise.all([
    import("../src/app/api/diff/route.ts"),
    import("../src/app/api/comparisons/route.ts"),
  ]);

  await withTempCwd(async () => {
    const invalidDiffResponse = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", {
        baselineRunUid: "bad/id",
        currentRunUid: "current-run",
      })
    );
    await assertJsonError(invalidDiffResponse, 400, /baselineRunUid may only contain/);

    const emptyDiffResponse = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", {
        baselineRunUid: "",
        currentRunUid: "current-run",
      })
    );
    await assertJsonError(emptyDiffResponse, 400, /baselineRunUid is required/);

    const sameComparisonResponse = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", {
        baselineRunUid: "same-run",
        currentRunUid: "same-run",
      })
    );
    await assertJsonError(
      sameComparisonResponse,
      400,
      /baselineRunUid and currentRunUid must be different/
    );

    const longTitleResponse = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", {
        baselineRunUid: "baseline-run",
        currentRunUid: "current-run",
        title: "x".repeat(121),
      })
    );
    await assertJsonError(longTitleResponse, 400, /title must be 120 characters or fewer/);

    const invalidNotesResponse = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", {
        baselineRunUid: "baseline-run",
        currentRunUid: "current-run",
        notes: 123,
      })
    );
    await assertJsonError(invalidNotesResponse, 400, /notes must be a string/);
  });
});

run("diff and comparisons POST preserve valid payload behavior", async () => {
  const [diffRoute, comparisonsRoute] = await Promise.all([
    import("../src/app/api/diff/route.ts"),
    import("../src/app/api/comparisons/route.ts"),
  ]);

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeRunRegistryFixtures();

    const diffResponse = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", { baselineRunUid, currentRunUid })
    );
    const diffBody = await diffResponse.json();

    assert.equal(diffResponse.status, 200);
    assert.equal(diffBody.success, true);
    assert.equal(diffBody.data.portsOpened.length, 1);
    assert.equal(diffBody.data.portsOpened[0].port, 3389);

    const comparisonResponse = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", {
        baselineRunUid,
        currentRunUid,
        title: "  Weekly check  ",
        notes: "  one new RDP exposure  ",
      })
    );
    const comparisonBody = await comparisonResponse.json();

    assert.equal(comparisonResponse.status, 200);
    assert.equal(comparisonBody.success, true);
    assert.equal(comparisonBody.comparison.title, "Weekly check");
    assert.equal(comparisonBody.comparison.notes, "one new RDP exposure");
  });
});

run("inventory POST rejects malformed devices and preserves valid adds", async () => {
  const inventoryRoute = await import("../src/app/api/inventory/route.ts");

  await withTempCwd(async () => {
    const cases = [
      {
        body: [],
        error: /Request body must be a JSON object/,
      },
      {
        body: { network: " ", device: { ip: "10.0.0.5" } },
        error: /network is required/,
      },
      {
        body: { network: "home-lab", device: [] },
        error: /device must be a JSON object/,
      },
      {
        body: { network: "home-lab", device: { ip: 123 } },
        error: /device.ip must be a string/,
      },
      {
        body: { network: "home-lab", device: { notes: "x".repeat(1001) } },
        error: /device.notes must be 1000 characters or fewer/,
      },
      {
        body: { network: "home-lab", device: { ip: "", mac: " " } },
        error: /device must include a non-empty ip or mac/,
      },
    ];

    for (const testCase of cases) {
      const response = await inventoryRoute.POST(
        createJsonRequest("/api/inventory", "POST", testCase.body)
      );
      await assertJsonError(response, 400, testCase.error);
    }

    const validResponse = await inventoryRoute.POST(
      createJsonRequest("/api/inventory", "POST", {
        network: "home-lab",
        device: {
          device: "  Router  ",
          ip: "10.0.0.1",
          mac: "00-11-22-33-44-55",
          notes: "Core gateway",
        },
      })
    );
    const validBody = await validResponse.json();

    assert.equal(validResponse.status, 200);
    assert.equal(validBody.success, true);
    assert.equal(validBody.device.device, "Router");
    assert.equal(validBody.device.mac, "00:11:22:33:44:55");
  });
});

run("ingest and parse POST reject invalid bodies and preserve valid file payloads", async () => {
  const [ingestRoute, parseRoute] = await Promise.all([
    import("../src/app/api/ingest/route.ts"),
    import("../src/app/api/parse/route.ts"),
  ]);

  await withTempCwd(async () => {
    const invalidIngestResponse = await ingestRoute.POST(
      createJsonRequest("/api/ingest", "POST", { zipPath: 123 })
    );
    await assertJsonError(invalidIngestResponse, 400, /zipPath must be a string/);

    const malformedParseResponse = await parseRoute.POST(
      createRawJsonRequest("/api/parse", "POST", "{")
    );
    await assertJsonError(malformedParseResponse, 400, /valid JSON/);

    const extractedDir = path.join(process.cwd(), "data", "extracted", "sample");
    const xmlPath = path.join(extractedDir, "ports.xml");
    fs.mkdirSync(extractedDir, { recursive: true });
    fs.writeFileSync(
      xmlPath,
      createNmapXml([{ port: 443, protocol: "tcp", service: "https" }])
    );

    const parseResponse = await parseRoute.POST(
      createJsonRequest("/api/parse", "POST", {
        xmlPath: path.join("data", "extracted", "sample", "ports.xml"),
      })
    );
    const parseBody = await parseResponse.json();

    assert.equal(parseResponse.status, 200);
    assert.equal(parseBody.success, true);
    assert.equal(parseBody.ports[0].port, 443);

    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    const zipPath = path.join(uploadsDir, "scan.zip");
    fs.mkdirSync(uploadsDir, { recursive: true });
    writeZip(zipPath, [
      {
        name: "home-lab/rawscans/2026-02-08_1000_baselinekit_v0/ports_top200_open.xml",
        content: createNmapXml([{ port: 80, protocol: "tcp", service: "http" }]),
      },
    ]);

    const ingestResponse = await ingestRoute.POST(
      createJsonRequest("/api/ingest", "POST", {
        zipPath: path.join("data", "uploads", "scan.zip"),
        network: "home-lab",
      })
    );
    const ingestBody = await ingestResponse.json();

    assert.equal(ingestResponse.status, 200);
    assert.equal(ingestBody.success, true);
    assert.equal(ingestBody.runs.length, 1);
  });
});

run("LLM rate limit identity ignores proxy headers by default", () => {
  assert.equal(
    getLLMRateLimitIdentity(
      new Headers({
        "x-forwarded-for": "198.51.100.10, 203.0.113.20",
        "x-real-ip": "203.0.113.30",
      })
    ),
    SHARED_LLM_RATE_LIMIT_IDENTITY
  );
  assert.equal(
    getLLMRateLimitIdentity(new Headers({ "x-real-ip": "203.0.113.30" })),
    SHARED_LLM_RATE_LIMIT_IDENTITY
  );
  assert.equal(
    getLLMRateLimitIdentity(new Headers()),
    SHARED_LLM_RATE_LIMIT_IDENTITY
  );
});

run("LLM rate limit identity uses x-real-ip in trusted proxy mode", () => {
  assert.equal(
    getLLMRateLimitIdentity(
      new Headers({
        "x-forwarded-for": "198.51.100.10, 203.0.113.20",
        "x-real-ip": "203.0.113.30",
      }),
      { trustProxyHeaders: true }
    ),
    "203.0.113.30"
  );
});

run("LLM rate limit identity uses rightmost x-forwarded-for in trusted proxy mode", () => {
  assert.equal(
    getLLMRateLimitIdentity(
      new Headers({
        "x-forwarded-for": "198.51.100.10, 203.0.113.20",
      }),
      { trustProxyHeaders: true }
    ),
    "203.0.113.20"
  );
  assert.equal(
    getLLMRateLimitIdentity(new Headers(), { trustProxyHeaders: true }),
    SHARED_LLM_RATE_LIMIT_IDENTITY
  );
});

run("LLM rate limit blocks after threshold until the window resets", () => {
  resetLLMRateLimitForTesting();
  let nowMs = 1_000;
  const request = {
    headers: new Headers({ "x-real-ip": "198.51.100.55" }),
  };
  const options = {
    maxRequests: 2,
    windowMs: LLM_RATE_LIMIT_WINDOW_MS,
    now: () => nowMs,
  };

  try {
    assert.equal(consumeLLMRateLimit(request, options).allowed, true);
    assert.equal(consumeLLMRateLimit(request, options).allowed, true);
    assert.equal(consumeLLMRateLimit(request, options).allowed, false);

    nowMs += LLM_RATE_LIMIT_WINDOW_MS;
    assert.equal(consumeLLMRateLimit(request, options).allowed, true);
  } finally {
    resetLLMRateLimitForTesting();
  }
});

run("LLM rate limit ignores rotating forwarded headers when trusted proxy mode is off", () => {
  resetLLMRateLimitForTesting();
  let nowMs = 1_000;
  const options = {
    maxRequests: 2,
    windowMs: LLM_RATE_LIMIT_WINDOW_MS,
    now: () => nowMs,
  };

  try {
    const firstDecision = consumeLLMRateLimit(
      { headers: new Headers({ "x-forwarded-for": "198.51.100.1" }) },
      options
    );
    const secondDecision = consumeLLMRateLimit(
      { headers: new Headers({ "x-forwarded-for": "198.51.100.2" }) },
      options
    );
    const thirdDecision = consumeLLMRateLimit(
      { headers: new Headers({ "x-forwarded-for": "198.51.100.3" }) },
      options
    );

    assert.equal(firstDecision.identity, SHARED_LLM_RATE_LIMIT_IDENTITY);
    assert.equal(firstDecision.allowed, true);
    assert.equal(secondDecision.identity, SHARED_LLM_RATE_LIMIT_IDENTITY);
    assert.equal(secondDecision.allowed, true);
    assert.equal(thirdDecision.identity, SHARED_LLM_RATE_LIMIT_IDENTITY);
    assert.equal(thirdDecision.allowed, false);
  } finally {
    resetLLMRateLimitForTesting();
  }
});

run("LLM POST routes allow normal requests without API keys", async () => {
  await withoutLLMKeys(async () => {
    await withMutedConsoleLog(async () => {
      const llmRouteCases = await getLLMRouteCases();
      for (
        let routeIndex = 0;
        routeIndex < llmRouteCases.length;
        routeIndex += 1
      ) {
        const routeCase = llmRouteCases[routeIndex];
        resetLLMRateLimitForTesting();
        const response = await routeCase.post(
          createJsonPostRequest(
            routeCase.path,
            routeCase.body(),
            `198.51.100.${routeIndex + 1}`
          )
        );
        const body = await response.json();

        assert.equal(response.status, 200, routeCase.name);
        assert.equal(body.success, true, routeCase.name);
      }
    });
  });
  resetLLMRateLimitForTesting();
});

run("LLM POST routes return 429 after the default threshold despite rotating forwarded headers", async () => {
  await withoutLLMKeys(async () => {
    await withMutedConsoleLog(async () => {
      const llmRouteCases = await getLLMRouteCases();
      for (const routeCase of llmRouteCases) {
        resetLLMRateLimitForTesting();

        for (let i = 0; i < LLM_RATE_LIMIT_MAX_REQUESTS; i += 1) {
          const response = await routeCase.post(
            createJsonPostRequest(
              routeCase.path,
              routeCase.body(),
              `203.0.113.${i + 1}`
            )
          );

          assert.notEqual(response.status, 429, routeCase.name);
          await response.json();
        }

        const limitedResponse = await routeCase.post(
          createJsonPostRequest(routeCase.path, routeCase.body(), "203.0.113.250")
        );
        const limitedBody = await limitedResponse.json();

        assert.equal(limitedResponse.status, 429, routeCase.name);
        assert.deepEqual(limitedBody, LLM_RATE_LIMIT_ERROR_RESPONSE, routeCase.name);
      }
    });
  });
  resetLLMRateLimitForTesting();
});

run("LLM provider hides upstream bodies in returned errors while logging detail", async () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const providerBody = `{"error":"failure at ${path.join(os.tmpdir(), "provider-secret.json")}"}`;
  const logs = [];

  global.fetch = async () => new Response(providerBody, { status: 502 });
  console.error = (...args) => {
    logs.push(args);
  };
  delete process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";

  try {
    const response = await callLLM("system", "user");

    assert.equal(response.success, false);
    assert.equal(response.error, "OpenAI API error (502)");
    assert.doesNotMatch(response.error, /provider-secret|[A-Za-z]:\\/);
    assert.ok(
      logs.some((args) =>
        args.some((arg) => arg && typeof arg === "object" && arg.body === providerBody)
      )
    );
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;

    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }

    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  }
});

finish().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
