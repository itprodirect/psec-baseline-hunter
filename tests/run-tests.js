const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");

let resolvePathWithin;
let sanitizeNetworkName;
let extractZipSafely;
let buildTopActions;
let assertInventoryCSVFileSize;
let assertInventoryCSVRequestContentLength;
let assertInventoryCSVRowLimit;
let InventoryCSVLimitError;
let isInventoryCSVLimitError;
let getSafeErrorMessage;
let sanitizeRunManifestForClient;
let toClientDataPath;
let consumeLLMRateLimit;
let getLLMRateLimitIdentity;
let LLM_RATE_LIMIT_ERROR_RESPONSE;
let LLM_RATE_LIMIT_MAX_REQUESTS;
let LLM_RATE_LIMIT_WINDOW_MS;
let resetLLMRateLimitForTesting;
let SHARED_LLM_RATE_LIMIT_IDENTITY;
let callLLM;
let DEFAULT_LLM_MAX_TOKENS;
let DEFAULT_LLM_REQUEST_TIMEOUT_MS;
let LLM_MAX_TOKENS_UPPER_CAP;
let getLLMMaxTokens;
let getLLMRequestTimeoutMs;
let adaptRunManifestToObservationBundleV1;
let buildObservationBundleV1FromRun;
let parseObservationBundleV1Json;
let sanitizeObservationBundleV1;
let isObservationBundleValidationError;
let MAX_OBSERVATION_BUNDLE_JSON_BYTES;
let MAX_OBSERVATION_NMAP_XML_BYTES;
let MAX_OBSERVATION_HOSTS_UP_BYTES;
let MAX_OBSERVATION_ARP_SNAPSHOT_BYTES;
let registerObservationBundle;
let registerObservationBundleJson;
let getObservationById;
let listObservations;
let findDuplicateObservation;
let evaluateObservationFreshness;
let computeObservationBundleContentHash;
let ObservationRegistryTimestampError;
let compareObservationBundlesV1;
let isObservationComparisonError;
let evaluateEvidenceAwareComparison;
let buildNetworkActivity;
let buildSyntheticNetworkActivityScenario;
let shapeNetworkActivityComparison;
let buildNetworkStatement;
let renderNetworkStatementMarkdown;
let buildDeviceResponseTarget;
let upsertDeviceResponse;
let getDeviceResponseForTarget;
let adaptPacketHighwayCaptureToObservationBundleV1;
let computeDiff;
let buildDiffFromObservationBundles;
let DiffComparisonError;
let buildScorecardData;
let buildScorecardDataFromObservationBundle;
let generateRuleBasedDiffSummary;
let generateRuleBasedSummary;
let generateRuleBasedExecutiveSummary;
let diffToCSV;
let diffToMarkdown;
let scorecardToCSV;

async function loadModules() {
  const [
    pathSafety,
    archiveSafety,
    diffActions,
    inventoryCsvSafety,
    apiResponseSafety,
    llmRateLimit,
    llmProvider,
    observationBundle,
    observationRegistry,
    observationComparison,
    evidenceAwareComparison,
    networkActivity,
    networkStatement,
    deviceResponses,
    packetHighwayObservation,
    diffEngine,
    riskClassifier,
    diffPrompt,
    scorecardPrompt,
    executivePrompt,
    csvExport,
  ] = await Promise.all([
    import("../src/lib/services/path-safety.ts"),
    import("../src/lib/services/archive-safety.ts"),
    import("../src/lib/services/diff-actions.ts"),
    import("../src/lib/services/inventory-csv-safety.ts"),
    import("../src/lib/services/api-response-safety.ts"),
    import("../src/lib/services/llm-rate-limit.ts"),
    import("../src/lib/llm/provider.ts"),
    import("../src/lib/services/observation-bundle.ts"),
    import("../src/lib/services/observation-registry.ts"),
    import("../src/lib/services/observation-comparison.ts"),
    import("../src/lib/services/evidence-aware-comparison.ts"),
    import("../src/lib/services/network-activity.ts"),
    import("../src/lib/services/network-statement.ts"),
    import("../src/lib/services/device-responses.ts"),
    import("../src/lib/services/packet-highway-observation.ts"),
    import("../src/lib/services/diff-engine.ts"),
    import("../src/lib/services/risk-classifier.ts"),
    import("../src/lib/llm/prompt-diff.ts"),
    import("../src/lib/llm/prompt-scorecard.ts"),
    import("../src/lib/llm/prompt-executive.ts"),
    import("../src/lib/utils/csv-export.ts"),
  ]);

  ({ resolvePathWithin, sanitizeNetworkName } = pathSafety);
  ({ extractZipSafely } = archiveSafety);
  ({ buildTopActions } = diffActions);
  ({
    assertInventoryCSVFileSize,
    assertInventoryCSVRequestContentLength,
    assertInventoryCSVRowLimit,
    InventoryCSVLimitError,
    isInventoryCSVLimitError,
  } = inventoryCsvSafety);
  ({
    getSafeErrorMessage,
    sanitizeRunManifestForClient,
    toClientDataPath,
  } = apiResponseSafety);
  ({
    consumeLLMRateLimit,
    getLLMRateLimitIdentity,
    LLM_RATE_LIMIT_ERROR_RESPONSE,
    LLM_RATE_LIMIT_MAX_REQUESTS,
    LLM_RATE_LIMIT_WINDOW_MS,
    resetLLMRateLimitForTesting,
    SHARED_LLM_RATE_LIMIT_IDENTITY,
  } = llmRateLimit);
  ({
    callLLM,
    DEFAULT_LLM_MAX_TOKENS,
    DEFAULT_LLM_REQUEST_TIMEOUT_MS,
    LLM_MAX_TOKENS_UPPER_CAP,
    getLLMMaxTokens,
    getLLMRequestTimeoutMs,
  } = llmProvider);
  ({
    adaptRunManifestToObservationBundleV1,
    buildObservationBundleV1FromRun,
    parseObservationBundleV1Json,
    sanitizeObservationBundleV1,
    isObservationBundleValidationError,
    MAX_OBSERVATION_BUNDLE_JSON_BYTES,
    MAX_OBSERVATION_NMAP_XML_BYTES,
    MAX_OBSERVATION_HOSTS_UP_BYTES,
    MAX_OBSERVATION_ARP_SNAPSHOT_BYTES,
  } = observationBundle);
  ({
    registerObservationBundle,
    registerObservationBundleJson,
    getObservationById,
    listObservations,
    findDuplicateObservation,
    evaluateObservationFreshness,
    computeObservationBundleContentHash,
    ObservationRegistryTimestampError,
  } = observationRegistry);
  ({
    compareObservationBundlesV1,
    isObservationComparisonError,
  } = observationComparison);
  ({ evaluateEvidenceAwareComparison } = evidenceAwareComparison);
  ({
    buildNetworkActivity,
    buildSyntheticNetworkActivityScenario,
    shapeNetworkActivityComparison,
  } = networkActivity);
  ({
    buildNetworkStatement,
    renderNetworkStatementMarkdown,
  } = networkStatement);
  ({
    buildDeviceResponseTarget,
    upsertDeviceResponse,
    getDeviceResponseForTarget,
  } = deviceResponses);
  ({
    adaptPacketHighwayCaptureToObservationBundleV1,
  } = packetHighwayObservation);
  ({ computeDiff, buildDiffFromObservationBundles, DiffComparisonError } = diffEngine);
  ({ buildScorecardData, buildScorecardDataFromObservationBundle } = riskClassifier);
  ({ generateRuleBasedDiffSummary } = diffPrompt);
  ({ generateRuleBasedSummary } = scorecardPrompt);
  ({ generateRuleBasedExecutiveSummary } = executivePrompt);
  ({ diffToCSV, diffToMarkdown, scorecardToCSV } = csvExport);
}

let total = 0;
let failed = 0;
let testQueue = loadModules();

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
    identityUncertain: [],
    riskFindings: riskyExposures,
    riskyExposures,
    summary: "summary",
    evidence: createTestEvidence("supported", { comparison: true }),
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
    summary: "No P0 or P1 services were observed in this scan evidence.",
    evidence: createTestEvidence("supported"),
  };
}

function createTestEvidence(status, { comparison = false } = {}) {
  const supported = status === "supported";
  const coverage = {
    status: supported ? "complete" : "partial",
    score: supported ? 1 : 0.4,
    partial: !supported,
    deviceCount: 1,
    scopeKnown: true,
    expectedSources: ["ports", "discovery", "hosts_up", "arp_snapshot", "scan_metadata"],
    presentSources: supported
      ? ["ports", "discovery", "hosts_up", "arp_snapshot", "scan_metadata"]
      : ["ports"],
    missingSources: supported ? [] : ["discovery"],
    normalizationStatus: supported ? "complete" : "truncated",
    normalizationReasonCodes: supported ? [] : ["open-port-limit-exceeded"],
    coverageReasonCodes: [],
    targetProvenanceStatus: "verified",
  };

  return {
    version: "psec.evidence.v1",
    status,
    reasonCodes: supported
      ? ["external-reachability-not-established"]
      : ["partial-coverage", "external-reachability-not-established"],
    coverage: comparison
      ? { baseline: coverage, current: coverage }
      : { current: coverage },
    identity: {
      status: comparison ? "supported" : "not-applicable",
      uncertainCount: 0,
    },
    vantage: {
      kind: "unverified-scan-vantage",
      externalReachability: "not-established",
    },
    supports: {
      deviceAbsence: comparison && supported,
      portClosure: comparison && supported,
      stableBaseline: false,
      externalReachability: false,
      comparisonPersistence: comparison && supported,
      llmSummary: supported,
    },
    limitations: [
      "External reachability is not established by this scan vantage.",
      "Point-in-time observations do not establish continuous safety or stability.",
    ],
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
    executiveSummaryRoute,
  ] = await Promise.all([
    import("../src/app/api/llm/scorecard-summary/route.ts"),
    import("../src/app/api/llm/diff-summary/route.ts"),
    import("../src/app/api/llm/executive-summary/route.ts"),
  ]);

  const withRegisteredRuns = (post) => async (request) =>
    withTempCwd(async () => {
      writeRunRegistryFixtures();
      return post(request);
    });

  return [
    {
      name: "scorecard summary",
      path: "/api/llm/scorecard-summary",
      post: withRegisteredRuns(scorecardSummaryRoute.POST),
      body: () => ({ runUid: "current-run", scorecardData: createScorecardData() }),
    },
    {
      name: "diff summary",
      path: "/api/llm/diff-summary",
      post: withRegisteredRuns(diffSummaryRoute.POST),
      body: () => ({
        baselineRunUid: "baseline-run",
        currentRunUid: "current-run",
        diffData: createDiffData([]),
      }),
    },
    {
      name: "executive summary",
      path: "/api/llm/executive-summary",
      post: withRegisteredRuns(executiveSummaryRoute.POST),
      body: () => ({
        runUid: "current-run",
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

async function withEnv(overrides, fn) {
  const originals = new Map();

  for (const key of Object.keys(overrides)) {
    originals.set(key, process.env[key]);
    const value = overrides[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of originals.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withoutLLMKeys(fn) {
  return withEnv(
    {
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
    },
    fn
  );
}

async function withMockedFetch(fetchImpl, fn) {
  const hadFetch = Object.prototype.hasOwnProperty.call(global, "fetch");
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;

  try {
    return await fn();
  } finally {
    if (hadFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
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

async function withMutedConsoleMethods(methods, fn) {
  const originals = new Map();

  for (const method of methods) {
    originals.set(method, console[method]);
    console[method] = () => {};
  }

  try {
    return await fn();
  } finally {
    for (const [method, original] of originals.entries()) {
      console[method] = original;
    }
  }
}

function createAbortError() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function createAbortableFetch(onRequest) {
  return async (_url, options = {}) => {
    if (onRequest) {
      onRequest(options);
    }

    assert.ok(options.signal instanceof AbortSignal);

    return await new Promise((_, reject) => {
      if (options.signal.aborted) {
        reject(createAbortError());
        return;
      }

      const watchdog = setTimeout(() => {
        reject(new Error("Mock fetch was not aborted"));
      }, 250);

      options.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(watchdog);
          reject(createAbortError());
        },
        { once: true }
      );
    });
  };
}

function createAbortableBodyRead(signal, onAbort) {
  assert.ok(signal instanceof AbortSignal);

  return new Promise((_, reject) => {
    let watchdog;
    const abortBodyRead = () => {
      clearTimeout(watchdog);
      if (onAbort) {
        onAbort();
      }
      reject(createAbortError());
    };

    if (signal.aborted) {
      abortBodyRead();
      return;
    }

    watchdog = setTimeout(() => {
      signal.removeEventListener("abort", abortBodyRead);
      reject(new Error("Mock response body was not aborted"));
    }, 250);

    signal.addEventListener("abort", abortBodyRead, { once: true });
  });
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
    return await fn(tempDir);
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

function writeRunRegistryFixtures(options = {}) {
  return writeDb01RunPairFixtures({
    baselineRunUid: options.baselineRunUid ?? "baseline-run",
    currentRunUid: options.currentRunUid ?? "current-run",
    baselineTimestamp: options.baselineTimestamp ?? "2026-02-01T10:00:00.000Z",
    currentTimestamp: options.currentTimestamp ?? "2026-02-08T10:00:00.000Z",
    baselineNetwork: options.network ?? "home-lab",
    currentNetwork: options.network ?? "home-lab",
    baselineScope: "10.0.0.0/24",
    currentScope: "10.0.0.0/24",
    baselineHosts: [
      {
        ip: "10.0.0.1",
        mac: "02:00:00:00:00:01",
        hostname: "fixture-device.local",
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ],
    currentHosts: [
      {
        ip: "10.0.0.1",
        mac: "02:00:00:00:00:01",
        hostname: "fixture-device.local",
        ports: [
          { port: 80, protocol: "tcp", service: "http" },
          { port: 3389, protocol: "tcp", service: "ms-wbt-server" },
        ],
      },
    ],
  });
}

function writeDb01RunPairFixtures(options = {}) {
  const dataDir = path.join(process.cwd(), "data");
  const scansDir = path.join(dataDir, "db01-scans");
  const runsDir = path.join(dataDir, "runs");
  const baselineRunUid = options.baselineRunUid ?? "db01-baseline";
  const currentRunUid = options.currentRunUid ?? "db01-current";
  const baselineTimestamp = options.baselineTimestamp ?? "2026-07-01T10:00:00.000Z";
  const currentTimestamp = options.currentTimestamp ?? "2026-07-08T10:00:00.000Z";
  const baselineNetwork = options.baselineNetwork ?? "db01-lab";
  const currentNetwork = options.currentNetwork ?? baselineNetwork;
  const baselineScope = options.baselineScope ?? "192.0.2.0/24";
  const currentScope = options.currentScope ?? baselineScope;
  const baselineHosts = options.baselineHosts ?? [
    {
      ip: "192.0.2.10",
      mac: "02:00:00:00:00:10",
      hostname: "db01-device.local",
      ports: [{ port: 443, protocol: "tcp", service: "https" }],
    },
  ];
  const currentHosts = options.currentHosts ?? [
    {
      ip: "192.0.2.10",
      mac: "02:00:00:00:00:10",
      hostname: "db01-device.local",
      ports: [
        { port: 443, protocol: "tcp", service: "https" },
        { port: 3389, protocol: "tcp", service: "ms-wbt-server" },
      ],
    },
  ];

  fs.mkdirSync(scansDir, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });

  const baselineManifest = writeDb01RunArtifacts({
    runUid: baselineRunUid,
    timestamp: baselineTimestamp,
    network: baselineNetwork,
    scope: baselineScope,
    runType: options.baselineRunType ?? "baselinekit_v0",
    hosts: baselineHosts,
    coverage: options.baselineCoverage ?? "complete",
    scansDir,
  });
  const currentManifest = writeDb01RunArtifacts({
    runUid: currentRunUid,
    timestamp: currentTimestamp,
    network: currentNetwork,
    scope: currentScope,
    runType: options.currentRunType ?? "baselinekit_v0",
    hosts: currentHosts,
    coverage: options.currentCoverage ?? "complete",
    scansDir,
  });

  fs.writeFileSync(
    path.join(runsDir, "index.json"),
    JSON.stringify(
      {
        version: 1,
        runs: {
          [baselineRunUid]: baselineManifest,
          [currentRunUid]: currentManifest,
        },
        lastUpdated: currentTimestamp,
      },
      null,
      2
    )
  );

  return { baselineRunUid, currentRunUid, baselineManifest, currentManifest };
}

function writeDb01RunArtifacts({
  runUid,
  timestamp,
  network,
  scope,
  runType,
  hosts,
  coverage,
  scansDir,
}) {
  const runFolder = path.join(scansDir, runUid);
  const portsPath = path.join(runFolder, "ports_top200_open.xml");
  fs.mkdirSync(runFolder, { recursive: true });
  fs.writeFileSync(portsPath, createObservationNmapXml(hosts));

  const manifest = createRunManifest(runUid, timestamp, portsPath, network);
  manifest.runType = runType;
  manifest.runFolder = runFolder;
  manifest.folderName = runUid;

  if (coverage === "complete") {
    const discoveryPath = path.join(runFolder, "discovery_ping_sweep.xml");
    const hostsUpPath = path.join(runFolder, "hosts_up.txt");
    const arpPath = path.join(runFolder, "arp_cache.txt");
    const metadataPath = path.join(runFolder, "scan_metadata.json");

    fs.writeFileSync(discoveryPath, createObservationNmapXml(hosts.map((host) => ({ ...host, ports: [] }))));
    fs.writeFileSync(hostsUpPath, hosts.map((host) => host.ip).filter(Boolean).join("\n"));
    fs.writeFileSync(
      arpPath,
      hosts
        .filter((host) => host.ip && host.mac)
        .map((host) => `${host.ip} ${host.mac}`)
        .join("\n")
    );
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        target: scope,
        collectorHost: "db01-synthetic-collector",
        startedAt: timestamp,
        endedAt: new Date(Date.parse(timestamp) + 60_000).toISOString(),
        scriptVersion: "db01-test",
      })
    );

    manifest.keyFiles.discovery = [discoveryPath];
    manifest.keyFiles.hosts_up = [hostsUpPath];
    manifest.keyFiles.snapshots = [arpPath];
    manifest.stats.keyFileCount = 4;
    manifest.stats.hasHostsUp = true;
    manifest.stats.hasDiscovery = true;
  }

  return manifest;
}

function createRunManifest(runUid, timestamp, portsXmlPath, network = "home-lab") {
  return {
    runUid,
    network,
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

function createObservationNmapXml(hosts) {
  const firstIp = hosts.flatMap((host) => host.ips ?? (host.ip ? [host.ip] : []))[0];
  const target = firstIp
    ? `${firstIp.split(".").slice(0, 3).join(".")}.0/24`
    : "192.0.2.0/24";
  const scannedProtocols = [
    ...new Set(
      hosts.flatMap((host) => (host.ports ?? []).map((port) => port.protocol || "tcp"))
    ),
  ];
  return [
    `<nmaprun args="nmap ${target}">`,
    ...scannedProtocols.map(
      (protocol) =>
        `<scaninfo type="synthetic" protocol="${protocol}" numservices="65535" services="1-65535" />`
    ),
    ...hosts.map((host) => {
      const ipAddresses = host.ips ?? (host.ip ? [host.ip] : []);
      const addresses = [
        ...ipAddresses.map((ip) => `<address addr="${ip}" addrtype="ipv4" />`),
        host.mac ? `<address addr="${host.mac}" addrtype="mac"${host.vendor ? ` vendor="${host.vendor}"` : ""} />` : "",
      ].filter(Boolean).join("");
      const hostnames = host.hostname
        ? `<hostnames><hostname name="${host.hostname}" /></hostnames>`
        : "";
      const ports = host.ports?.length
        ? `<ports>${host.ports.map((port) => `<port protocol="${port.protocol}" portid="${port.port}"><state state="open" /><service name="${port.service}" product="${port.product ?? ""}" version="${port.version ?? ""}" /></port>`).join("")}<extraports state="closed" count="${scannedProtocols.length * 65535 - new Set(host.ports.map((port) => `${port.protocol || "tcp"}:${port.port}`)).size}" /></ports>`
        : "";
      return `<host><status state="up" />${addresses}${hostnames}${ports}</host>`;
    }),
    '<runstats><finished exit="success" /></runstats>',
    "</nmaprun>",
  ].join("");
}

function writeObservationRunFixture(options = {}) {
  const includeOptional = options.includeOptional !== false;
  const runUid = options.runUid ?? "synthetic-observation-run";
  const timestamp = options.timestamp ?? "2026-04-01T12:00:00.000Z";
  const network = options.network ?? "synthetic-lab";
  const runFolder = path.join(
    process.cwd(),
    "data",
    "extracted",
    "synthetic-lab",
    "rawscans",
    "2026-04-01_1200_baselinekit_v0"
  );
  fs.mkdirSync(runFolder, { recursive: true });

  const portsPath = path.join(runFolder, "ports_top200_open.xml");
  fs.writeFileSync(
    portsPath,
    createObservationNmapXml([
      {
        ip: "192.0.2.10",
        mac: "02:00:00:00:00:10",
        vendor: "Example Devices",
        hostname: "synthetic-laptop.local",
        ports: [
          { port: 443, protocol: "tcp", service: "https", product: "ExampleWeb", version: "1.0" },
        ],
      },
    ])
  );

  const manifest = createRunManifest(runUid, timestamp, portsPath, network);
  manifest.runFolder = runFolder;
  manifest.folderName = path.basename(runFolder);

  if (includeOptional) {
    const discoveryPath = path.join(runFolder, "discovery_ping_sweep.xml");
    const hostsUpPath = path.join(runFolder, "hosts_up.txt");
    const arpPath = path.join(runFolder, "arp_cache.txt");
    const metadataPath = path.join(runFolder, "scan_metadata.json");

    fs.writeFileSync(
      discoveryPath,
      createObservationNmapXml([
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          vendor: "Example Devices",
          hostname: "synthetic-laptop.local",
          ports: [],
        },
        {
          ip: "192.0.2.20",
          mac: "02:00:00:00:00:20",
          vendor: "Example Printers",
          hostname: "synthetic-printer.local",
          ports: [],
        },
      ])
    );
    fs.writeFileSync(hostsUpPath, "192.0.2.10\n192.0.2.20\n");
    fs.writeFileSync(
      arpPath,
      "Interface: 192.0.2.1 --- synthetic\n  192.0.2.10  02-00-00-00-00-10 dynamic\n  192.0.2.20  02-00-00-00-00-20 dynamic\n"
    );
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          target: "192.0.2.0/24",
          collectorHost: "synthetic-collector",
          startedAt: "2026-04-01T11:59:00.000Z",
          endedAt: "2026-04-01T12:05:00.000Z",
          scriptVersion: "synthetic-v1",
        },
        null,
        2
      )
    );

    manifest.keyFiles.discovery = [discoveryPath];
    manifest.keyFiles.hosts_up = [hostsUpPath];
    manifest.keyFiles.snapshots = [arpPath];
    manifest.stats.keyFileCount = 4;
    manifest.stats.hasHostsUp = true;
    manifest.stats.hasDiscovery = true;
  }

  const runsDir = path.join(process.cwd(), "data", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  fs.writeFileSync(
    path.join(runsDir, "index.json"),
    JSON.stringify(
      {
        version: 1,
        runs: { [runUid]: manifest },
        lastUpdated: timestamp,
      },
      null,
      2
    )
  );

  return manifest;
}

function observationUnsafeAbsolutePathSamples() {
  return [
    ["", "opt", "scans", "run.xml"].join("/"),
    ["", "workspace", "run.xml"].join("/"),
    ["", "Users", "user", "run.xml"].join("/"),
    ["", "home", "user", "run.xml"].join("/"),
    ["", "tmp", "run.xml"].join("/"),
    ["", "var", "log", "run.xml"].join("/"),
    ["", "etc", "passwd"].join("/"),
    ["C:", "Users", "user", "run.xml"].join("\\"),
    ["", "", "fileserver", "share", "run.xml"].join("\\"),
  ];
}

function assertValuesDoNotInclude(values, unsafeValues) {
  for (const unsafeValue of unsafeValues) {
    assert.equal(
      values.includes(unsafeValue),
      false,
      `expected unsafe path to be dropped: ${unsafeValue}`
    );
  }
}

function createObservationRegistryBundle(options = {}) {
  const manifest = writeObservationRunFixture({
    runUid: options.runUid,
    timestamp: options.timestamp,
    network: options.network,
    includeOptional: options.includeOptional,
  });
  const bundle = buildObservationBundleV1FromRun(manifest.runUid, {
    generatedAt: options.generatedAt ?? "2026-04-01T12:06:00.000Z",
  });

  assert.ok(bundle);

  if (options.startedAt || options.endedAt || options.generatedAt) {
    setObservationBundleTimes(bundle, {
      startedAt: options.startedAt ?? bundle.batch.startedAt,
      endedAt: options.endedAt ?? bundle.batch.endedAt,
      generatedAt: options.generatedAt ?? bundle.batch.generatedAt,
    });
  }

  return bundle;
}

function setObservationBundleTimes(bundle, times) {
  bundle.batch.startedAt = times.startedAt;
  bundle.batch.endedAt = times.endedAt;
  bundle.batch.generatedAt = times.generatedAt;

  for (const device of bundle.devices) {
    device.firstSeen = times.startedAt;
    device.lastSeen = times.endedAt;
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function observationTestPort(sourceId, port) {
  return {
    protocol: "tcp",
    port,
    state: "open",
    service: "synthetic",
    product: null,
    version: null,
    sourceId,
  };
}

function observationTestDevice(template, index, sourceId) {
  const second = Math.floor(index / 254) % 254;
  const third = index % 254 + 1;
  const ip = `198.18.${second}.${third}`;
  return {
    ...cloneJson(template),
    deviceId: `synthetic-device-${index}`,
    ips: [ip],
    macs: [],
    hostnames: [`device-${index}.example`],
    vendors: ["Synthetic"],
    identityEvidence: [
      {
        evidenceId: `ev-device-${index}`,
        kind: "ip-address",
        value: ip,
        sourceId,
        confidence: "observed",
      },
    ],
    openPorts: [],
    portCoverage: [],
    notes: [],
  };
}

function makePartialCurrentBundleWithClosedPort(bundle) {
  const partial = cloneJson(bundle);
  partial.coverage.status = "partial";
  partial.coverage.score = 0.8;
  partial.coverage.presentSources = partial.coverage.presentSources.filter(
    (label) => label !== "hosts_up"
  );
  partial.coverage.missingSources = ["hosts_up"];
  partial.coverage.notes = ["Synthetic partial current evidence."];
  partial.batch.partial = true;
  const stable = partial.devices.find((device) => device.macs.includes("02:00:00:00:00:10"));
  assert.ok(stable);
  stable.openPorts = [];
  return partial;
}

function observationRegistryRecordPath(registryId) {
  return path.join(process.cwd(), "data", "observations", `${registryId}.json`);
}

function readObservationRegistryFilesText() {
  const registryDir = path.join(process.cwd(), "data", "observations");
  if (!fs.existsSync(registryDir)) return "";
  return fs
    .readdirSync(registryDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .map((fileName) => fs.readFileSync(path.join(registryDir, fileName), "utf-8"))
    .join("\n");
}

function assertObservationRegistryOutputSafe(serialized) {
  assert.doesNotMatch(serialized, /<\??xml\b|<nmaprun\b|<host\b|<packet\b|pcap(?:ng)?\s+global\s+header/i);
  assert.doesNotMatch(
    serialized,
    /\b(api[_-]?key|secret|password|token)\s*[:=]|\bsk-[A-Za-z0-9_-]{20,}\b|BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/i
  );
  assert.doesNotMatch(
    serialized,
    /[A-Za-z]:\\|\\\\[^\\\s]+\\[^\s]+|\/(?:home|tmp|Users|var|etc|workspace|opt)\//i
  );
  assert.doesNotMatch(serialized, /rawscans|Interface: 192\.0\.2\.1/i);
}

function assertStatementExportSafe(serialized) {
  assertObservationRegistryOutputSafe(serialized);
  assert.doesNotMatch(serialized, /192\.0\.2\.|02:00:00|00:00:00/i);
  assert.doesNotMatch(serialized, /raw packet payload|raw capture|raw scan body/i);
}

function assertStatementExportOmitsSensitiveSiteIdentifiers(serialized, rawSiteId, rawNetworkName, context) {
  const derivedSiteId = statementDerivedIdPart(rawSiteId);
  const derivedNetworkName = statementDerivedIdPart(rawNetworkName);
  const derivedIdAlternatives = [derivedSiteId, derivedNetworkName]
    .filter(Boolean)
    .map(escapeRegExp)
    .join("|");

  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(rawSiteId), "i"), `${context} exposed raw site ID`);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(rawNetworkName), "i"), `${context} exposed raw network name`);
  assert.doesNotMatch(serialized, new RegExp(derivedIdAlternatives, "i"), `${context} exposed derived site identifier`);
  assert.doesNotMatch(
    serialized,
    new RegExp(`obs[_-][^"\\s)]*(?:${derivedIdAlternatives})`, "i"),
    `${context} exposed a derived observation or registry ID`
  );
  assert.doesNotMatch(serialized, /packet-highway\?observation=/i, `${context} exposed Packet Highway observation href`);
  assert.doesNotMatch(serialized, /\/activity#/i, `${context} exposed Activity evidence href`);
  assert.doesNotMatch(serialized, /"href"\s*:/i, `${context} exposed statement href fields`);
  assert.doesNotMatch(serialized, /\]\(\/(?:activity|packet-highway)[^)]*\)/i, `${context} exposed Markdown evidence links`);
}

function statementDerivedIdPart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function statementText(statement) {
  return statement.sections
    .flatMap((section) => [
      section.title,
      section.summary ?? "",
      ...section.items.map((item) => item.text),
    ])
    .join("\n");
}

function statementSection(statement, sectionId) {
  const section = statement.sections.find((candidate) => candidate.id === sectionId);
  assert.ok(section, `expected statement section ${sectionId}`);
  return section;
}

function assertMarkdownContainsStatementItems(statement, markdown) {
  const comparableMarkdown = markdown.replace(/\\([\[\]])/g, "$1");
  for (const section of statement.sections) {
    assert.match(comparableMarkdown, new RegExp(escapeRegExp(section.title)));
    for (const item of section.items) {
      assert.match(comparableMarkdown, new RegExp(escapeRegExp(item.text)));
    }
  }
}

async function assertSafeObservationApiError(response, status, errorPattern, context) {
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, status, context);
  assert.equal(body.success, false, context);
  assert.match(body.error, errorPattern, context);
  assert.ok(body.error.length <= 200, context);
  assert.ok(serialized.length <= 512, context);
  assertObservationRegistryOutputSafe(serialized);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createPacketHighwayCapture(options = {}) {
  const truncated = options.truncated ?? false;
  const unsafeText = options.unsafeText ?? false;
  const generatedAt = options.generatedAt ?? "2026-05-04T11:00:00.000Z";

  const capture = {
    version: 1,
    meta: {
      fileName: unsafeText ? "C:\\Users\\user\\captures\\home.pcapng" : "home.pcapng",
      format: "pcapng",
      packetCount: 42,
      byteCount: 2048,
      startTime: "2026-05-04T10:55:00.000Z",
      endTime: "2026-05-04T11:00:00.000Z",
      durationMs: 300000,
      truncated,
      ignoredPackets: truncated ? 3 : 0,
      generatedAt,
    },
    devices: [
      {
        id: "dev-1",
        mac: "02:00:00:00:34:10",
        ips: ["192.0.2.10"],
        name: unsafeText ? "C:\\Users\\user\\secret-device" : "Lab laptop",
        vendor: "Example Devices",
        role: "device",
        isKnown: true,
        packetsSent: 20,
        packetsReceived: 18,
        bytesSent: 1000,
        bytesReceived: 900,
        firstSeen: "2026-05-04T10:55:00.000Z",
        lastSeen: "2026-05-04T11:00:00.000Z",
        categories: ["https", "dns"],
        externalPeerCount: 1,
        dnsQueryCount: 1,
        notes: unsafeText ? "api_key=sk-thissecretmustnotpersist123456" : null,
      },
      {
        id: "gateway",
        mac: "02:00:00:00:34:01",
        ips: ["192.0.2.1"],
        name: "Gateway",
        vendor: "Example Routers",
        role: "gateway",
        isKnown: true,
        packetsSent: 18,
        packetsReceived: 20,
        bytesSent: 900,
        bytesReceived: 1000,
        firstSeen: "2026-05-04T10:55:00.000Z",
        lastSeen: "2026-05-04T11:00:00.000Z",
        categories: ["https", "dns"],
        externalPeerCount: 1,
        dnsQueryCount: 0,
        notes: null,
      },
    ],
    externalEndpoints: [
      {
        id: "ext-1",
        ip: "203.0.113.80",
        isAggregate: false,
        packets: 8,
        bytes: 600,
        categories: ["https"],
      },
    ],
    flows: [
      {
        id: "flow-1",
        fromId: "dev-1",
        toId: "ext-1",
        protocol: "tcp",
        port: 443,
        category: "https",
        packets: 8,
        bytes: 600,
        bytesFromInitiator: 180,
        firstSeen: "2026-05-04T10:56:00.000Z",
        lastSeen: "2026-05-04T10:57:00.000Z",
        scope: "external",
      },
    ],
    animationEvents: [
      {
        t: 0.5,
        flowId: "flow-1",
        fromId: "dev-1",
        toId: "ext-1",
        category: "https",
        size: 1,
      },
    ],
    dnsQueries: [
      {
        name: unsafeText ? "/tmp/raw-capture.pcap" : "updates.example.test",
        count: 1,
        kind: "dns",
      },
    ],
    summary: {
      headline: "Synthetic Packet Highway analysis.",
      lines: unsafeText
        ? ["<packet>raw payload bytes</packet>", "BEGIN PRIVATE KEY should not survive"]
        : ["One synthetic HTTPS flow was observed."],
      stats: {
        deviceCount: 2,
        knownDeviceCount: 2,
        externalEndpointCount: 1,
        flowCount: 1,
        dnsQueryCount: 1,
        uniqueDnsNames: 1,
        categoryBytes: { https: 600 },
      },
    },
    alerts: [
      {
        id: "alert-1",
        ruleId: "synthetic-review",
        level: "info",
        title: "Synthetic review item",
        detail: unsafeText ? "pcap global header raw packet body" : "Metadata-only synthetic item.",
        deviceIds: ["dev-1"],
        flowIds: ["flow-1"],
      },
    ],
    rawPackets: unsafeText ? "raw packet payload should be dropped" : undefined,
  };

  return capture;
}
const comparisonExpectedSources = [
  "ports",
  "discovery",
  "hosts_up",
  "arp_snapshot",
  "scan_metadata",
];

function createComparisonBundle(options = {}) {
  const observedAt = options.observedAt ?? "2026-05-01T12:05:00.000Z";
  const sourceId = options.sourceId ?? "src-1";
  const missingSources = options.missingSources ?? [];
  const presentSources = comparisonExpectedSources.filter(
    (source) => !missingSources.includes(source)
  );
  const coverageStatus = options.coverageStatus ?? (missingSources.length > 0 ? "partial" : "complete");
  const networkScope = options.networkScope ?? "192.0.2.0/24";

  return {
    schemaVersion: "psec.observation-bundle.v1",
    observationId: options.observationId ?? `obs-${observedAt.replace(/[^0-9]/g, "").slice(0, 12)}`,
    site: {
      siteId: options.siteId ?? "site-comparison-lab",
      networkName: options.networkName ?? "comparison-lab",
      networkScope,
    },
    collector: {
      collectorId: "synthetic-comparison",
      kind: "registered-scan-run",
      name: "Synthetic comparison fixture",
      version: "test",
    },
    batch: {
      batchId: options.batchId ?? `batch-${observedAt.replace(/[^0-9]/g, "").slice(0, 12)}`,
      sourceRunUid: options.sourceRunUid ?? `run-${observedAt.replace(/[^0-9]/g, "").slice(0, 12)}`,
      startedAt: options.startedAt ?? observedAt,
      endedAt: options.endedAt ?? observedAt,
      generatedAt: options.generatedAt ?? observedAt,
      partial: options.partial ?? coverageStatus !== "complete",
      notes: [],
    },
    sources: presentSources.map((label) => ({
      sourceId: label === "ports" ? sourceId : `src-${label}`,
      kind: label === "ports" || label === "discovery"
        ? "nmap-xml"
        : label === "hosts_up"
          ? "hosts-up"
          : label === "arp_snapshot"
            ? "arp-snapshot"
            : "scan-metadata",
      artifactLabel: label,
      fileName: label === "ports" || label === "discovery" ? `${label}.xml` : `${label}.txt`,
      parsed: true,
      recordCount: options.devices?.length ?? 1,
      notes: [],
      ...(label === "ports" || label === "discovery"
        ? { targetScopes: [networkScope], completionStatus: "success" }
        : {}),
    })),
    vantage: {
      type: "active-scan-upload",
      runType: "synthetic",
      networkName: options.networkName ?? "comparison-lab",
      collectorHost: "synthetic-collector",
      target: networkScope,
      notes: [],
    },
    coverage: {
      status: coverageStatus,
      score: coverageStatus === "complete" ? 1 : 0.4,
      expectedSources: comparisonExpectedSources,
      presentSources,
      missingSources,
      notes: options.coverageNotes ?? [],
      reasonCodes: options.coverageReasonCodes ?? [],
      targetProvenance: options.targetProvenance ?? {
        status: "verified",
        declaredScope: networkScope,
        observedScopes: [networkScope],
      },
    },
    normalization: options.normalization ?? {
      status: "complete",
      reasonCodes: [],
      losses: [],
    },
    identity: options.identity ?? {
      status: "supported",
      reasonCodes: [],
    },
    devices: (options.devices ?? []).map((device) =>
      createComparisonDevice({ ...device, sourceId })
    ),
    notes: [],
  };
}

function createComparisonDevice(options = {}) {
  const sourceId = options.sourceId ?? "src-1";
  const deviceId = options.deviceId ?? `dev-${options.ips?.[0] ?? "unknown"}`;
  const identityEvidence = [];

  for (const ip of options.ips ?? []) {
    identityEvidence.push(createComparisonEvidence("ip-address", ip, sourceId));
  }
  for (const mac of options.macs ?? []) {
    identityEvidence.push(createComparisonEvidence("mac-address", mac, sourceId));
  }
  for (const hashedMac of options.hashedMacs ?? []) {
    identityEvidence.push(createComparisonEvidence("mac-address", hashedMac, sourceId));
  }
  for (const hostname of options.hostnames ?? []) {
    identityEvidence.push(createComparisonEvidence("hostname", hostname, sourceId, "reported"));
  }
  for (const vendor of options.vendors ?? []) {
    identityEvidence.push(createComparisonEvidence("vendor", vendor, sourceId, "reported"));
  }

  return {
    deviceId,
    firstSeen: options.firstSeen ?? null,
    lastSeen: options.lastSeen ?? null,
    ips: options.ips ?? [],
    macs: options.macs ?? [],
    hostnames: options.hostnames ?? [],
    vendors: options.vendors ?? [],
    identityEvidence,
    openPorts: (options.ports ?? []).map((port) => ({
      protocol: port.protocol ?? "tcp",
      port: port.port,
      state: "open",
      service: port.service ?? null,
      product: port.product ?? null,
      version: port.version ?? null,
      sourceId,
    })),
    portCoverage: options.portCoverage ?? [
      {
        sourceId,
        protocol: "tcp",
        ranges: [{ start: 1, end: 65535 }],
      },
    ],
    notes: [],
  };
}

function createComparisonEvidence(kind, value, sourceId, confidence = "observed") {
  const safeValue = value.replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 60);
  return {
    evidenceId: `ev-${kind}-${safeValue}`,
    kind,
    value,
    sourceId,
    confidence,
  };
}

function createDeviceResponseTargetForBundleDevice(bundle, deviceIndex = 0) {
  const device = bundle.devices[deviceIndex];
  assert.ok(device, "expected fixture device");
  const target = buildDeviceResponseTarget({
    siteId: bundle.site.siteId,
    observationId: bundle.observationId,
    deviceId: device.deviceId,
    macs: device.macs,
    identityValues: device.identityEvidence.map((evidence) => evidence.value),
  });
  assert.ok(target, "expected stable device response target");
  return target;
}

function comparisonEventTypes(result) {
  return result.events.map((event) => event.eventType);
}

function findComparisonEvent(result, eventType, predicate = () => true) {
  return result.events.find((event) => event.eventType === eventType && predicate(event));
}

function comparisonPairKey(event) {
  return `${event.baselineDevice?.observationId ?? ""}|${event.baselineDevice?.deviceId ?? ""}->${event.currentDevice?.observationId ?? ""}|${event.currentDevice?.deviceId ?? ""}`;
}

function assertNoConfirmedAndUncertainPairs(result) {
  const uncertainPairs = new Set(
    result.events
      .filter((event) => event.eventType === "identity-uncertain-possibly-same-device")
      .map(comparisonPairKey)
  );
  const confirmedEventTypes = new Set([
    "service-or-port-opened",
    "service-or-port-closed",
    "important-device-metadata-changed",
  ]);

  for (const event of result.events) {
    if (!confirmedEventTypes.has(event.eventType)) continue;
    assert.equal(
      uncertainPairs.has(comparisonPairKey(event)),
      false,
      `pair ${comparisonPairKey(event)} appeared as both confirmed and uncertain`
    );
  }
}

function createAmbiguousMacThenWeakerIdentityComparison({ hashed = false } = {}) {
  const identityField = hashed ? "hashedMacs" : "macs";
  const sharedIdentity = hashed ? `sha256:${"b".repeat(64)}` : "02:00:00:00:00:AA";

  return {
    baseline: createComparisonBundle({
      observationId: hashed ? "obs-hashed-ambiguous-baseline" : "obs-mac-ambiguous-baseline",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-111111111111",
          ips: ["192.0.2.101"],
          [identityField]: [sharedIdentity],
          hostnames: ["kitchen-printer.local"],
          vendors: ["Example Printers"],
          ports: [{ port: 9100, protocol: "tcp", service: "jetdirect" }],
        },
        {
          deviceId: "dev-222222222222",
          ips: ["192.0.2.102"],
          [identityField]: [sharedIdentity],
          hostnames: ["garage-sensor.local"],
          vendors: ["Example Sensors"],
          ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
        },
      ],
    }),
    current: createComparisonBundle({
      observationId: hashed ? "obs-hashed-ambiguous-current" : "obs-mac-ambiguous-current",
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-333333333333",
          ips: ["192.0.2.103"],
          [identityField]: [sharedIdentity],
          hostnames: ["kitchen-printer.local"],
          vendors: ["Example Printers"],
          ports: [
            { port: 9100, protocol: "tcp", service: "jetdirect" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    }),
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
    const unsafeNames = [
      "/evil.txt",
      "C:/evil.txt",
      "C:\\evil.txt",
      "C:evil.txt",
      "\\evil.txt",
      "\\\\server\\share\\evil.txt",
    ];

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

run("extractZipSafely rejects backslash traversal entries before extraction", () => {
  withTempDir((tempDir) => {
    const zipPath = path.join(tempDir, "windows-traversal.zip");
    const extractDir = path.join(tempDir, "extract");
    const outsidePath = path.join(tempDir, "evil.txt");

    writeZip(zipPath, [
      { name: "safe.txt", unsafeName: "safe\\..\\evil.txt", content: "bad" },
    ]);

    assert.throws(
      () => extractZipSafely(zipPath, extractDir),
      /Unsafe ZIP entry rejected/
    );
    assert.equal(fs.existsSync(outsidePath), false);
    assert.equal(fs.existsSync(extractDir), false);
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

run("extractZipSafely preserves a Windows-style baseline archive layout", () => {
  withTempDir((tempDir) => {
    const zipPath = path.join(tempDir, "windows-valid.zip");
    const extractDir = path.join(tempDir, "extract");
    const scanPath = path.join(
      extractDir,
      "home-lab",
      "rawscans",
      "2026-02-08_1000_baselinekit_v0",
      "ports_top200_open.xml"
    );

    writeZip(zipPath, [
      {
        name: "placeholder.xml",
        unsafeName: "home-lab\\rawscans\\2026-02-08_1000_baselinekit_v0\\ports_top200_open.xml",
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

run("observation bundle adapter converts a synthetic registered scan run", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture();
    const bundle = buildObservationBundleV1FromRun(manifest.runUid, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });

    assert.ok(bundle);
    assert.equal(bundle.schemaVersion, "psec.observation-bundle.v1");
    assert.equal(bundle.observationId, "obs-synthetic-observation-run");
    assert.equal(bundle.site.networkName, "synthetic-lab");
    assert.equal(bundle.site.networkScope, "192.0.2.0/24");
    assert.equal(bundle.batch.startedAt, "2026-04-01T11:59:00.000Z");
    assert.equal(bundle.batch.endedAt, "2026-04-01T12:05:00.000Z");
    assert.equal(bundle.coverage.status, "complete");
    assert.deepEqual(bundle.coverage.missingSources, []);

    const laptop = bundle.devices.find((device) => device.ips.includes("192.0.2.10"));
    assert.ok(laptop);
    assert.ok(laptop.macs.includes("02:00:00:00:00:10"));
    assert.ok(laptop.hostnames.includes("synthetic-laptop.local"));
    assert.ok(laptop.vendors.includes("Example Devices"));
    assert.ok(laptop.openPorts.some((port) => port.port === 443 && port.service === "https"));

    const evidenceKinds = new Set(laptop.identityEvidence.map((evidence) => evidence.kind));
    assert.ok(evidenceKinds.has("ip-address"));
    assert.ok(evidenceKinds.has("mac-address"));
    assert.ok(evidenceKinds.has("hostname"));
    assert.ok(evidenceKinds.has("vendor"));
    assert.ok(evidenceKinds.has("host-up"));
    assert.ok(evidenceKinds.has("arp-neighbor"));

    for (const source of bundle.sources) {
      if (source.fileName) {
        assert.equal(path.basename(source.fileName), source.fileName);
        assert.equal(path.isAbsolute(source.fileName), false);
      }
    }

    const serialized = JSON.stringify(bundle);
    assert.doesNotMatch(serialized, /[A-Za-z]:\\|\/home\/|\/tmp\//);
    assert.doesNotMatch(serialized, /<nmaprun>|rawscans|Interface: 192\.0\.2\.1/);
  });
});

run("observation bundle adapter treats missing optional artifacts as partial coverage", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture({ includeOptional: false });
    const bundle = adaptRunManifestToObservationBundleV1(manifest, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });

    assert.equal(bundle.coverage.status, "partial");
    assert.equal(bundle.coverage.score, 0.35);
    assert.deepEqual(bundle.coverage.presentSources, ["ports"]);
    assert.ok(bundle.coverage.missingSources.includes("discovery"));
    assert.ok(bundle.coverage.missingSources.includes("hosts_up"));
    assert.ok(bundle.coverage.missingSources.includes("arp_snapshot"));
    assert.ok(bundle.coverage.missingSources.includes("scan_metadata"));
    assert.match(bundle.coverage.notes.join("\n"), /No discovery XML was available/);
    assert.ok(bundle.batch.partial);
    assert.equal(bundle.devices.length, 1);
  });
});

run("observation bundle adapter marks missing ARP and unverified discovery provenance partial", async () => {
  await withTempCwd(async () => {
    const cases = [
      {
        name: "arp_snapshot",
        remove: (manifest) => fs.rmSync(manifest.keyFiles.snapshots[0]),
      },
      {
        name: "scan_metadata",
        remove: (manifest) => fs.rmSync(path.join(manifest.runFolder, "scan_metadata.json")),
      },
    ];

    for (const testCase of cases) {
      const manifest = writeObservationRunFixture({
        runUid: `synthetic-missing-${testCase.name}`,
      });
      testCase.remove(manifest);

      const bundle = adaptRunManifestToObservationBundleV1(manifest, {
        generatedAt: "2026-04-01T12:06:00.000Z",
      });

      const expectedMissing = testCase.name === "scan_metadata"
        ? ["discovery", "scan_metadata"]
        : ["arp_snapshot"];
      assert.deepEqual(bundle.coverage.missingSources, expectedMissing, testCase.name);
      if (testCase.name === "scan_metadata") {
        assert.ok(bundle.coverage.reasonCodes.includes("target-coverage-unverified"));
      }
      assert.ok(bundle.batch.partial, testCase.name);
    }
  });
});

run("observation bundle identity keeps same-hostname devices separate without IP or MAC corroboration", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture({ includeOptional: false });
    const discoveryPath = path.join(manifest.runFolder, "discovery_ping_sweep.xml");
    fs.writeFileSync(
      discoveryPath,
      createObservationNmapXml([
        {
          ip: "192.0.2.20",
          mac: "02:00:00:00:00:20",
          vendor: "Example Devices",
          hostname: "synthetic-laptop.local",
          ports: [],
        },
      ])
    );
    manifest.keyFiles.discovery = [discoveryPath];

    const bundle = adaptRunManifestToObservationBundleV1(manifest, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });

    const first = bundle.devices.find((device) => device.ips.includes("192.0.2.10"));
    const second = bundle.devices.find((device) => device.ips.includes("192.0.2.20"));
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first.deviceId, second.deviceId);
    assert.equal(
      bundle.devices.filter((device) => device.hostnames.includes("synthetic-laptop.local")).length,
      2
    );
  });
});

run("observation bundle preserves conflicting transitive identifiers without accumulator merging", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture({ includeOptional: false });
    fs.writeFileSync(
      manifest.keyFiles.ports[0],
      createObservationNmapXml([
        {
          ips: ["192.0.2.30", "192.0.2.31"],
          hostname: "multi-ip-observation.local",
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ])
    );

    const discoveryPath = path.join(manifest.runFolder, "discovery_ping_sweep.xml");
    const arpPath = path.join(manifest.runFolder, "arp_cache.txt");
    fs.writeFileSync(
      discoveryPath,
      createObservationNmapXml([
        {
          ip: "192.0.2.40",
          mac: "02:00:00:00:00:40",
          hostname: "mac-backed.local",
          ports: [],
        },
      ])
    );
    fs.writeFileSync(
      arpPath,
      "192.0.2.30 02-00-00-00-00-40 dynamic\n192.0.2.31 02-00-00-00-00-31 dynamic\n"
    );
    manifest.keyFiles.discovery = [discoveryPath];
    manifest.keyFiles.snapshots = [arpPath];

    const bundle = adaptRunManifestToObservationBundleV1(manifest, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const ip31Devices = bundle.devices.filter((device) => device.ips.includes("192.0.2.31"));

    assert.equal(bundle.identity.status, "conflicting");
    assert.ok(bundle.identity.reasonCodes.includes("conflicting-identifiers"));
    assert.ok(ip31Devices.length >= 2);
    assert.equal(
      ip31Devices.some(
        (device) =>
          device.macs.includes("02:00:00:00:00:40") &&
          device.macs.includes("02:00:00:00:00:31")
      ),
      false
    );
  });
});

run("observation bundle malformed Nmap XML and invalid scan metadata degrade safely", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture();
    fs.writeFileSync(manifest.keyFiles.ports[0], "<nmaprun><host>");
    fs.writeFileSync(path.join(manifest.runFolder, "scan_metadata.json"), "{not json");

    const bundle = adaptRunManifestToObservationBundleV1(manifest, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const portsSource = bundle.sources.find((source) => source.artifactLabel === "ports");
    const metadataSource = bundle.sources.find((source) => source.artifactLabel === "scan_metadata");

    assert.equal(portsSource.parsed, false);
    assert.match(portsSource.notes.join("\n"), /Nmap XML could not be parsed/);
    assert.equal(metadataSource.parsed, false);
    assert.match(metadataSource.notes.join("\n"), /scan_metadata\.json could not be parsed/);
    assert.ok(bundle.coverage.missingSources.includes("ports"));
    assert.ok(bundle.coverage.missingSources.includes("scan_metadata"));
    assert.equal(bundle.site.networkScope, null);
    assert.doesNotMatch(JSON.stringify(bundle), /<nmaprun><host>|not json|[A-Za-z]:\\|\/home\//);
  });
});

run("observation bundle oversized scan metadata degrades safely", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture();
    fs.writeFileSync(path.join(manifest.runFolder, "scan_metadata.json"), "x".repeat(128 * 1024 + 1));

    const bundle = adaptRunManifestToObservationBundleV1(manifest, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const metadataSource = bundle.sources.find((source) => source.artifactLabel === "scan_metadata");

    assert.equal(metadataSource.parsed, false);
    assert.match(metadataSource.notes.join("\n"), /exceeded the metadata size limit/);
    assert.ok(bundle.coverage.missingSources.includes("scan_metadata"));
    assert.equal(bundle.site.networkScope, null);
    assert.doesNotMatch(JSON.stringify(bundle), /xxxxx/);
  });
});

run("observation bundle scan metadata sanitizes path-shaped target and collector fields", async () => {
  await withTempCwd(async () => {
    for (const unsafePath of observationUnsafeAbsolutePathSamples()) {
      const manifest = writeObservationRunFixture({
        runUid: `synthetic-metadata-path-${Buffer.from(unsafePath).toString("hex").slice(0, 16)}`,
      });
      fs.writeFileSync(
        path.join(manifest.runFolder, "scan_metadata.json"),
        JSON.stringify({
          target: unsafePath,
          collectorHost: unsafePath,
          startedAt: "2026-04-01T11:59:00.000Z",
          endedAt: "2026-04-01T12:05:00.000Z",
          scriptVersion: "synthetic-v1",
        })
      );

      const bundle = adaptRunManifestToObservationBundleV1(manifest, {
        generatedAt: "2026-04-01T12:06:00.000Z",
      });

      assert.equal(bundle.site.networkScope, null, unsafePath);
      assert.equal(bundle.vantage.target, null, unsafePath);
      assert.equal(bundle.vantage.collectorHost, null, unsafePath);
    }

    const manifest = writeObservationRunFixture({ runUid: "synthetic-metadata-safe-values" });
    fs.writeFileSync(
      path.join(manifest.runFolder, "scan_metadata.json"),
      JSON.stringify({
        target: "192.0.2.0/24",
        collectorHost: "synthetic-collector.local",
        startedAt: "2026-04-01T11:59:00.000Z",
        endedAt: "2026-04-01T12:05:00.000Z",
        scriptVersion: "collector-v1.xml",
      })
    );

    const bundle = adaptRunManifestToObservationBundleV1(manifest, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });

    assert.equal(bundle.site.networkScope, "192.0.2.0/24");
    assert.equal(bundle.vantage.target, "192.0.2.0/24");
    assert.equal(bundle.vantage.collectorHost, "synthetic-collector.local");
    assert.equal(bundle.collector.version, "collector-v1.xml");
  });
});

run("observation bundle size guards degrade oversized XML hosts and ARP artifacts", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture();
    fs.writeFileSync(manifest.keyFiles.discovery[0], "x".repeat(MAX_OBSERVATION_NMAP_XML_BYTES + 1));
    fs.writeFileSync(manifest.keyFiles.hosts_up[0], "1".repeat(MAX_OBSERVATION_HOSTS_UP_BYTES + 1));
    fs.writeFileSync(manifest.keyFiles.snapshots[0], "2".repeat(MAX_OBSERVATION_ARP_SNAPSHOT_BYTES + 1));

    const bundle = adaptRunManifestToObservationBundleV1(manifest, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const discoverySource = bundle.sources.find((source) => source.artifactLabel === "discovery");
    const hostsSource = bundle.sources.find((source) => source.artifactLabel === "hosts_up");
    const arpSource = bundle.sources.find((source) => source.artifactLabel === "arp_snapshot");

    assert.equal(discoverySource.parsed, false);
    assert.equal(hostsSource.parsed, false);
    assert.equal(arpSource.parsed, false);
    assert.match(discoverySource.notes.join("\n"), /Nmap XML exceeded the metadata size limit/);
    assert.match(hostsSource.notes.join("\n"), /hosts_up\.txt exceeded the metadata size limit/);
    assert.match(arpSource.notes.join("\n"), /ARP snapshot exceeded the metadata size limit/);
    assert.ok(bundle.coverage.missingSources.includes("discovery"));
    assert.ok(bundle.coverage.missingSources.includes("hosts_up"));
    assert.ok(bundle.coverage.missingSources.includes("arp_snapshot"));
    assert.doesNotMatch(JSON.stringify(bundle), /xxxx|1111|2222|[A-Za-z]:\\|\/home\//);
  });
});

run("observation bundle lookup returns null for unknown run UID", async () => {
  await withTempCwd(async () => {
    assert.equal(buildObservationBundleV1FromRun("missing-run"), null);
  });
});
run("observation bundle import validation rejects invalid JSON and sanitizes unsafe fields", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture();
    const bundle = buildObservationBundleV1FromRun(manifest.runUid, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const tampered = JSON.parse(JSON.stringify(bundle));
    const pathLikeFileName = ["C:", "Users", "user", "private", "ports_top200_open.xml"].join("\\");
    tampered.sources[1].fileName = pathLikeFileName;
    tampered.sources[1].unknownField = "drop me";
    tampered.devices[0].unknownField = "drop me";
    tampered.devices[0].identityEvidence.push({
      evidenceId: "ev-unsafe-marker",
      kind: "hostname",
      value: ["token", "synthetic-not-for-output"].join("="),
      sourceId: tampered.sources[1].sourceId,
      confidence: "reported",
    });
    tampered.notes = [["password", "not-for-output"].join("="), "kept synthetic note"];

    const restored = parseObservationBundleV1Json(JSON.stringify(tampered));
    assert.equal(restored.sources[1].fileName, "ports_top200_open.xml");
    assert.equal("unknownField" in restored.sources[1], false);
    assert.equal("unknownField" in restored.devices[0], false);
    const unsafeOutputPattern = new RegExp(
      [["token", "synthetic"].join("="), ["password", ""].join("="), "private"].join("|")
    );
    assert.doesNotMatch(JSON.stringify(restored), unsafeOutputPattern);
    assert.deepEqual(restored.notes, ["kept synthetic note"]);

    assert.throws(
      () => parseObservationBundleV1Json("{broken"),
      (error) => isObservationBundleValidationError(error) && /not valid JSON/.test(error.message)
    );
    assert.throws(
      () => parseObservationBundleV1Json(JSON.stringify({ hello: "world" })),
      (error) => isObservationBundleValidationError(error) && /does not look like/.test(error.message)
    );
    assert.throws(
      () => parseObservationBundleV1Json(" ".repeat(MAX_OBSERVATION_BUNDLE_JSON_BYTES + 1)),
      (error) => isObservationBundleValidationError(error) && /too large/.test(error.message)
    );
  });
});

run("observation bundle import drops invalid open ports but preserves boundary ports", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture();
    const bundle = buildObservationBundleV1FromRun(manifest.runUid, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const tampered = JSON.parse(JSON.stringify(bundle));
    const sourceId = tampered.sources.find((source) => source.artifactLabel === "ports").sourceId;
    tampered.devices[0].openPorts = [
      null,
      "malformed-port",
      { protocol: "tcp", state: "open", service: "missing-port", sourceId },
      { protocol: "tcp", port: "not-a-number", state: "open", service: "non-numeric", sourceId },
      { protocol: "tcp", port: 22.5, state: "open", service: "non-integer", sourceId },
      { protocol: "tcp", port: -1, state: "open", service: "negative", sourceId },
      { protocol: "tcp", port: 0, state: "open", service: "zero", sourceId },
      { protocol: "tcp", port: 65536, state: "open", service: "too-high", sourceId },
      { protocol: "tcp", port: 1, state: "open", service: "valid-low", sourceId },
      { protocol: "udp", port: 65535, state: "open", service: "valid-high", sourceId },
    ];

    const restored = parseObservationBundleV1Json(JSON.stringify(tampered));
    const ports = restored.devices[0].openPorts.map((port) => port.port).sort((a, b) => a - b);

    assert.deepEqual(ports, [1, 65535]);
    assert.deepEqual(
      restored.devices[0].openPorts.map((port) => port.service).sort(),
      ["valid-high", "valid-low"]
    );
  });
});

run("DB-01 import requires explicit open-port protocol and open state", async () => {
  await withTempCwd(async () => {
    const baselineRaw = createObservationRegistryBundle({
      runUid: "open-port-schema-baseline",
      network: "open-port-schema-lab",
      startedAt: "2026-07-01T08:00:00.000Z",
      endedAt: "2026-07-01T08:01:00.000Z",
      generatedAt: "2026-07-01T08:01:00.000Z",
    });
    const currentRaw = createObservationRegistryBundle({
      runUid: "open-port-schema-current",
      network: "open-port-schema-lab",
      startedAt: "2026-07-01T09:00:00.000Z",
      endedAt: "2026-07-01T09:01:00.000Z",
      generatedAt: "2026-07-01T09:01:00.000Z",
    });
    baselineRaw.devices = baselineRaw.devices.filter((device) =>
      device.macs.includes("02:00:00:00:00:10")
    );
    currentRaw.devices = currentRaw.devices.filter((device) =>
      device.macs.includes("02:00:00:00:00:10")
    );
    const baselineSource = baselineRaw.sources.find(
      (source) => source.artifactLabel === "ports"
    ).sourceId;
    const currentSource = currentRaw.sources.find(
      (source) => source.artifactLabel === "ports"
    ).sourceId;
    baselineRaw.devices[0].openPorts = [observationTestPort(baselineSource, 443)];
    currentRaw.devices[0].openPorts = [
      { ...observationTestPort(currentSource, 443), protocol: undefined },
      { ...observationTestPort(currentSource, 8443), state: undefined },
      { ...observationTestPort(currentSource, 9443), state: "closed" },
    ];

    const baseline = sanitizeObservationBundleV1(baselineRaw);
    const current = sanitizeObservationBundleV1(currentRaw);
    const diff = buildDiffFromObservationBundles(baseline, current);

    assert.deepEqual(
      current.devices[0].openPorts,
      [],
      "missing protocol/state and explicitly closed records must not be promoted to open"
    );
    assert.equal(current.normalization.status, "truncated");
    assert.ok(current.normalization.reasonCodes.includes("invalid-open-port-dropped"));
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
  });
});

run("observation bundle import drops absolute paths from text fields without dropping safe values", async () => {
  await withTempCwd(async () => {
    const manifest = writeObservationRunFixture();
    const bundle = buildObservationBundleV1FromRun(manifest.runUid, {
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const tampered = JSON.parse(JSON.stringify(bundle));
    const unsafePaths = observationUnsafeAbsolutePathSamples();
    const safeCidr = "192.0.2.0/24";
    const safeHostname = "synthetic-collector.local";
    const safeBasename = "run.xml";
    const sourceId = tampered.sources.find((source) => source.artifactLabel === "ports").sourceId;

    tampered.site.networkScope = unsafePaths[0];
    tampered.vantage.collectorHost = unsafePaths[1];
    tampered.vantage.target = unsafePaths[2];
    tampered.notes = [unsafePaths[3], safeCidr, safeHostname, safeBasename];
    tampered.batch.notes = [unsafePaths[4], safeCidr, safeHostname, safeBasename];
    tampered.vantage.notes = [unsafePaths[5], safeCidr, safeHostname, safeBasename];
    tampered.sources[0].notes = [...unsafePaths, safeCidr, safeHostname, safeBasename];
    tampered.devices[0].notes = [unsafePaths[6], safeCidr, safeHostname, safeBasename];
    tampered.devices[0].identityEvidence = [
      ...tampered.devices[0].identityEvidence,
      ...unsafePaths.map((unsafePath, index) => ({
        evidenceId: `ev-unsafe-path-${index}`,
        kind: "hostname",
        value: unsafePath,
        sourceId,
        confidence: "reported",
      })),
      {
        evidenceId: "ev-safe-cidr",
        kind: "hostname",
        value: safeCidr,
        sourceId,
        confidence: "reported",
      },
      {
        evidenceId: "ev-safe-hostname",
        kind: "hostname",
        value: safeHostname,
        sourceId,
        confidence: "reported",
      },
      {
        evidenceId: "ev-safe-basename",
        kind: "hostname",
        value: safeBasename,
        sourceId,
        confidence: "reported",
      },
    ];

    const restored = parseObservationBundleV1Json(JSON.stringify(tampered));
    const restoredTextValues = [
      restored.site.networkScope,
      restored.vantage.collectorHost,
      restored.vantage.target,
      ...restored.notes,
      ...restored.batch.notes,
      ...restored.vantage.notes,
      ...restored.sources[0].notes,
      ...restored.devices[0].notes,
      ...restored.devices[0].identityEvidence.map((evidence) => evidence.value),
    ].filter(Boolean);

    assert.equal(restored.site.networkScope, null);
    assert.equal(restored.vantage.collectorHost, null);
    assert.equal(restored.vantage.target, null);
    assertValuesDoNotInclude(restoredTextValues, unsafePaths);
    assert.ok(restoredTextValues.includes(safeCidr));
    assert.ok(restoredTextValues.includes(safeHostname));
    assert.ok(restoredTextValues.includes(safeBasename));
  });
});

run("observation registry rejects ambiguous or invalid import timestamps before persistence", async () => {
  await withTempCwd(async () => {
    const bundle = createObservationRegistryBundle({
      runUid: "timestamp-validation-observation",
      network: "timestamp-validation-lab",
      startedAt: "2026-04-01T12:00:00.000Z",
      endedAt: "2026-04-01T12:05:00.000Z",
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const cases = [
      {
        name: "missing generatedAt",
        field: "batch.generatedAt",
        mutate: (tampered) => delete tampered.batch.generatedAt,
      },
      {
        name: "null generatedAt",
        field: "batch.generatedAt",
        mutate: (tampered) => {
          tampered.batch.generatedAt = null;
        },
      },
      {
        name: "malformed generatedAt",
        field: "batch.generatedAt",
        mutate: (tampered) => {
          tampered.batch.generatedAt = "not-a-date";
        },
      },
      {
        name: "offset-less generatedAt",
        field: "batch.generatedAt",
        mutate: (tampered) => {
          tampered.batch.generatedAt = "2026-04-01T12:06:00";
        },
      },
      {
        name: "invalid generatedAt date",
        field: "batch.generatedAt",
        mutate: (tampered) => {
          tampered.batch.generatedAt = "2026-02-30T12:06:00.000Z";
        },
      },
      {
        name: "offset-less startedAt",
        field: "batch.startedAt",
        mutate: (tampered) => {
          tampered.batch.startedAt = "2026-04-01T12:00:00";
        },
      },
      {
        name: "invalid endedAt",
        field: "batch.endedAt",
        mutate: (tampered) => {
          tampered.batch.endedAt = "2026-02-30T12:05:00.000Z";
        },
      },
    ];

    for (const testCase of cases) {
      const tampered = JSON.parse(JSON.stringify(bundle));
      testCase.mutate(tampered);
      assert.throws(
        () => registerObservationBundleJson(JSON.stringify(tampered)),
        (error) =>
          isObservationBundleValidationError(error) &&
          error.message.includes(testCase.field) &&
          /explicit offset/.test(error.message),
        testCase.name
      );
    }

    const malformedDuplicate = JSON.parse(JSON.stringify(bundle));
    delete malformedDuplicate.batch.generatedAt;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.throws(
        () => registerObservationBundleJson(JSON.stringify(malformedDuplicate)),
        (error) =>
          isObservationBundleValidationError(error) &&
          error.message.includes("batch.generatedAt") &&
          /explicit offset/.test(error.message),
        `malformed duplicate attempt ${attempt + 1}`
      );
    }

    assert.equal(listObservations().length, 0);
    assert.equal(readObservationRegistryFilesText(), "");
  });
});
run("observation registry retains same-site observations chronologically and dedupes reimports", async () => {
  await withTempCwd(async () => {
    const older = createObservationRegistryBundle({
      runUid: "repeat-site-older",
      network: "repeat-lab",
      startedAt: "2026-04-01T12:00:00.000Z",
      endedAt: "2026-04-01T12:05:00.000Z",
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const newer = createObservationRegistryBundle({
      runUid: "repeat-site-newer",
      network: "repeat-lab",
      startedAt: "2026-04-15T12:00:00.000Z",
      endedAt: "2026-04-15T12:05:00.000Z",
      generatedAt: "2026-04-15T12:06:00.000Z",
    });

    assert.equal(older.site.siteId, newer.site.siteId);
    assert.notEqual(older.observationId, newer.observationId);

    const newerResult = registerObservationBundle(newer, {
      importedAt: "2026-04-15T12:07:00.000Z",
      evaluatedAt: "2026-04-16T00:00:00.000Z",
    });
    const olderResult = registerObservationBundle(older, {
      importedAt: "2026-04-01T12:07:00.000Z",
      evaluatedAt: "2026-04-16T00:00:00.000Z",
    });
    const duplicate = registerObservationBundleJson(JSON.stringify(older), {
      importedAt: "2026-04-20T00:00:00.000Z",
      evaluatedAt: "2026-04-20T00:00:00.000Z",
    });

    assert.equal(newerResult.isNew, true);
    assert.equal(olderResult.isNew, true);
    assert.notEqual(newerResult.record.registryId, olderResult.record.registryId);
    assert.equal(duplicate.isNew, false);
    assert.equal(duplicate.duplicateOf, olderResult.record.registryId);
    assert.equal(duplicate.record.registryId, olderResult.record.registryId);

    const listed = listObservations(
      { siteId: older.site.siteId, order: "asc" },
      { evaluatedAt: "2026-04-16T00:00:00.000Z" }
    );
    const networkListed = listObservations(
      { network: "repeat-lab", order: "asc" },
      { evaluatedAt: "2026-04-16T00:00:00.000Z" }
    );
    const duplicateLookup = findDuplicateObservation(
      computeObservationBundleContentHash(older),
      { evaluatedAt: "2026-04-16T00:00:00.000Z" }
    );

    assert.equal(listed.length, 2);
    assert.deepEqual(
      listed.map((entry) => entry.observationId),
      [older.observationId, newer.observationId]
    );
    assert.deepEqual(
      networkListed.map((entry) => entry.observationId),
      [older.observationId, newer.observationId]
    );
    assert.equal(duplicateLookup.registryId, olderResult.record.registryId);

    const index = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "observations", "index.json"), "utf-8")
    );
    assert.equal(Object.keys(index.observations).length, 2);
  });
});

run("observation registry dedupes by stable source run without collapsing reused observation IDs", async () => {
  await withTempCwd(async () => {
    const oldStyle = createObservationRegistryBundle({
      runUid: "compat-source-run",
      network: "compat-dedupe-lab",
      generatedAt: "2026-06-19T12:00:00.000Z",
    });
    const deterministic = createObservationRegistryBundle({
      runUid: "compat-source-run",
      network: "compat-dedupe-lab",
      generatedAt: "2026-04-01T12:06:00.000Z",
    });

    assert.equal(oldStyle.batch.sourceRunUid, deterministic.batch.sourceRunUid);
    assert.equal(oldStyle.observationId, deterministic.observationId);
    assert.notEqual(
      computeObservationBundleContentHash(oldStyle),
      computeObservationBundleContentHash(deterministic)
    );

    const oldStyleResult = registerObservationBundle(oldStyle, {
      importedAt: "2026-06-19T12:30:00.000Z",
      evaluatedAt: "2026-06-20T00:00:00.000Z",
    });
    const deterministicResult = registerObservationBundle(deterministic, {
      importedAt: "2026-06-20T12:30:00.000Z",
      evaluatedAt: "2026-06-21T00:00:00.000Z",
    });

    assert.equal(oldStyleResult.isNew, true);
    assert.equal(deterministicResult.isNew, false);
    assert.equal(deterministicResult.duplicateOf, oldStyleResult.record.registryId);

    const thirdParty = createObservationRegistryBundle({
      runUid: "third-party-source-run",
      network: "compat-dedupe-lab",
      generatedAt: "2026-04-01T12:07:00.000Z",
    });
    thirdParty.observationId = oldStyle.observationId;
    thirdParty.notes = ["Corrected third-party import that reused an observation id."];

    assert.notEqual(thirdParty.batch.sourceRunUid, oldStyle.batch.sourceRunUid);
    assert.notEqual(
      computeObservationBundleContentHash(thirdParty),
      computeObservationBundleContentHash(oldStyle)
    );

    const thirdPartyResult = registerObservationBundle(thirdParty, {
      importedAt: "2026-06-21T12:30:00.000Z",
      evaluatedAt: "2026-06-22T00:00:00.000Z",
    });
    const listed = listObservations(
      { network: "compat-dedupe-lab", order: "asc" },
      { evaluatedAt: "2026-06-22T00:00:00.000Z" }
    );

    assert.equal(thirdPartyResult.isNew, true);
    assert.notEqual(thirdPartyResult.record.registryId, oldStyleResult.record.registryId);
    assert.equal(listed.length, 2);
    assert.deepEqual(
      listed.map((entry) => entry.batch.sourceRunUid).sort(),
      [oldStyle.batch.sourceRunUid, thirdParty.batch.sourceRunUid].sort()
    );
  });
});

run("observation registry sanitizes imports before persistence and omits unsafe bodies", async () => {
  await withTempCwd(async () => {
    const bundle = createObservationRegistryBundle({
      runUid: "unsafe-observation-import",
      network: "unsafe-lab",
    });
    const tampered = JSON.parse(JSON.stringify(bundle));
    const unsafePath = ["C:", "Users", "user", "private", "ports_top200_open.xml"].join("\\");
    const unixUnsafePath = ["", "home", "user", "private", "target.txt"].join("/");
    const rawScanBody = "<nmaprun><host><address addr=\"192.0.2.99\" /></host></nmaprun>";
    const normalizedRawScanId = "nmaprun-host-address-addr-192.0.2.99";
    const unsafeSecret = ["api_key", "synthetic-not-for-output"].join("=");
    const safeEvidenceSourceId = tampered.sources[1].sourceId;

    tampered.unknownField = "drop me";
    tampered.observationId = rawScanBody;
    tampered.batch.batchId = rawScanBody;
    tampered.batch.sourceRunUid = normalizedRawScanId;
    tampered.sources[0].sourceId = rawScanBody;
    tampered.devices[0].deviceId = rawScanBody;
    tampered.sources[0].fileName = unsafePath;
    tampered.sources[0].notes = [unsafePath, rawScanBody, unsafeSecret, "safe source note"];
    tampered.vantage.collectorHost = unsafePath;
    tampered.vantage.target = unixUnsafePath;
    tampered.vantage.notes = [rawScanBody, "safe vantage note"];
    tampered.batch.notes = [["token", "synthetic-not-for-output"].join("="), "safe batch note"];
    tampered.coverage.notes = [rawScanBody, "safe coverage note"];
    tampered.devices[0].hostnames.push(unsafePath);
    tampered.devices[0].identityEvidence.push({
      evidenceId: "ev-secret-marker",
      kind: "hostname",
      value: ["password", "synthetic-not-for-output"].join("="),
      sourceId: tampered.sources[0].sourceId,
      confidence: "reported",
    });
    tampered.devices[0].identityEvidence.push({
      evidenceId: rawScanBody,
      kind: "hostname",
      value: "raw-id-safe-value",
      sourceId: safeEvidenceSourceId,
      confidence: "reported",
    });
    tampered.devices[0].openPorts[0].product = `sk-${"A".repeat(24)}`;
    tampered.notes = [unsafePath, rawScanBody, "safe registry note"];

    const result = registerObservationBundle(tampered, {
      importedAt: "2026-04-01T12:07:00.000Z",
      evaluatedAt: "2026-04-02T00:00:00.000Z",
    });
    const persistedRecord = fs.readFileSync(
      observationRegistryRecordPath(result.record.registryId),
      "utf-8"
    );
    const persistedRegistry = readObservationRegistryFilesText();

    assert.equal(result.isNew, true);
    assert.equal(result.record.vantage.collectorHost, null);
    assert.equal(result.record.vantage.target, null);
    assert.equal(result.record.bundle.sources[0].fileName, "ports_top200_open.xml");
    assert.ok(result.record.bundle.sources[0].notes.includes("safe source note"));
    assert.ok(result.record.bundle.vantage.notes.includes("safe vantage note"));
    assert.ok(result.record.bundle.batch.notes.includes("safe batch note"));
    assert.ok(result.record.bundle.coverage.notes.includes("safe coverage note"));
    assert.ok(result.record.bundle.notes.includes("safe registry note"));
    assert.equal("unknownField" in result.record.bundle, false);
    assert.equal(result.record.observationId, "obs-unknown");
    assert.equal(result.record.batch.batchId, "batch-unknown");
    assert.equal(result.record.batch.sourceRunUid, "run-unknown");
    assert.equal(result.record.bundle.sources[0].sourceId, "src-unknown");
    assert.equal(result.record.bundle.devices[0].deviceId, "dev-unknown");
    assert.equal(result.record.bundle.devices[0].hostnames.includes(unsafePath), false);
    assert.equal(
      result.record.bundle.devices[0].identityEvidence.some(
        (evidence) => evidence.evidenceId === "ev-secret-marker"
      ),
      false
    );
    assert.equal(
      result.record.bundle.devices[0].identityEvidence.some(
        (evidence) => evidence.value === "raw-id-safe-value" && evidence.evidenceId !== rawScanBody
      ),
      true
    );
    assert.equal(result.record.bundle.devices[0].openPorts[0].product, null);
    assertObservationRegistryOutputSafe(persistedRecord);
    assertObservationRegistryOutputSafe(persistedRegistry);
    assert.doesNotMatch(JSON.stringify(result.record), /nmaprun-host-address|192\.0\.2\.99/);
    assert.doesNotMatch(persistedRegistry, /nmaprun-host-address|192\.0\.2\.99/);
    assert.doesNotMatch(persistedRecord, /synthetic-not-for-output|unknownField|private/);
  });
});

run("observation registry records preserve metadata and classify partial observations", async () => {
  await withTempCwd(async () => {
    const partial = createObservationRegistryBundle({
      runUid: "partial-observation",
      network: "partial-lab",
      includeOptional: false,
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const result = registerObservationBundle(partial, {
      importedAt: "2026-04-01T12:07:00.000Z",
      evaluatedAt: "2026-04-02T00:00:00.000Z",
    });
    const fetched = getObservationById(result.record.registryId, {
      evaluatedAt: "2026-04-02T00:00:00.000Z",
    });
    const listed = listObservations(
      { network: "partial-lab" },
      { evaluatedAt: "2026-04-02T00:00:00.000Z" }
    );

    assert.equal(result.record.freshness.status, "partial");
    assert.equal(result.record.freshness.cadenceStatus, "fresh");
    assert.equal(result.record.coverage.status, "partial");
    assert.ok(result.record.coverage.missingSources.includes("discovery"));
    assert.ok(result.record.coverage.missingSources.includes("hosts_up"));
    assert.equal(result.record.deviceCount, 1);
    assert.deepEqual(result.record.sources, partial.sources);
    assert.deepEqual(result.record.vantage, partial.vantage);
    assert.deepEqual(result.record.batch, partial.batch);
    assert.deepEqual(result.record.coverage.notes, partial.coverage.notes);
    assert.deepEqual(result.record.timeRange, {
      startedAt: partial.batch.startedAt,
      endedAt: partial.batch.endedAt,
      generatedAt: partial.batch.generatedAt,
    });
    assert.ok(fetched);
    assert.equal(fetched.bundle.devices.length, 1);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].freshness.status, "partial");
    assert.equal(listed[0].freshness.cadenceStatus, "fresh");
  });
});

run("observation freshness is deterministic at cadence and grace boundaries", async () => {
  await withTempCwd(async () => {
    const bundle = createObservationRegistryBundle({
      runUid: "freshness-boundary-observation",
      network: "freshness-lab",
      startedAt: "2026-04-01T12:00:00.000Z",
      endedAt: "2026-04-01T12:05:00.000Z",
      generatedAt: "2026-04-01T12:06:00.000Z",
    });
    const cases = [
      {
        name: "before cadence",
        evaluatedAt: "2026-05-01T12:04:59.999Z",
        status: "fresh",
        ageDays: 29,
      },
      {
        name: "at cadence",
        evaluatedAt: "2026-05-01T12:05:00.000Z",
        status: "fresh",
        ageDays: 30,
      },
      {
        name: "after cadence",
        evaluatedAt: "2026-05-01T12:05:00.001Z",
        status: "aging",
        ageDays: 30,
      },
      {
        name: "at grace",
        evaluatedAt: "2026-05-08T12:05:00.000Z",
        status: "aging",
        ageDays: 37,
      },
      {
        name: "after grace",
        evaluatedAt: "2026-05-08T12:05:00.001Z",
        status: "stale",
        ageDays: 37,
      },
    ];

    for (const testCase of cases) {
      const freshness = evaluateObservationFreshness(bundle, {
        evaluatedAt: testCase.evaluatedAt,
      });

      assert.equal(freshness.status, testCase.status, testCase.name);
      assert.equal(freshness.cadenceStatus, testCase.status, testCase.name);
      assert.equal(freshness.observedAt, "2026-04-01T12:05:00.000Z", testCase.name);
      assert.equal(freshness.dueAt, "2026-05-01T12:05:00.000Z", testCase.name);
      assert.equal(freshness.graceEndsAt, "2026-05-08T12:05:00.000Z", testCase.name);
      assert.equal(freshness.ageDays, testCase.ageDays, testCase.name);
    }

    assert.throws(
      () => evaluateObservationFreshness(bundle, { evaluatedAt: "2026-05-01T12:05:00" }),
      (error) =>
        error instanceof ObservationRegistryTimestampError &&
        /explicit offset/.test(error.message)
    );
  });
});

run("observation comparison matches strong MAC identity across changed IP", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-mac-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-aaaaaaaaaaaa",
        ips: ["192.0.2.10"],
        macs: ["02:00:00:00:00:10"],
        hostnames: ["laptop.local"],
        vendors: ["Example Devices"],
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-mac-current",
    observedAt: "2026-05-08T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-bbbbbbbbbbbb",
        ips: ["192.0.2.55"],
        macs: ["02:00:00:00:00:10"],
        hostnames: ["laptop.local"],
        vendors: ["Example Devices"],
        ports: [
          { port: 80, protocol: "tcp", service: "http" },
          { port: 443, protocol: "tcp", service: "https" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const opened = findComparisonEvent(
    result,
    "service-or-port-opened",
    (event) => event.details.currentPort?.port === 443
  );
  const metadata = findComparisonEvent(result, "important-device-metadata-changed");

  assert.equal(findComparisonEvent(result, "new-device-observed"), undefined);
  assert.equal(findComparisonEvent(result, "previously-observed-device-not-observed"), undefined);
  assert.ok(opened);
  assert.equal(opened.confidence, "strong");
  assert.equal(opened.identityEvidence.ruleId, "identity.mac");
  assert.ok(opened.identityEvidence.baselineEvidenceIds.length > 0);
  assert.ok(opened.identityEvidence.currentEvidenceIds.length > 0);
  assert.ok(metadata);
  assert.deepEqual(metadata.details.changedFields, ["ips"]);
});

run("observation comparison links normalized MAC evidence IDs", () => {
  const cases = [
    {
      name: "hyphenated",
      normalizedMac: "02:00:00:00:00:10",
      evidenceMac: "02-00-00-00-00-10",
    },
    {
      name: "uppercase",
      normalizedMac: "aa:bb:cc:dd:ee:10",
      evidenceMac: "AA:BB:CC:DD:EE:10",
    },
    {
      name: "dotted",
      normalizedMac: "aa:bb:cc:dd:ee:11",
      evidenceMac: "aabb.ccdd.ee11",
    },
  ];

  for (const testCase of cases) {
    const baseline = createComparisonBundle({
      observationId: `obs-mac-evidence-${testCase.name}-baseline`,
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: `dev-mac-evidence-${testCase.name}-baseline`,
          ips: ["192.0.2.15"],
          macs: [testCase.normalizedMac],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: `obs-mac-evidence-${testCase.name}-current`,
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: `dev-mac-evidence-${testCase.name}-current`,
          ips: ["192.0.2.16"],
          macs: [testCase.normalizedMac],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });
    baseline.devices[0].identityEvidence = [
      createComparisonEvidence("mac-address", testCase.evidenceMac, "src-1"),
    ];
    current.devices[0].identityEvidence = [
      createComparisonEvidence("mac-address", testCase.evidenceMac, "src-1"),
    ];

    const result = compareObservationBundlesV1(baseline, current);
    const opened = findComparisonEvent(result, "service-or-port-opened");

    assert.ok(opened, testCase.name);
    assert.equal(opened.identityEvidence.ruleId, "identity.mac", testCase.name);
    assert.deepEqual(opened.identityEvidence.values, [testCase.normalizedMac], testCase.name);
    assert.ok(opened.identityEvidence.baselineEvidenceIds.length > 0, testCase.name);
    assert.ok(opened.identityEvidence.currentEvidenceIds.length > 0, testCase.name);
  }
});

run("observation comparison matches stable hashed MAC evidence as strong identity", () => {
  const hashedMac = `sha256:${"a".repeat(64)}`;
  const baseline = createComparisonBundle({
    observationId: "obs-hashed-mac-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-111111111111",
        ips: ["192.0.2.11"],
        hashedMacs: [hashedMac],
        ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-hashed-mac-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-222222222222",
        ips: ["192.0.2.12"],
        hashedMacs: [hashedMac],
        ports: [
          { port: 22, protocol: "tcp", service: "ssh" },
          { port: 8080, protocol: "tcp", service: "http-proxy" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const opened = findComparisonEvent(result, "service-or-port-opened");

  assert.ok(opened);
  assert.equal(opened.confidence, "strong");
  assert.equal(opened.identityEvidence.ruleId, "identity.hashed-mac");
  assert.ok(opened.identityEvidence.values[0].startsWith("hash:"));
  assert.equal(findComparisonEvent(result, "new-device-observed"), undefined);
});

run("observation comparison does not promote an unattested device ID to persistent identity", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-device-id-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "device-kitchen-printer",
        ips: ["192.0.2.120"],
        macs: ["02:00:00:00:01:20"],
        hostnames: ["kitchen-printer.local"],
        vendors: ["Example Printers"],
        ports: [{ port: 9100, protocol: "tcp", service: "jetdirect" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-device-id-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "device-kitchen-printer",
        ips: ["192.0.2.121"],
        macs: ["02:00:00:00:01:21"],
        hostnames: ["kitchen-printer.local"],
        vendors: ["Example Printers"],
        ports: [
          { port: 9100, protocol: "tcp", service: "jetdirect" },
          { port: 443, protocol: "tcp", service: "https" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const uncertain = findComparisonEvent(result, "identity-uncertain-possibly-same-device");

  assert.ok(uncertain);
  assert.equal(uncertain.confidence, "medium");
  assert.equal(uncertain.identityEvidence.ruleId, "identity.hostname-vendor");
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "important-device-metadata-changed"), undefined);
  assert.equal(findComparisonEvent(result, "new-device-observed"), undefined);
  assert.equal(findComparisonEvent(result, "previously-observed-device-not-observed"), undefined);
});

run("observation comparison does not treat IP-like device IDs as persisted identity", () => {
  const ipLikeDeviceIds = [
    "192.168.1.25",
    "10.0.0.14",
    "device-192-168-1-25",
    "dev-192-168-1-25",
    "ip-192-168-1-25",
    "host-192-168-1-25",
    "2001:db8::25",
    "host-fe80::25",
  ];

  for (const deviceId of ipLikeDeviceIds) {
    const baseline = createComparisonBundle({
      observationId: `obs-ip-like-id-baseline-${deviceId}`,
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId,
          ips: ["192.0.2.200"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: `obs-ip-like-id-current-${deviceId}`,
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId,
          ips: ["192.0.2.200"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });

    const result = compareObservationBundlesV1(baseline, current);
    const uncertain = findComparisonEvent(result, "identity-uncertain-possibly-same-device");

    assert.ok(uncertain, deviceId);
    assert.equal(uncertain.confidence, "low", deviceId);
    assert.equal(uncertain.identityEvidence.ruleId, "identity.ip-continuity", deviceId);
    assert.equal(
      result.events.some((event) => event.identityEvidence.ruleId === "identity.persisted-device-id"),
      false,
      deviceId
    );
    assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined, deviceId);
    assertNoConfirmedAndUncertainPairs(result);
  }
});

run("observation comparison keeps IP-like device IDs with changed MAC evidence uncertain", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-ip-like-conflict-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "device-192-168-1-25",
        ips: ["192.168.1.25"],
        macs: ["02:00:00:00:01:25"],
        ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-ip-like-conflict-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "device-192-168-1-25",
        ips: ["192.168.1.25"],
        macs: ["02:00:00:00:01:26"],
        ports: [
          { port: 22, protocol: "tcp", service: "ssh" },
          { port: 3389, protocol: "tcp", service: "ms-wbt-server" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const uncertain = findComparisonEvent(result, "identity-uncertain-possibly-same-device");

  assert.ok(uncertain);
  assert.equal(uncertain.confidence, "low");
  assert.equal(uncertain.identityEvidence.ruleId, "identity.ip-continuity");
  assert.equal(
    result.events.some((event) => event.identityEvidence.ruleId === "identity.persisted-device-id"),
    false
  );
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "service-or-port-closed"), undefined);
  assert.equal(findComparisonEvent(result, "important-device-metadata-changed"), undefined);
  assertNoConfirmedAndUncertainPairs(result);
});
run("observation comparison keeps ambiguous strong MAC evidence uncertain despite weaker identity", () => {
  const { baseline, current } = createAmbiguousMacThenWeakerIdentityComparison();
  const result = compareObservationBundlesV1(baseline, current);
  const uncertainEvents = result.events.filter(
    (event) => event.eventType === "identity-uncertain-possibly-same-device"
  );

  assert.equal(result.guardrails.some((guardrail) => guardrail.code === "ambiguous-identity"), true);
  assert.equal(uncertainEvents.length, 2);
  assert.equal(uncertainEvents.every((event) => event.identityEvidence.ruleId === "identity.mac"), true);
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "service-or-port-closed"), undefined);
  assert.equal(findComparisonEvent(result, "important-device-metadata-changed"), undefined);
  assert.equal(findComparisonEvent(result, "new-device-observed"), undefined);
  assert.equal(findComparisonEvent(result, "previously-observed-device-not-observed"), undefined);
  assertNoConfirmedAndUncertainPairs(result);
});

run("observation comparison keeps ambiguous hashed MAC evidence uncertain despite weaker identity", () => {
  const { baseline, current } = createAmbiguousMacThenWeakerIdentityComparison({ hashed: true });
  const result = compareObservationBundlesV1(baseline, current);
  const uncertainEvents = result.events.filter(
    (event) => event.eventType === "identity-uncertain-possibly-same-device"
  );

  assert.equal(result.guardrails.some((guardrail) => guardrail.code === "ambiguous-identity"), true);
  assert.equal(uncertainEvents.length, 2);
  assert.equal(
    uncertainEvents.every((event) => event.identityEvidence.ruleId === "identity.hashed-mac"),
    true
  );
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "important-device-metadata-changed"), undefined);
  assertNoConfirmedAndUncertainPairs(result);
});
run("observation comparison keeps unique hostname vendor evidence uncertain", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-hostname-vendor-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-131313131313",
        hostnames: ["shared-printer.local"],
        vendors: ["Example Printers"],
        ports: [{ port: 9100, protocol: "tcp", service: "jetdirect" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-hostname-vendor-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-141414141414",
        hostnames: ["shared-printer.local"],
        vendors: ["Example Printers"],
        ports: [
          { port: 9100, protocol: "tcp", service: "jetdirect" },
          { port: 443, protocol: "tcp", service: "https" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const uncertain = findComparisonEvent(result, "identity-uncertain-possibly-same-device");

  assert.ok(uncertain);
  assert.equal(uncertain.confidence, "medium");
  assert.equal(uncertain.identityEvidence.ruleId, "identity.hostname-vendor");
  assert.deepEqual(comparisonEventTypes(result), ["identity-uncertain-possibly-same-device"]);
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "service-or-port-closed"), undefined);
  assert.equal(findComparisonEvent(result, "important-device-metadata-changed"), undefined);
  assertNoConfirmedAndUncertainPairs(result);
});

run("observation comparison keeps hostname vendor evidence with different MAC and IP uncertain", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-hostname-vendor-different-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-151515151515",
        ips: ["192.0.2.150"],
        macs: ["02:00:00:00:01:50"],
        hostnames: ["reused-label.local"],
        vendors: ["Example Devices"],
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-hostname-vendor-different-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-161616161616",
        ips: ["192.0.2.151"],
        macs: ["02:00:00:00:01:51"],
        hostnames: ["reused-label.local"],
        vendors: ["Example Devices"],
        ports: [
          { port: 80, protocol: "tcp", service: "http" },
          { port: 8443, protocol: "tcp", service: "https-alt" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const uncertain = findComparisonEvent(result, "identity-uncertain-possibly-same-device");

  assert.ok(uncertain);
  assert.equal(uncertain.confidence, "medium");
  assert.equal(uncertain.identityEvidence.ruleId, "identity.hostname-vendor");
  assert.deepEqual(comparisonEventTypes(result), ["identity-uncertain-possibly-same-device"]);
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "service-or-port-closed"), undefined);
  assert.equal(findComparisonEvent(result, "important-device-metadata-changed"), undefined);
  assertNoConfirmedAndUncertainPairs(result);
});
run("observation comparison reports service open and closed changes on confirmed matches", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-port-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-121212121212",
        ips: ["192.0.2.30"],
        macs: ["02:00:00:00:00:30"],
        ports: [
          { port: 22, protocol: "tcp", service: "ssh" },
          { port: 80, protocol: "tcp", service: "http" },
        ],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-port-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-343434343434",
        ips: ["192.0.2.30"],
        macs: ["02:00:00:00:00:30"],
        ports: [
          { port: 80, protocol: "tcp", service: "http" },
          { port: 443, protocol: "tcp", service: "https" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const opened = findComparisonEvent(
    result,
    "service-or-port-opened",
    (event) => event.details.currentPort?.port === 443
  );
  const closed = findComparisonEvent(
    result,
    "service-or-port-closed",
    (event) => event.details.baselinePort?.port === 22
  );

  assert.ok(opened);
  assert.ok(closed);
  assert.equal(opened.rule.version, "psec.observation-comparison.v1");
  assert.equal(opened.rule.deterministic, true);
  assert.equal(
    result.guardrails.some((guardrail) => guardrail.code === "port-coverage-incomplete"),
    false
  );
});

run("observation comparison suppresses closed ports without current port coverage", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-port-current-missing-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-port-current-missing-baseline",
        ips: ["192.0.2.31"],
        macs: ["02:00:00:00:00:31"],
        ports: [
          { port: 22, protocol: "tcp", service: "ssh" },
          { port: 80, protocol: "tcp", service: "http" },
        ],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-port-current-missing-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    missingSources: ["ports"],
    devices: [
      {
        deviceId: "dev-port-current-missing-current",
        ips: ["192.0.2.31"],
        macs: ["02:00:00:00:00:31"],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);

  assert.equal(findComparisonEvent(result, "service-or-port-closed"), undefined);
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(
    result.guardrails.some((guardrail) => guardrail.code === "port-coverage-incomplete"),
    true
  );
});

run("observation comparison suppresses opened ports without baseline port coverage", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-port-baseline-missing-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    missingSources: ["ports"],
    devices: [
      {
        deviceId: "dev-port-baseline-missing-baseline",
        ips: ["192.0.2.32"],
        macs: ["02:00:00:00:00:32"],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-port-baseline-missing-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-port-baseline-missing-current",
        ips: ["192.0.2.32"],
        macs: ["02:00:00:00:00:32"],
        ports: [{ port: 443, protocol: "tcp", service: "https" }],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);

  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "service-or-port-closed"), undefined);
  assert.equal(
    result.guardrails.some((guardrail) => guardrail.code === "port-coverage-incomplete"),
    true
  );
});

run("observation comparison does not merge IP reuse without stronger identity", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-ip-reuse-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-abababababab",
        ips: ["192.0.2.40"],
        macs: ["02:00:00:00:00:40"],
        ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-ip-reuse-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-cdcdcdcdcdcd",
        ips: ["192.0.2.40"],
        macs: ["02:00:00:00:00:41"],
        ports: [{ port: 3389, protocol: "tcp", service: "ms-wbt-server" }],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const uncertain = findComparisonEvent(result, "identity-uncertain-possibly-same-device");

  assert.ok(uncertain);
  assert.equal(uncertain.confidence, "low");
  assert.equal(uncertain.identityEvidence.ruleId, "identity.ip-continuity");
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "service-or-port-closed"), undefined);
  assert.equal(findComparisonEvent(result, "new-device-observed"), undefined);
  assert.equal(findComparisonEvent(result, "previously-observed-device-not-observed"), undefined);
});

run("observation comparison leaves IP-only continuity as uncertain", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-ip-only-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-eeeeeeeeeeee",
        ips: ["192.0.2.50"],
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-ip-only-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-ffffffffffff",
        ips: ["192.0.2.50"],
        ports: [{ port: 443, protocol: "tcp", service: "https" }],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const uncertain = findComparisonEvent(result, "identity-uncertain-possibly-same-device");

  assert.ok(uncertain);
  assert.equal(uncertain.confidence, "low");
  assert.deepEqual(comparisonEventTypes(result), ["identity-uncertain-possibly-same-device"]);
});

run("observation comparison emits uncertain events for ambiguous hostname vendor identity", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-ambiguous-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-010101010101",
        ips: ["192.0.2.61"],
        hostnames: ["printer.local"],
        vendors: ["Example Printers"],
      },
      {
        deviceId: "dev-020202020202",
        ips: ["192.0.2.62"],
        hostnames: ["printer.local"],
        vendors: ["Example Printers"],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-ambiguous-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-030303030303",
        ips: ["192.0.2.63"],
        hostnames: ["printer.local"],
        vendors: ["Example Printers"],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);
  const uncertainEvents = result.events.filter(
    (event) => event.eventType === "identity-uncertain-possibly-same-device"
  );

  assert.equal(result.guardrails.some((guardrail) => guardrail.code === "ambiguous-identity"), true);
  assert.equal(uncertainEvents.length, 2);
  assert.equal(uncertainEvents.every((event) => event.confidence === "medium"), true);
  assert.equal(findComparisonEvent(result, "service-or-port-opened"), undefined);
  assert.equal(findComparisonEvent(result, "new-device-observed"), undefined);
});

run("observation comparison suppresses absent-device events when current coverage is partial", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-partial-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-101010101010",
        ips: ["192.0.2.70"],
        macs: ["02:00:00:00:00:70"],
      },
      {
        deviceId: "dev-202020202020",
        ips: ["192.0.2.71"],
        macs: ["02:00:00:00:00:71"],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-partial-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    partial: true,
    missingSources: ["discovery", "hosts_up"],
    devices: [
      {
        deviceId: "dev-303030303030",
        ips: ["192.0.2.70"],
        macs: ["02:00:00:00:00:70"],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current);

  assert.equal(result.guardrails.some((guardrail) => guardrail.code === "partial-coverage"), true);
  assert.equal(findComparisonEvent(result, "previously-observed-device-not-observed"), undefined);
});

run("observation comparison uses exact stale threshold boundary", () => {
  const cases = [
    {
      id: "exact-threshold",
      name: "exact threshold",
      evaluatedAt: "2026-06-07T10:00:00.000Z",
      expectedBaselineStatus: "fresh",
      expectStaleGuardrail: false,
    },
    {
      id: "after-threshold",
      name: "one millisecond after threshold",
      evaluatedAt: "2026-06-07T10:00:00.001Z",
      expectedBaselineStatus: "stale",
      expectStaleGuardrail: true,
    },
  ];

  for (const testCase of cases) {
    const baseline = createComparisonBundle({
      observationId: `obs-stale-boundary-${testCase.id}-baseline`,
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: `dev-stale-boundary-${testCase.id}-baseline`,
          ips: ["192.0.2.75"],
          macs: ["02:00:00:00:00:75"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: `obs-stale-boundary-${testCase.id}-current`,
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: `dev-stale-boundary-${testCase.id}-current`,
          ips: ["192.0.2.76"],
          macs: ["02:00:00:00:00:75"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });

    const result = compareObservationBundlesV1(baseline, current, {
      evaluatedAt: testCase.evaluatedAt,
      staleAfterDays: 37,
    });
    const opened = findComparisonEvent(result, "service-or-port-opened");

    assert.equal(
      result.coverageContext.baseline.freshness.status,
      testCase.expectedBaselineStatus,
      testCase.name
    );
    assert.equal(result.coverageContext.baseline.freshness.ageDays, 37, testCase.name);
    assert.equal(result.coverageContext.current.freshness.status, "fresh", testCase.name);
    assert.equal(
      result.guardrails.some((guardrail) => guardrail.code === "stale-data"),
      testCase.expectStaleGuardrail,
      testCase.name
    );
    assert.ok(opened, testCase.name);
    assert.equal(
      opened.coverageContext.baseline.freshness.status,
      testCase.expectedBaselineStatus,
      testCase.name
    );
  }
});

run("observation comparison marks stale observations in guardrails and event coverage context", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-stale-baseline",
    observedAt: "2026-01-01T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-404040404040",
        ips: ["192.0.2.80"],
        macs: ["02:00:00:00:00:80"],
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ],
  });
  const current = createComparisonBundle({
    observationId: "obs-stale-current",
    observedAt: "2026-01-02T10:00:00.000Z",
    devices: [
      {
        deviceId: "dev-505050505050",
        ips: ["192.0.2.80"],
        macs: ["02:00:00:00:00:80"],
        ports: [
          { port: 80, protocol: "tcp", service: "http" },
          { port: 443, protocol: "tcp", service: "https" },
        ],
      },
    ],
  });

  const result = compareObservationBundlesV1(baseline, current, {
    evaluatedAt: "2026-03-15T00:00:00.000Z",
    staleAfterDays: 37,
  });
  const opened = findComparisonEvent(result, "service-or-port-opened");

  assert.equal(result.guardrails.some((guardrail) => guardrail.code === "stale-data"), true);
  assert.ok(opened);
  assert.equal(opened.coverageContext.baseline.freshness.status, "stale");
  assert.equal(opened.coverageContext.current.freshness.status, "stale");
});

run("observation comparison invalid comparisons fail clearly", () => {
  const baseline = createComparisonBundle({
    observationId: "obs-invalid-baseline",
    observedAt: "2026-05-01T10:00:00.000Z",
    devices: [],
  });
  const current = createComparisonBundle({
    observationId: "obs-invalid-current",
    observedAt: "2026-05-02T10:00:00.000Z",
    devices: [],
  });

  assert.throws(
    () =>
      compareObservationBundlesV1(
        baseline,
        createComparisonBundle({
          observationId: "obs-different-site",
          observedAt: "2026-05-02T10:00:00.000Z",
          siteId: "site-other-lab",
          devices: [],
        })
      ),
    (error) => isObservationComparisonError(error) && error.code === "different_sites"
  );

  assert.throws(
    () => compareObservationBundlesV1(baseline, baseline),
    (error) => isObservationComparisonError(error) && error.code === "identical_observations"
  );

  const missingTimestampBaseline = createComparisonBundle({
    observationId: "obs-missing-time-baseline",
    devices: [],
  });
  missingTimestampBaseline.batch.startedAt = null;
  missingTimestampBaseline.batch.endedAt = null;
  missingTimestampBaseline.batch.generatedAt = null;
  assert.throws(
    () => compareObservationBundlesV1(missingTimestampBaseline, current),
    (error) => isObservationComparisonError(error) && error.code === "missing_timestamp"
  );

  assert.throws(
    () => compareObservationBundlesV1(current, baseline),
    (error) => isObservationComparisonError(error) && error.code === "reversed_chronology"
  );

  assert.throws(
    () =>
      compareObservationBundlesV1(
        baseline,
        createComparisonBundle({
          observationId: "obs-same-time-current",
          observedAt: "2026-05-01T10:00:00.000Z",
          devices: [],
        })
      ),
    (error) => isObservationComparisonError(error) && error.code === "ambiguous_comparison"
  );
});

run("packet highway analysis saves as supplemental metadata-only observation", async () => {
  await withTempCwd(async () => {
    const capture = createPacketHighwayCapture({ truncated: true, unsafeText: true });
    const bundle = adaptPacketHighwayCaptureToObservationBundleV1({
      capture,
      site: {
        siteId: "site-packet-highway-lab",
        networkName: "packet-highway-lab",
        networkScope: "192.0.2.0/24",
      },
      collectionVantage: "this-computer",
    });

    assert.equal(bundle.collector.kind, "packet-highway-analysis");
    assert.equal(bundle.sources[0].kind, "packet-highway-analysis");
    assert.equal(bundle.vantage.type, "packet-highway-this-computer");
    assert.equal(bundle.coverage.status, "minimal");
    assert.equal(bundle.batch.partial, true);
    assert.equal(bundle.devices.every((device) => device.openPorts.length === 0), true);
    assert.ok(bundle.supplementalEvidence?.[0].packetHighway);
    assert.equal(bundle.supplementalEvidence[0].packetHighway.capture.meta.truncated, true);
    assert.match(bundle.coverage.notes.join("\n"), /Partial analysis flag/);

    const result = registerObservationBundle(bundle, {
      importedAt: "2026-05-04T11:01:00.000Z",
      evaluatedAt: "2026-05-04T11:02:00.000Z",
    });
    const reopened = getObservationById(result.record.registryId, {
      evaluatedAt: "2026-05-04T11:02:00.000Z",
    });

    assert.ok(reopened);
    assert.equal(reopened.bundle.vantage.type, "packet-highway-this-computer");
    assert.equal(reopened.bundle.batch.partial, true);
    assert.equal(reopened.bundle.supplementalEvidence[0].packetHighway.capture.meta.truncated, true);
    assert.match(
      reopened.bundle.supplementalEvidence[0].packetHighway.limitations.join("\n"),
      /Endpoint capture/
    );

    const persisted = readObservationRegistryFilesText();
    assert.match(persisted, /packet-highway-analysis/);
    assert.doesNotMatch(persisted, /raw packet payload|<packet>|pcap global header|BEGIN PRIVATE KEY/);
    assert.doesNotMatch(persisted, /api_key=sk-|C:\\Users\\user|\/tmp\/raw-capture/);
  });
});

run("packet highway save API returns a reopenable supplemental visual evidence link", async () => {
  const packetHighwayObservationRoute = await import("../src/app/api/packet-highway/observations/route.ts");
  const observationRoute = await import("../src/app/api/observations/[registryId]/route.ts");

  await withTempCwd(async () => {
    const response = await packetHighwayObservationRoute.POST(
      createRawJsonRequest(
        "/api/packet-highway/observations",
        "POST",
        JSON.stringify({
          capture: createPacketHighwayCapture({ truncated: true }),
          site: {
            networkName: "packet-highway-api-lab",
            networkScope: "192.0.2.0/24",
          },
          collectionVantage: "gateway-router",
        })
      )
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.match(body.packetHighwayHref, /^\/packet-highway\?observation=obs_/);
    assert.equal(body.observation.vantage.type, "packet-highway-gateway-router");

    const registryId = body.observation.registryId;
    const getResponse = await observationRoute.GET(
      new Request(`http://localhost/api/observations/${registryId}`),
      { params: Promise.resolve({ registryId }) }
    );
    const getBody = await getResponse.json();

    assert.equal(getResponse.status, 200);
    assert.equal(getBody.success, true);
    assert.equal(getBody.observation.bundle.supplementalEvidence[0].kind, "packet-highway-analysis");
    assert.equal(
      getBody.observation.bundle.supplementalEvidence[0].packetHighway.capture.meta.format,
      "fixture"
    );
  });
});

run("packet highway save API rejects malformed network names with safe validation errors", async () => {
  const packetHighwayObservationRoute = await import("../src/app/api/packet-highway/observations/route.ts");

  await withTempCwd(async () => {
    for (const networkName of [42, ["lab"], { name: "lab" }, null, undefined]) {
      const response = await packetHighwayObservationRoute.POST(
        createRawJsonRequest(
          "/api/packet-highway/observations",
          "POST",
          JSON.stringify({
            capture: createPacketHighwayCapture(),
            site: networkName === undefined ? {} : { networkName },
            collectionVantage: "this-computer",
          })
        )
      );
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.match(body.error, /Choose a site or network name/);
    }

    const validResponse = await packetHighwayObservationRoute.POST(
      createRawJsonRequest(
        "/api/packet-highway/observations",
        "POST",
        JSON.stringify({
          capture: createPacketHighwayCapture(),
          site: { networkName: "  packet-highway-valid-lab  " },
          collectionVantage: "this-computer",
        })
      )
    );
    const validBody = await validResponse.json();

    assert.equal(validResponse.status, 200);
    assert.equal(validBody.success, true);
    assert.equal(validBody.observation.networkName, "packet-highway-valid-lab");
  });
});

run("network activity links packet highway evidence without using it as primary evidence", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-ph-primary-baseline",
      siteId: "site-ph-activity",
      networkName: "ph-activity-lab",
      observedAt: "2026-05-04T09:00:00.000Z",
      devices: [
        {
          deviceId: "ph-activity-device-baseline",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:34:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-ph-primary-current",
      siteId: "site-ph-activity",
      networkName: "ph-activity-lab",
      observedAt: "2026-05-04T10:00:00.000Z",
      devices: [
        {
          deviceId: "ph-activity-device-current",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:34:10"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });
    const packetHighway = adaptPacketHighwayCaptureToObservationBundleV1({
      capture: createPacketHighwayCapture({ generatedAt: "2026-05-04T11:00:00.000Z" }),
      site: {
        networkName: "ph-activity-lab",
        networkScope: "192.168.50.0/24",
      },
      collectionVantage: "mirror-tap",
    });

    assert.notEqual(packetHighway.site.siteId, "site-ph-activity");

    registerObservationBundle(baseline, {
      importedAt: "2026-05-04T09:05:00.000Z",
      evaluatedAt: "2026-05-04T12:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-04T10:05:00.000Z",
      evaluatedAt: "2026-05-04T12:00:00.000Z",
    });
    registerObservationBundle(packetHighway, {
      importedAt: "2026-05-04T11:05:00.000Z",
      evaluatedAt: "2026-05-04T12:00:00.000Z",
    });

    const activity = buildNetworkActivity({ evaluatedAt: "2026-05-04T12:00:00.000Z" });
    const supplementalText = JSON.stringify(activity.supplementalEvidence);
    const event = activity.events.find((item) => item.type === "service-or-port-opened");

    assert.equal(activity.status, "ready");
    assert.equal(activity.latestObservation.observationId, "obs-ph-primary-current");
    assert.equal(activity.period.currentObservationId, "obs-ph-primary-current");
    assert.equal(activity.supplementalEvidence.length, 1);
    assert.match(activity.supplementalEvidence[0].href, /^\/packet-highway\?observation=obs_/);
    assert.match(activity.supplementalEvidence[0].vantageLabel, /mirror\/tap/);
    assert.ok(event);
    assert.equal(event.supplementalEvidence.length, 1);
    assert.match(event.supplementalEvidence[0].summary, /Supplemental traffic visualization/);
    assert.match(activity.limitations.map((limitation) => limitation.message).join("\n"), /supplemental context only/);
    assert.doesNotMatch(supplementalText, /caused|supersede|primary evidence/i);
  });
});
run("network activity guided scenario is synthetic, evidence-linked, and redacted by default", () => {
  const activity = buildSyntheticNetworkActivityScenario({
    evaluatedAt: "2026-06-19T16:00:00.000Z",
  });

  assert.equal(activity.status, "ready");
  assert.equal(activity.source, "synthetic-guided-scenario");
  assert.ok(activity.scenario);
  assert.ok(activity.period);
  assert.ok(activity.events.length >= 5);
  assert.equal(activity.reviewCount, activity.events.length);

  const eventTypes = new Set(activity.events.map((event) => event.type));
  assert.ok(eventTypes.has("new-device-observed"));
  assert.ok(eventTypes.has("previously-observed-device-not-observed"));
  assert.ok(eventTypes.has("service-or-port-opened"));
  assert.ok(eventTypes.has("service-or-port-closed"));
  assert.ok(eventTypes.has("important-device-metadata-changed"));

  for (const event of activity.events) {
    assert.equal(event.periodHref, "#comparison-period");
    assert.match(event.evidenceId, /^evidence-chg-/);
  }

  const publicText = activity.events
    .map((event) =>
      [
        event.title,
        event.summary,
        event.reviewReason,
        event.confidenceLabel,
        event.evidenceSummary,
      ].join(" ")
    )
    .join("\n");
  assert.doesNotMatch(publicText, /192\.0\.2\.|02:00:00|00:00:00|\b(?:22|443|9100)\b/);
  assert.doesNotMatch(publicText, /malicious|malware|hacked|attack/i);

  const technicalText = JSON.stringify(activity.events.map((event) => event.technicalEvidence));
  assert.match(technicalText, /192\.0\.2\./);
  assert.match(technicalText, /02:00:00/);
  assert.match(technicalText, /\b443\b/);
});

run("network activity chooses the latest valid same-site observation comparison", async () => {
  await withTempCwd(async () => {
    registerObservationBundle(
      createComparisonBundle({
        observationId: "obs-other-site",
        siteId: "site-other-activity",
        networkName: "other-activity-lab",
        observedAt: "2026-05-02T10:00:00.000Z",
        devices: [
          {
            deviceId: "other-device",
            ips: ["192.0.2.90"],
            macs: ["02:00:00:00:00:90"],
          },
        ],
      }),
      { importedAt: "2026-05-02T10:05:00.000Z", evaluatedAt: "2026-05-05T00:00:00.000Z" }
    );
    registerObservationBundle(
      createComparisonBundle({
        observationId: "obs-activity-baseline",
        siteId: "site-activity-lab",
        networkName: "activity-lab",
        observedAt: "2026-05-01T10:00:00.000Z",
        devices: [
          {
            deviceId: "activity-laptop",
            ips: ["192.0.2.10"],
            macs: ["02:00:00:00:00:10"],
            ports: [{ port: 80, protocol: "tcp", service: "http" }],
          },
        ],
      }),
      { importedAt: "2026-05-01T10:05:00.000Z", evaluatedAt: "2026-05-05T00:00:00.000Z" }
    );
    registerObservationBundle(
      createComparisonBundle({
        observationId: "obs-activity-current",
        siteId: "site-activity-lab",
        networkName: "activity-lab",
        observedAt: "2026-05-04T10:00:00.000Z",
        devices: [
          {
            deviceId: "activity-laptop",
            ips: ["192.0.2.11"],
            macs: ["02:00:00:00:00:10"],
            ports: [
              { port: 80, protocol: "tcp", service: "http" },
              { port: 443, protocol: "tcp", service: "https" },
            ],
          },
        ],
      }),
      { importedAt: "2026-05-04T10:05:00.000Z", evaluatedAt: "2026-05-05T00:00:00.000Z" }
    );

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-05-05T00:00:00.000Z",
    });

    assert.equal(activity.status, "ready");
    assert.equal(activity.site.networkName, "activity-lab");
    assert.equal(activity.period.currentObservationId, "obs-activity-current");
    assert.equal(activity.latestObservation.observationId, "obs-activity-current");
    assert.ok(activity.events.some((event) => event.type === "service-or-port-opened"));
    assert.ok(activity.events.some((event) => event.type === "important-device-metadata-changed"));
  });
});

run("network activity preserves comparison order for same-priority events", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-order-baseline",
      siteId: "site-order-activity",
      networkName: "order-activity-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "order-device-baseline",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-order-current",
      siteId: "site-order-activity",
      networkName: "order-activity-lab",
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: "order-device-current",
          ips: ["192.0.2.20"],
          macs: ["02:00:00:00:00:10"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });
    const baselineRecord = registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    }).record;
    const currentRecord = registerObservationBundle(current, {
      importedAt: "2026-05-02T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    }).record;
    const comparison = compareObservationBundlesV1(baselineRecord.bundle, currentRecord.bundle, {
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    const evaluation = evaluateEvidenceAwareComparison(
      baselineRecord.bundle,
      currentRecord.bundle,
      { evaluatedAt: "2026-05-03T00:00:00.000Z" }
    );
    assert.ok(evaluation.comparison);

    assert.deepEqual(comparisonEventTypes(comparison), [
      "service-or-port-opened",
      "important-device-metadata-changed",
    ]);

    evaluation.comparison.events = comparison.events.map((event, index) => ({
      ...event,
      eventId: index === 0 ? "chg-z-preserve-first" : "chg-a-preserve-second",
    }));
    const incomingEventIds = evaluation.comparison.events.map((event) => event.eventId);
    assert.ok(
      incomingEventIds[0].localeCompare(incomingEventIds[1]) > 0,
      "fixture must fail if same-priority events fall back to eventId sorting"
    );

    const activity = shapeNetworkActivityComparison({
      baseline: baselineRecord,
      current: currentRecord,
      evaluation,
      generatedAt: "2026-05-03T00:00:00.000Z",
      source: "registry",
      availableObservationCount: 2,
    });

    assert.deepEqual(activity.events.map((event) => event.eventId), incomingEventIds);
    assert.deepEqual(
      activity.events.map((event) => event.type),
      evaluation.comparison.events.map((event) => event.eventType)
    );
    assert.equal(
      activity.events.every((event) => event.workflowPriority.level === "normal"),
      true
    );
  });
});

run("network activity states cover empty, one-observation, and no-change cases truthfully", async () => {
  await withTempCwd(async () => {
    const empty = buildNetworkActivity({ evaluatedAt: "2026-05-05T00:00:00.000Z" });
    assert.equal(empty.status, "empty");
    assert.match(empty.summary, /No observations/);
    assert.equal(empty.reviewCount, 0);

    registerObservationBundle(
      createComparisonBundle({
        observationId: "obs-activity-single",
        siteId: "site-single-activity",
        networkName: "single-activity-lab",
        observedAt: "2026-05-01T10:00:00.000Z",
        devices: [],
      }),
      { importedAt: "2026-05-01T10:05:00.000Z", evaluatedAt: "2026-05-05T00:00:00.000Z" }
    );

    const oneObservation = buildNetworkActivity({
      evaluatedAt: "2026-05-05T00:00:00.000Z",
    });
    assert.equal(oneObservation.status, "one-observation");
    assert.match(oneObservation.summary, /requires at least two observations/);
  });

  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-no-change-baseline",
      siteId: "site-no-change-activity",
      networkName: "no-change-activity-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "no-change-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-no-change-current",
      siteId: "site-no-change-activity",
      networkName: "no-change-activity-lab",
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: "no-change-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-02T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });

    assert.equal(activity.status, "ready");
    assert.equal(
      activity.events.some((event) =>
        event.type === "previously-observed-device-not-observed" ||
        event.type === "service-or-port-closed"
      ),
      false
    );
    assert.equal(activity.reviewCount, 0);
    assert.match(activity.summary, /No supported change events/);
    assert.match(activity.summary, /does not support a no-change or stable-baseline conclusion/);
  });
});

run("network activity surfaces partial and stale limitations near no-change results", async () => {
  await withTempCwd(async () => {
    registerObservationBundle(
      createComparisonBundle({
        observationId: "obs-limited-baseline",
        siteId: "site-limited-activity",
        networkName: "limited-activity-lab",
        observedAt: "2026-01-01T10:00:00.000Z",
        devices: [
          {
            deviceId: "limited-device",
            ips: ["192.0.2.10"],
            macs: ["02:00:00:00:00:10"],
            ports: [{ port: 80, protocol: "tcp", service: "http" }],
          },
        ],
      }),
      { importedAt: "2026-01-01T10:05:00.000Z", evaluatedAt: "2026-03-15T00:00:00.000Z" }
    );
    registerObservationBundle(
      createComparisonBundle({
        observationId: "obs-limited-current",
        siteId: "site-limited-activity",
        networkName: "limited-activity-lab",
        observedAt: "2026-01-02T10:00:00.000Z",
        missingSources: ["ports", "hosts_up"],
        devices: [
          {
            deviceId: "limited-device",
            ips: ["192.0.2.10"],
            macs: ["02:00:00:00:00:10"],
          },
        ],
      }),
      { importedAt: "2026-01-02T10:05:00.000Z", evaluatedAt: "2026-03-15T00:00:00.000Z" }
    );

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-03-15T00:00:00.000Z",
    });
    const limitationCodes = new Set(activity.limitations.map((limitation) => limitation.code));
    const limitationText = activity.limitations.map((limitation) => limitation.message).join("\n");

    assert.equal(activity.status, "insufficient-evidence");
    assert.equal(
      activity.events.some((event) =>
        event.type === "previously-observed-device-not-observed" ||
        event.type === "service-or-port-closed"
      ),
      false
    );
    assert.ok(limitationCodes.has("partial-coverage"));
    assert.ok(limitationCodes.has("port-coverage-incomplete"));
    assert.ok(limitationCodes.has("stale-data"));
    assert.ok(limitationCodes.has("current-missing-sources"));
    assert.match(limitationText, /missing port scan, host-up list/);
    assert.doesNotMatch(activity.summary, /all clear/i);
  });
});

run("network statement uses weekly title only when observations span the requested week", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-statement-week-baseline",
      siteId: "site-statement-week",
      networkName: "statement-week-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "statement-week-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-statement-week-current",
      siteId: "site-statement-week",
      networkName: "statement-week-lab",
      observedAt: "2026-05-07T10:00:00.000Z",
      devices: [
        {
          deviceId: "statement-week-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });

    registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-07T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });

    const statement = buildNetworkStatement({
      siteId: "site-statement-week",
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-07T23:59:59.999Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    const markdown = renderNetworkStatementMarkdown(statement);
    const coverageIndex = statement.sections.findIndex((section) => section.id === "coverage-vantage");
    const freshnessIndex = statement.sections.findIndex((section) => section.id === "freshness");
    const cannotIndex = statement.sections.findIndex((section) => section.id === "cannot-conclude");

    assert.equal(statement.title, "Weekly Network Statement");
    assert.equal(statement.selectedPeriod.weeklyTitleSupported, true);
    assert.equal(statement.coverageSummary.primaryObservationCount, 2);
    assert.equal(statement.coverageSummary.comparisonCount, 1);
    assert.ok(coverageIndex >= 0 && coverageIndex < freshnessIndex);
    assert.ok(cannotIndex > freshnessIndex);
    assert.match(statementText(statement), /Collection vantage represented/);
    assert.match(statementText(statement), /What cannot be concluded|cannot prove/);
    assertMarkdownContainsStatementItems(statement, markdown);
    assertStatementExportSafe(markdown);
  });
});

run("network statement keeps stale and partial no-change periods bounded", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-statement-limited-baseline",
      siteId: "site-statement-limited",
      networkName: "statement-limited-lab",
      observedAt: "2026-01-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "statement-limited-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-statement-limited-current",
      siteId: "site-statement-limited",
      networkName: "statement-limited-lab",
      observedAt: "2026-01-07T10:00:00.000Z",
      missingSources: ["ports", "hosts_up"],
      devices: [
        {
          deviceId: "statement-limited-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
        },
      ],
    });

    registerObservationBundle(baseline, {
      importedAt: "2026-01-01T10:05:00.000Z",
      evaluatedAt: "2026-03-15T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-01-07T10:05:00.000Z",
      evaluatedAt: "2026-03-15T00:00:00.000Z",
    });

    const statement = buildNetworkStatement({
      siteId: "site-statement-limited",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-07T23:59:59.999Z",
      evaluatedAt: "2026-03-15T00:00:00.000Z",
    });
    const text = statementText(statement);

    assert.equal(statement.coverageSummary.hasPartialCoverage, true);
    assert.equal(statement.coverageSummary.hasStaleEvidence, true);
    assert.match(text, /Coverage gaps reported: .*host-up list.*port scan/);
    assert.match(text, /Evidence freshness counts: .*stale|Evidence freshness counts: .*partial/);
    assert.match(text, /does not establish complete safety|prevent any complete-safety conclusion/);
    assert.doesNotMatch(text, /all clear|all-clear/i);
    assert.match(statementSection(statement, "cannot-conclude").items.map((item) => item.text).join("\n"), /cannot prove/);
  });
});

run("network statement reports change categories and unresolved user responses", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-statement-change-baseline",
      siteId: "site-statement-change",
      networkName: "statement-change-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "family-laptop",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          hostnames: ["family-laptop.local"],
          vendors: ["Example Devices"],
          ports: [
            { port: 22, protocol: "tcp", service: "ssh" },
            { port: 80, protocol: "tcp", service: "http" },
          ],
        },
        {
          deviceId: "office-printer",
          ips: ["192.0.2.20"],
          macs: ["02:00:00:00:00:20"],
          ports: [{ port: 9100, protocol: "tcp", service: "jetdirect" }],
        },
        {
          deviceId: "guest-speaker-baseline",
          ips: ["192.0.2.50"],
          hostnames: ["guest-speaker.local"],
          vendors: ["Example Audio"],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-statement-change-current",
      siteId: "site-statement-change",
      networkName: "statement-change-lab",
      observedAt: "2026-05-07T10:00:00.000Z",
      devices: [
        {
          deviceId: "family-laptop",
          ips: ["192.0.2.14"],
          macs: ["02:00:00:00:00:10"],
          hostnames: ["family-laptop.local", "family-laptop-wifi.local"],
          vendors: ["Example Devices"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
        {
          deviceId: "guest-tablet",
          ips: ["192.0.2.30"],
          macs: ["02:00:00:00:00:30"],
          hostnames: ["guest-tablet.local"],
          vendors: ["Example Mobile"],
        },
        {
          deviceId: "guest-speaker-current",
          ips: ["192.0.2.50"],
          hostnames: ["guest-speaker.local"],
          vendors: ["Example Audio"],
        },
      ],
    });

    upsertDeviceResponse(
      createDeviceResponseTargetForBundleDevice(current, 0),
      "investigate",
      "Laptop review",
      { now: "2026-05-07T11:00:00.000Z" }
    );
    upsertDeviceResponse(
      createDeviceResponseTargetForBundleDevice(current, 1),
      "not_sure",
      "Visitor tablet",
      { now: "2026-05-07T11:05:00.000Z" }
    );
    registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-07T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });

    const statement = buildNetworkStatement({
      siteId: "site-statement-change",
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-07T23:59:59.999Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    const changedText = statementSection(statement, "changed").items.map((item) => item.text).join("\n");
    const reviewText = statementSection(statement, "needs-review").items.map((item) => item.text).join("\n");
    const unresolvedText = statementSection(statement, "unresolved-responses").items.map((item) => item.text).join("\n");

    assert.doesNotMatch(changedText, /New device observed/);
    assert.match(changedText, /Device identity uncertain/);
    assert.doesNotMatch(changedText, /Previously observed device not seen/);
    assert.doesNotMatch(changedText, /Service no longer observed/);
    assert.match(changedText, /Device metadata changed/);
    assert.doesNotMatch(reviewText, /user statement only/i);
    assert.match(unresolvedText, /No unresolved/);
    assertStatementExportSafe(renderNetworkStatementMarkdown(statement));
  });
});

run("network statement downgrades insufficient week coverage and labels Packet Highway supplemental", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-statement-short-baseline",
      siteId: "site-statement-short",
      networkName: "statement-short-lab",
      observedAt: "2026-05-05T10:00:00.000Z",
      devices: [
        {
          deviceId: "short-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-statement-short-current",
      siteId: "site-statement-short",
      networkName: "statement-short-lab",
      observedAt: "2026-05-07T10:00:00.000Z",
      devices: [
        {
          deviceId: "short-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
        },
      ],
    });
    const packetHighway = adaptPacketHighwayCaptureToObservationBundleV1({
      capture: createPacketHighwayCapture({ generatedAt: "2026-05-06T11:00:00.000Z" }),
      site: {
        networkName: "statement-short-lab",
        networkScope: "192.0.2.0/24",
      },
      collectionVantage: "this-computer",
    });

    registerObservationBundle(baseline, {
      importedAt: "2026-05-05T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-07T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    registerObservationBundle(packetHighway, {
      importedAt: "2026-05-06T11:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });

    const statement = buildNetworkStatement({
      siteId: "site-statement-short",
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-07T23:59:59.999Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    const markdown = renderNetworkStatementMarkdown(statement);
    const text = statementText(statement);
    const packetHighwayItem = statementSection(statement, "packet-highway").items[0];

    assert.equal(statement.title, "Network Statement");
    assert.equal(statement.site.siteId, "site-statement-short");
    assert.equal(statement.site.networkName, "statement-short-lab");
    assert.equal(statement.selectedPeriod.weeklyTitleSupported, false);
    assert.equal(statement.coverageSummary.hasInsufficientWeekCoverage, true);
    assert.match(statement.selectedPeriod.titleReason, /do not span enough/);
    assert.equal(statement.coverageSummary.supplementalPacketHighwayCount, 1);
    assert.match(text, /Supplemental Packet Highway records: 1/);
    assert.match(text, /Supplemental only/);
    assert.match(text, /Packet Highway evidence cannot prove complete inventory/);
    assert.match(text, /beginning and end of the requested week/);
    assert.equal(packetHighwayItem.evidenceRefs.length, 1);
    assert.equal(packetHighwayItem.evidenceRefs[0].kind, "packet-highway");
    assert.match(packetHighwayItem.evidenceRefs[0].href, /^\/packet-highway\?observation=obs_/);
    assert.match(markdown, /\[Open Packet Highway evidence\]\(\/packet-highway\?observation=obs_/);
    assert.doesNotMatch(text, /Weekly Network Statement/);
  });
});

run("network statement matches Packet Highway with raw redaction-sensitive site identifiers", async () => {
  await withTempCwd(async () => {
    const rawSiteId = "198.51.100.42";
    const rawNetworkName = "aa:bb:cc:dd:ee:44";
    const baseline = createComparisonBundle({
      observationId: "obs-198-51-100-42-baseline",
      siteId: rawSiteId,
      networkName: rawNetworkName,
      networkScope: "198.51.100.0/24",
      observedAt: "2026-05-05T10:00:00.000Z",
      devices: [
        {
          deviceId: "redaction-site-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-aa-bb-cc-dd-ee-44-current",
      siteId: rawSiteId,
      networkName: rawNetworkName,
      networkScope: "198.51.100.0/24",
      observedAt: "2026-05-07T10:00:00.000Z",
      devices: [
        {
          deviceId: "redaction-site-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
        },
      ],
    });
    const packetHighway = adaptPacketHighwayCaptureToObservationBundleV1({
      capture: createPacketHighwayCapture({ generatedAt: "2026-05-06T11:00:00.000Z" }),
      site: {
        siteId: rawSiteId,
        networkName: rawNetworkName,
        networkScope: "198.51.100.0/24",
      },
      collectionVantage: "gateway-router",
    });

    registerObservationBundle(baseline, {
      importedAt: "2026-05-05T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-07T10:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    registerObservationBundle(packetHighway, {
      importedAt: "2026-05-06T11:05:00.000Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });

    const statement = buildNetworkStatement({
      siteId: rawSiteId,
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-07T23:59:59.999Z",
      evaluatedAt: "2026-05-08T00:00:00.000Z",
    });
    const markdown = renderNetworkStatementMarkdown(statement);
    const statementJson = JSON.stringify(statement);
    const sectionsJson = JSON.stringify(statement.sections);
    const combinedExport = `${statementJson}\n${sectionsJson}\n${markdown}`;
    const text = statementText(statement);
    const packetHighwayItem = statementSection(statement, "packet-highway").items[0];

    assert.equal(statement.coverageSummary.primaryObservationCount, 2);
    assert.equal(statement.coverageSummary.comparisonCount, 1);
    assert.equal(statement.coverageSummary.supplementalPacketHighwayCount, 1);
    assert.equal(statement.site.siteId, "[redacted ip]");
    assert.equal(statement.site.networkName, "[redacted mac]");
    assert.match(text, /Supplemental Packet Highway records: 1/);
    assert.match(text, /Packet Highway visual evidence/);
    assert.equal(packetHighwayItem.evidenceRefs.length, 0);
    for (const section of statement.sections) {
      for (const sectionItem of section.items) {
        assert.equal(sectionItem.evidenceRefs.length, 0, `${section.id}/${sectionItem.id}`);
      }
    }
    assertMarkdownContainsStatementItems(statement, markdown);
    assertStatementExportSafe(markdown);
    assertStatementExportOmitsSensitiveSiteIdentifiers(statementJson, rawSiteId, rawNetworkName, "statement JSON");
    assertStatementExportOmitsSensitiveSiteIdentifiers(sectionsJson, rawSiteId, rawNetworkName, "sections JSON");
    assertStatementExportOmitsSensitiveSiteIdentifiers(markdown, rawSiteId, rawNetworkName, "Markdown");
    assertStatementExportOmitsSensitiveSiteIdentifiers(combinedExport, rawSiteId, rawNetworkName, "combined export");
  });
});

run("network statement omits weekly collection warnings for non-week ranges", async () => {
  await withTempCwd(async () => {
    for (const observation of [
      { id: "day-1", observedAt: "2026-05-01T10:00:00.000Z" },
      { id: "day-3", observedAt: "2026-05-03T10:00:00.000Z" },
      { id: "day-15", observedAt: "2026-05-15T10:00:00.000Z" },
    ]) {
      registerObservationBundle(
        createComparisonBundle({
          observationId: `obs-statement-nonweek-${observation.id}`,
          siteId: "site-statement-nonweek",
          networkName: "statement-nonweek-lab",
          observedAt: observation.observedAt,
          devices: [
            {
              deviceId: "nonweek-device",
              ips: ["192.0.2.10"],
              macs: ["02:00:00:00:00:10"],
              ports: [{ port: 80, protocol: "tcp", service: "http" }],
            },
          ],
        }),
        {
          importedAt: observation.observedAt.replace("10:00:00", "10:05:00"),
          evaluatedAt: "2026-06-01T00:00:00.000Z",
        }
      );
    }

    const cases = [
      {
        label: "one-day",
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-01T23:59:59.999Z",
      },
      {
        label: "multi-day non-week",
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-03T23:59:59.999Z",
      },
      {
        label: "monthly",
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-31T23:59:59.999Z",
      },
    ];

    for (const testCase of cases) {
      const statement = buildNetworkStatement({
        siteId: "site-statement-nonweek",
        from: testCase.from,
        to: testCase.to,
        evaluatedAt: "2026-06-01T00:00:00.000Z",
      });
      const markdown = renderNetworkStatementMarkdown(statement);
      const combinedText = `${statementText(statement)}\n${markdown}`;

      assert.equal(statement.title, "Network Statement", testCase.label);
      assert.equal(statement.selectedPeriod.requestedWeeklyRange, false, testCase.label);
      assert.equal(statement.coverageSummary.hasInsufficientWeekCoverage, false, testCase.label);
      assert.doesNotMatch(
        combinedText,
        /requested week|weekly title|unconditional weekly coverage claim|beginning and end of the requested week/i,
        testCase.label
      );
      assertMarkdownContainsStatementItems(statement, markdown);
      assertStatementExportSafe(markdown);
    }
  });
});

run("network statement API Markdown matches print sections and redacts export-sensitive text", async () => {
  const statementRoute = await import("../src/app/api/statement/route.ts");

  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-statement-privacy-baseline",
      siteId: "site-statement-privacy",
      networkName: "statement-privacy-lab",
      observedAt: "2026-06-01T10:00:00.000Z",
      coverageNotes: [
        "C:\\Users\\user\\secret\\scan.xml",
        "<packet>raw payload</packet>",
        "Saw 192.168.1.5 from aa:bb:cc:dd:ee:ff, aa-bb-cc-dd-ee-11, and aabb.ccdd.ee22; rule watch-1 count 12.",
      ],
      devices: [
        {
          deviceId: "privacy-device",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-statement-privacy-current",
      siteId: "site-statement-privacy",
      networkName: "statement-privacy-lab",
      observedAt: "2026-06-07T10:00:00.000Z",
      devices: [
        {
          deviceId: "privacy-device",
          ips: ["192.0.2.11"],
          macs: ["02:00:00:00:00:10"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });

    upsertDeviceResponse(
      createDeviceResponseTargetForBundleDevice(current),
      "not_sure",
      "Visitor 192.168.1.9 aa-bb-cc-dd-ee-13 rule watch-1 count 12",
      { now: "2026-06-07T11:00:00.000Z" }
    );
    registerObservationBundle(baseline, {
      importedAt: "2026-06-01T10:05:00.000Z",
      evaluatedAt: "2026-06-08T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-06-07T10:05:00.000Z",
      evaluatedAt: "2026-06-08T00:00:00.000Z",
    });

    const query = "siteId=site-statement-privacy&from=2026-06-01&to=2026-06-07&asOf=2026-06-08T00:00:00.000Z";
    const jsonResponse = await statementRoute.GET(
      new Request(`http://localhost/api/statement?${query}`)
    );
    const jsonBody = await jsonResponse.json();
    assert.equal(jsonResponse.status, 200);
    assert.equal(jsonBody.success, true);

    const markdownResponse = await statementRoute.GET(
      new Request(`http://localhost/api/statement?${query}&format=markdown`)
    );
    const markdown = await markdownResponse.text();

    const serializedStatement = JSON.stringify(jsonBody.statement.sections);
    const combinedExport = `${markdown}\n${serializedStatement}`;

    assert.equal(markdownResponse.status, 200);
    assert.equal(markdownResponse.headers.get("content-type"), "text/markdown; charset=utf-8");
    assertMarkdownContainsStatementItems(jsonBody.statement, markdown);
    assertStatementExportSafe(markdown);
    assertStatementExportSafe(serializedStatement);
    assert.match(combinedExport, /\[redacted ip\]/);
    assert.match(combinedExport, /\[redacted mac\]/);
    assert.doesNotMatch(combinedExport, /192\.168\.1\.(5|9)/);
    assert.doesNotMatch(combinedExport, /aa:bb:cc:dd:ee:ff/i);
    assert.doesNotMatch(combinedExport, /aa-bb-cc-dd-ee-(11|13)/i);
    assert.doesNotMatch(combinedExport, /aabb\.ccdd\.ee22/i);
    assert.match(combinedExport, /watch-1/);
    assert.match(combinedExport, /count 12/);
    assert.match(combinedExport, /obs-statement-privacy-current/);
    assert.match(markdown, /\/activity#/);
  });
});

run("device responses carry forward across changed IP only with strong identity evidence", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-response-strong-baseline",
      siteId: "site-response-strong",
      networkName: "response-strong-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-aaaaaaaaaaaa",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-response-strong-current",
      siteId: "site-response-strong",
      networkName: "response-strong-lab",
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-bbbbbbbbbbbb",
          ips: ["192.0.2.55"],
          macs: ["02:00:00:00:00:10"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });

    upsertDeviceResponse(
      createDeviceResponseTargetForBundleDevice(baseline),
      "mine",
      "Kitchen laptop",
      { now: "2026-05-01T11:00:00.000Z" }
    );
    registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-02T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    const opened = activity.events.find((event) => event.type === "service-or-port-opened");

    assert.ok(opened);
    assert.equal(opened.technicalEvidence.identityRuleId, "identity.mac");
    assert.equal(opened.deviceResponse.statement.state, "mine");
    assert.equal(opened.deviceResponse.statement.friendlyName, "Kitchen laptop");
    assert.ok(opened.deviceResponse.carriedForward);
    assert.equal(
      opened.deviceResponse.carriedForward.fromObservationId,
      "obs-response-strong-baseline"
    );
    assert.match(opened.deviceResponse.carriedForward.reason, /MAC address/);
    assert.equal(opened.workflowPriority.level, "normal");
    assert.equal(
      JSON.stringify(opened.technicalEvidence).includes("Kitchen laptop"),
      false,
      "friendly names must stay out of technical evidence"
    );
    assert.doesNotMatch(
      [
        opened.title,
        opened.summary,
        opened.reviewReason,
        opened.deviceResponse.carriedForward.reason,
      ].join(" "),
      /safe|malware|attack/i
    );
  });
});

run("device responses do not inherit across low-confidence IP continuity", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-response-weak-baseline",
      siteId: "site-response-weak",
      networkName: "response-weak-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-111111111111",
          ips: ["192.0.2.40"],
          macs: ["02:00:00:00:00:40"],
          ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-response-weak-current",
      siteId: "site-response-weak",
      networkName: "response-weak-lab",
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-222222222222",
          ips: ["192.0.2.40"],
          macs: ["02:00:00:00:00:41"],
          ports: [{ port: 3389, protocol: "tcp", service: "ms-wbt-server" }],
        },
      ],
    });

    upsertDeviceResponse(
      createDeviceResponseTargetForBundleDevice(baseline),
      "guest",
      "Visitor tablet",
      { now: "2026-05-01T11:00:00.000Z" }
    );
    registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-02T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    const uncertain = activity.events.find(
      (event) => event.type === "identity-uncertain-possibly-same-device"
    );

    assert.ok(uncertain);
    assert.equal(uncertain.confidence, "low");
    assert.equal(uncertain.deviceResponse.target, null);
    assert.equal(uncertain.deviceResponse.statement, null);
    assert.match(uncertain.deviceResponse.unavailableReason, /insufficient|uncertain/);
    assert.equal(
      activity.events.some((event) => event.deviceResponse.statement?.state === "guest"),
      false
    );
  });
});

run("device responses do not inherit across competing identity candidates", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-response-ambiguous-baseline",
      siteId: "site-response-ambiguous",
      networkName: "response-ambiguous-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-333333333333",
          ips: ["192.0.2.60"],
          macs: ["02:00:00:00:00:60"],
        },
        {
          deviceId: "dev-444444444444",
          ips: ["192.0.2.61"],
          macs: ["02:00:00:00:00:60"],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-response-ambiguous-current",
      siteId: "site-response-ambiguous",
      networkName: "response-ambiguous-lab",
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-555555555555",
          ips: ["192.0.2.62"],
          macs: ["02:00:00:00:00:60"],
        },
      ],
    });

    upsertDeviceResponse(
      createDeviceResponseTargetForBundleDevice(baseline, 0),
      "investigate",
      "Shared MAC device",
      { now: "2026-05-01T11:00:00.000Z" }
    );
    registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-02T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    const uncertainEvents = activity.events.filter(
      (event) => event.type === "identity-uncertain-possibly-same-device"
    );

    assert.equal(uncertainEvents.length, 2);
    assert.equal(uncertainEvents.every((event) => event.confidence === "strong"), true);
    assert.equal(
      uncertainEvents.every((event) => event.deviceResponse.statement === null),
      true
    );
    assert.equal(
      uncertainEvents.every((event) => event.workflowPriority.level === "normal"),
      true
    );
  });
});

run("activity device response API edits and clears without deleting observations or events", async () => {
  const deviceResponseRoute = await import("../src/app/api/activity/device-response/route.ts");

  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-response-api-baseline",
      siteId: "site-response-api",
      networkName: "response-api-lab",
      observedAt: "2026-05-01T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-666666666666",
          ips: ["192.0.2.70"],
          macs: ["02:00:00:00:00:70"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-response-api-current",
      siteId: "site-response-api",
      networkName: "response-api-lab",
      observedAt: "2026-05-02T10:00:00.000Z",
      devices: [
        {
          deviceId: "dev-777777777777",
          ips: ["192.0.2.71"],
          macs: ["02:00:00:00:00:70"],
          ports: [
            { port: 80, protocol: "tcp", service: "http" },
            { port: 443, protocol: "tcp", service: "https" },
          ],
        },
      ],
    });

    registerObservationBundle(baseline, {
      importedAt: "2026-05-01T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-05-02T10:05:00.000Z",
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });

    const firstActivity = buildNetworkActivity({
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    const responseEvent = firstActivity.events.find(
      (event) => event.type === "service-or-port-opened"
    );
    const target = responseEvent?.deviceResponse.target;
    assert.ok(responseEvent);
    assert.ok(target);

    const firstResponse = await deviceResponseRoute.POST(
      createJsonRequest("/api/activity/device-response", "POST", {
        eventId: responseEvent.eventId,
        target,
        state: "mine",
        friendlyName: "Lab laptop",
      })
    );
    const firstBody = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(firstBody.success, true);
    assert.equal(firstBody.response.state, "mine");
    assert.equal(firstBody.response.friendlyName, "Lab laptop");

    const responseStoreText = fs.readFileSync(
      path.join(process.cwd(), "data", "device-responses", "index.json"),
      "utf-8"
    );
    assert.doesNotMatch(responseStoreText, /02:00:00|192\.0\.2\./);

    const editResponse = await deviceResponseRoute.POST(
      createJsonRequest("/api/activity/device-response", "POST", {
        eventId: responseEvent.eventId,
        target,
        state: "investigate",
        friendlyName: "Lab laptop renamed",
      })
    );
    const editBody = await editResponse.json();
    assert.equal(editResponse.status, 200);
    assert.equal(editBody.success, true);
    assert.equal(editBody.response.state, "investigate");
    assert.equal(editBody.response.friendlyName, "Lab laptop renamed");
    assert.equal(editBody.response.createdAt, firstBody.response.createdAt);

    const prioritizedActivity = buildNetworkActivity({
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    const prioritizedEvent = prioritizedActivity.events.find(
      (event) => event.type === "service-or-port-opened"
    );
    assert.equal(prioritizedEvent.deviceResponse.statement.state, "investigate");
    assert.equal(prioritizedEvent.workflowPriority.level, "user-investigate");
    assert.doesNotMatch(
      JSON.stringify(prioritizedEvent.technicalEvidence),
      /investigate|Lab laptop renamed/
    );
    assert.doesNotMatch(prioritizedEvent.workflowPriority.reason, /malware|attack/i);

    const clearResponse = await deviceResponseRoute.DELETE(
      createJsonRequest("/api/activity/device-response", "DELETE", { target })
    );
    const clearBody = await clearResponse.json();
    assert.equal(clearResponse.status, 200);
    assert.equal(clearBody.success, true);
    assert.equal(clearBody.cleared, true);
    assert.equal(getDeviceResponseForTarget(target), null);
    assert.equal(listObservations({ siteId: "site-response-api" }).length, 2);

    const afterClearActivity = buildNetworkActivity({
      evaluatedAt: "2026-05-03T00:00:00.000Z",
    });
    assert.ok(afterClearActivity.events.length > 0);
    assert.equal(
      afterClearActivity.events.some((event) => event.deviceResponse.statement),
      false
    );
  });
});

run("activity API serves the guided scenario and bounded request errors", async () => {
  const activityRoute = await import("../src/app/api/activity/route.ts");

  const guidedResponse = await activityRoute.GET(
    new Request("http://localhost/api/activity?scenario=guided")
  );
  const guidedBody = await guidedResponse.json();

  assert.equal(guidedResponse.status, 200);
  assert.equal(guidedBody.success, true);
  assert.equal(guidedBody.activity.source, "synthetic-guided-scenario");
  assert.ok(guidedBody.activity.scenario);

  const invalidScenarioResponse = await activityRoute.GET(
    new Request("http://localhost/api/activity?scenario=raw")
  );
  await assertJsonError(invalidScenarioResponse, 400, /scenario must be guided/);

  const invalidDateResponse = await activityRoute.GET(
    new Request("http://localhost/api/activity?asOf=2026-05-01T00:00:00")
  );
  await assertJsonError(invalidDateResponse, 400, /explicit offset/);
});

run("observations API imports, reads, lists, and returns safe bounded errors", async () => {
  const [observationsRoute, observationRoute] = await Promise.all([
    import("../src/app/api/observations/route.ts"),
    import("../src/app/api/observations/[registryId]/route.ts"),
  ]);

  await withTempCwd(async () => {
    const bundle = createObservationRegistryBundle({
      runUid: "api-observation",
      network: "api-lab",
    });

    const importResponse = await observationsRoute.POST(
      createRawJsonRequest("/api/observations", "POST", JSON.stringify(bundle))
    );
    const importBody = await importResponse.json();
    const registryId = importBody.observation.registryId;

    assert.equal(importResponse.status, 200);
    assert.equal(importBody.success, true);
    assert.equal(importBody.isNew, true);
    assert.equal(importBody.observation.observationId, bundle.observationId);
    assert.equal("bundle" in importBody.observation, false);

    const duplicateResponse = await observationsRoute.POST(
      createRawJsonRequest("/api/observations", "POST", JSON.stringify(bundle))
    );
    const duplicateBody = await duplicateResponse.json();

    assert.equal(duplicateResponse.status, 200);
    assert.equal(duplicateBody.success, true);
    assert.equal(duplicateBody.isNew, false);
    assert.equal(duplicateBody.duplicateOf, registryId);

    const listResponse = await observationsRoute.GET(
      new Request(
        "http://localhost/api/observations?network=api-lab&order=asc&limit=1&asOf=2026-04-02T00:00:00.000Z"
      )
    );
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listBody.success, true);
    assert.equal(listBody.observations.length, 1);
    assert.equal(listBody.observations[0].registryId, registryId);
    assert.equal(listBody.stats.totalObservations, 1);
    assert.equal(listBody.stats.returnedObservations, 1);

    const getResponse = await observationRoute.GET(
      new Request(`http://localhost/api/observations/${registryId}?asOf=2026-04-02T00:00:00.000Z`),
      { params: Promise.resolve({ registryId }) }
    );
    const getBody = await getResponse.json();

    assert.equal(getResponse.status, 200);
    assert.equal(getBody.success, true);
    assert.equal(getBody.observation.registryId, registryId);
    assert.equal(getBody.observation.bundle.observationId, bundle.observationId);

    const rawIdBundle = createObservationRegistryBundle({
      runUid: "api-raw-id-observation",
      network: "api-raw-id-lab",
    });
    const rawApiScanBody = "<nmaprun><host><address addr=\"192.0.2.77\" /></host></nmaprun>";
    rawIdBundle.observationId = rawApiScanBody;
    rawIdBundle.batch.batchId = rawApiScanBody;
    rawIdBundle.batch.sourceRunUid = "nmaprun-host-address-addr-192.0.2.77";
    rawIdBundle.sources[0].sourceId = rawApiScanBody;
    rawIdBundle.devices[0].deviceId = rawApiScanBody;
    rawIdBundle.devices[0].identityEvidence.push({
      evidenceId: rawApiScanBody,
      kind: "hostname",
      value: "api-raw-id-safe-value",
      sourceId: rawIdBundle.sources[1].sourceId,
      confidence: "reported",
    });

    const rawIdImportResponse = await observationsRoute.POST(
      createRawJsonRequest("/api/observations", "POST", JSON.stringify(rawIdBundle))
    );
    const rawIdImportBody = await rawIdImportResponse.json();
    const rawIdRegistryId = rawIdImportBody.observation.registryId;
    const rawIdGetResponse = await observationRoute.GET(
      new Request(`http://localhost/api/observations/${rawIdRegistryId}`),
      { params: Promise.resolve({ registryId: rawIdRegistryId }) }
    );
    const rawIdGetBody = await rawIdGetResponse.json();
    const rawIdListResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?network=api-raw-id-lab&limit=10")
    );
    const rawIdListBody = await rawIdListResponse.json();
    const rawIdSerialized = JSON.stringify([
      rawIdImportBody,
      rawIdGetBody,
      rawIdListBody,
    ]);

    assert.equal(rawIdImportResponse.status, 200);
    assert.equal(rawIdImportBody.success, true);
    assert.equal(rawIdImportBody.observation.observationId, "obs-unknown");
    assert.equal(rawIdGetResponse.status, 200);
    assert.equal(rawIdGetBody.success, true);
    assert.equal(rawIdListResponse.status, 200);
    assert.equal(rawIdListBody.success, true);
    assertObservationRegistryOutputSafe(rawIdSerialized);
    assert.doesNotMatch(rawIdSerialized, /nmaprun-host-address|192\.0\.2\.77/);

    const unsafeMalformedBody = JSON.stringify({
      note: ["api_key", "synthetic-not-for-output"].join("="),
      raw: "<nmaprun><host /></nmaprun>",
      path: ["C:", "Users", "user", "private", "scan.xml"].join("\\"),
    }).slice(0, -1);
    const malformedResponse = await observationsRoute.POST(
      createRawJsonRequest("/api/observations", "POST", unsafeMalformedBody)
    );
    await assertSafeObservationApiError(malformedResponse, 400, /valid JSON/, "malformed body");

    const oversizedResponse = await observationsRoute.POST(
      new Request("http://localhost/api/observations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(MAX_OBSERVATION_BUNDLE_JSON_BYTES + 1),
        },
        body: "{}",
      })
    );
    await assertSafeObservationApiError(oversizedResponse, 413, /too large/i, "oversized body");

    const oversizedStreamResponse = await observationsRoute.POST(
      new Request("http://localhost/api/observations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: " ".repeat(MAX_OBSERVATION_BUNDLE_JSON_BYTES + 1),
      })
    );
    await assertSafeObservationApiError(
      oversizedStreamResponse,
      413,
      /too large/i,
      "oversized stream body"
    );

    const invalidQueryResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?asOf=not-a-date")
    );
    await assertSafeObservationApiError(invalidQueryResponse, 400, /asOf must be/, "invalid asOf");

    const localTimeQueryResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?asOf=2026-04-02T00:00:00")
    );
    await assertSafeObservationApiError(
      localTimeQueryResponse,
      400,
      /explicit offset/,
      "offset-less asOf"
    );

    const localTimeGetResponse = await observationRoute.GET(
      new Request(`http://localhost/api/observations/${registryId}?asOf=2026-04-02T00:00:00`),
      { params: Promise.resolve({ registryId }) }
    );
    await assertSafeObservationApiError(
      localTimeGetResponse,
      400,
      /explicit offset/,
      "offset-less item asOf"
    );

    const invalidIdResponse = await observationRoute.GET(
      new Request("http://localhost/api/observations/obs_bad%2Fid"),
      { params: Promise.resolve({ registryId: "obs_bad/id" }) }
    );
    await assertSafeObservationApiError(invalidIdResponse, 400, /Invalid observation id/, "invalid id");
  });
});
run("observations API applies default and explicit list bounds", async () => {
  const observationsRoute = await import("../src/app/api/observations/route.ts");

  await withTempCwd(async () => {
    for (let index = 0; index < 55; index += 1) {
      const day = String((index % 28) + 1).padStart(2, "0");
      const bundle = createObservationRegistryBundle({
        runUid: `api-list-bound-${index}`,
        network: "list-bounds-lab",
        timestamp: `2026-04-${day}T12:00:00.000Z`,
        generatedAt: `2026-04-${day}T12:06:00.000Z`,
      });
      registerObservationBundle(bundle, {
        importedAt: `2026-04-${day}T12:07:00.000Z`,
        evaluatedAt: "2026-05-01T00:00:00.000Z",
      });
    }

    const defaultResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?network=list-bounds-lab&order=asc")
    );
    const defaultBody = await defaultResponse.json();

    assert.equal(defaultResponse.status, 200);
    assert.equal(defaultBody.success, true);
    assert.equal(defaultBody.observations.length, 50);
    assert.equal(defaultBody.stats.totalObservations, 55);
    assert.equal(defaultBody.stats.returnedObservations, 50);

    const explicitMaxResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?network=list-bounds-lab&limit=200")
    );
    const explicitMaxBody = await explicitMaxResponse.json();

    assert.equal(explicitMaxResponse.status, 200);
    assert.equal(explicitMaxBody.success, true);
    assert.equal(explicitMaxBody.observations.length, 55);

    const zeroLimitResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?limit=0")
    );
    await assertSafeObservationApiError(zeroLimitResponse, 400, /limit must be between 1 and 200/);

    const tooLargeLimitResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?limit=201")
    );
    await assertSafeObservationApiError(tooLargeLimitResponse, 400, /limit must be between 1 and 200/);

    const largeOffsetResponse = await observationsRoute.GET(
      new Request("http://localhost/api/observations?network=list-bounds-lab&offset=999999")
    );
    const largeOffsetBody = await largeOffsetResponse.json();

    assert.equal(largeOffsetResponse.status, 200);
    assert.equal(largeOffsetBody.success, true);
    assert.equal(largeOffsetBody.observations.length, 0);
    assert.equal(largeOffsetBody.stats.totalObservations, 55);
    assert.equal(largeOffsetBody.stats.returnedObservations, 0);
  });
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

    const sameDiffResponse = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", {
        baselineRunUid: "same-run",
        currentRunUid: "same-run",
      })
    );
    await assertJsonError(
      sameDiffResponse,
      400,
      /baselineRunUid and currentRunUid must refer to different runs/
    );

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

run("diff and comparisons POST reject same-network same-minute ambiguity", async () => {
  const [diffRoute, comparisonsRoute] = await Promise.all([
    import("../src/app/api/diff/route.ts"),
    import("../src/app/api/comparisons/route.ts"),
  ]);

  await withTempCwd(async () => {
    const timestamp = "2026-02-08T10:00:00.000Z";
    const { baselineRunUid, currentRunUid } = writeRunRegistryFixtures({
      baselineRunUid: "same-minute-baseline-run",
      currentRunUid: "same-minute-current-run",
      baselineTimestamp: timestamp,
      currentTimestamp: timestamp,
    });

    const response = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", { baselineRunUid, currentRunUid })
    );

    await assertJsonError(response, 400, /same network and minute/);

    const comparisonResponse = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", { baselineRunUid, currentRunUid })
    );

    await assertJsonError(comparisonResponse, 400, /same network and minute/);
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
        notes: "  one new RDP service observation  ",
      })
    );
    const comparisonBody = await comparisonResponse.json();

    assert.equal(comparisonResponse.status, 200);
    assert.equal(comparisonBody.success, true);
    assert.equal(comparisonBody.comparison.title, "Weekly check");
    assert.equal(comparisonBody.comparison.notes, "one new RDP service observation");
    assert.equal(comparisonBody.comparison.diffData.evidence.status, "supported");
  });
});

run("DB-01 legacy diff keeps strong device identity across a changed locator", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:AA",
          hostname: "stable-device.local",
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ],
      currentHosts: [
        {
          ip: "192.0.2.77",
          mac: "02:00:00:00:00:AA",
          hostname: "stable-device.local",
          ports: [
            { port: 443, protocol: "tcp", service: "https" },
            { port: 8080, protocol: "tcp", service: "http-proxy" },
          ],
        },
      ],
    });

    const result = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(result);
    assert.deepEqual(result.newHosts, []);
    assert.deepEqual(result.removedHosts, []);
    assert.deepEqual(result.portsOpened.map((finding) => finding.port), [8080]);
    assert.deepEqual(result.portsClosed, []);
  });
});

run("DB-01 locator-only continuity remains uncertain", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineHosts: [
        {
          ip: "192.0.2.20",
          ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
        },
      ],
      currentHosts: [
        {
          ip: "192.0.2.20",
          ports: [
            { port: 22, protocol: "tcp", service: "ssh" },
            { port: 3389, protocol: "tcp", service: "ms-wbt-server" },
          ],
        },
      ],
    });

    const result = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(result);
    assert.equal(result.evidence.status, "insufficient-evidence");
    assert.ok(result.identityUncertain.length > 0);
    assert.deepEqual(result.portsOpened, []);
    assert.deepEqual(result.portsClosed, []);
  });
});

run("DB-01 partial current evidence cannot create removal closure or stability", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      currentCoverage: "partial",
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          hostname: "db01-device.local",
          ports: [],
        },
      ],
    });

    const result = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(result);
    assert.equal(result.evidence.status, "insufficient-evidence");
    assert.deepEqual(result.removedHosts, []);
    assert.deepEqual(result.portsClosed, []);
    assert.doesNotMatch(result.summary, /stable|safe|removed|closed/i);
  });
});

run("DB-01 partial baseline evidence cannot create device or service additions", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineCoverage: "partial",
      baselineHosts: [
        {
          ip: "192.0.2.11",
          mac: "02:00:00:00:00:11",
          hostname: "partial-baseline.local",
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ],
      currentHosts: [
        {
          ip: "192.0.2.11",
          mac: "02:00:00:00:00:11",
          hostname: "partial-baseline.local",
          ports: [
            { port: 443, protocol: "tcp", service: "https" },
            { port: 8080, protocol: "tcp", service: "http-proxy" },
          ],
        },
        {
          ip: "192.0.2.12",
          mac: "02:00:00:00:00:12",
          hostname: "current-only.local",
          ports: [{ port: 3389, protocol: "tcp", service: "ms-wbt-server" }],
        },
      ],
    });

    const result = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(result);
    assert.equal(result.evidence.status, "insufficient-evidence");
    assert.deepEqual(result.newHosts, []);
    assert.deepEqual(result.portsOpened, []);
    assert.deepEqual(result.riskFindings, []);
    assert.doesNotMatch(result.summary, /added|newly observed|service-addition/i);
  });
});

run("DB-01 incompatible network evidence fails closed at the API", async () => {
  const diffRoute = await import("../src/app/api/diff/route.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineNetwork: "db01-site-a",
      currentNetwork: "db01-site-b",
    });
    const response = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", { baselineRunUid, currentRunUid })
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.success, false);
    assert.equal(body.code, "comparison_incompatible_site");
    assert.doesNotMatch(JSON.stringify(body), /db01-site-a|db01-site-b|192\.0\.2/);
  });
});

run("DB-01 incompatible comparison cannot be persisted or reach an LLM", async () => {
  const [comparisonsRoute, diffSummaryRoute] = await Promise.all([
    import("../src/app/api/comparisons/route.ts"),
    import("../src/app/api/llm/diff-summary/route.ts"),
  ]);

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineNetwork: "db01-site-a",
      currentNetwork: "db01-site-b",
    });

    const persistenceResponse = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", { baselineRunUid, currentRunUid })
    );
    assert.equal(persistenceResponse.status, 422);
    assert.equal(
      fs.existsSync(path.join(process.cwd(), "data", "comparisons", "index.json")),
      false
    );

    let fetchCalls = 0;
    await withEnv(
      { OPENAI_API_KEY: "test-openai-key", ANTHROPIC_API_KEY: undefined },
      async () => {
        await withMockedFetch(async () => {
          fetchCalls += 1;
          return new Response(JSON.stringify({ choices: [{ message: { content: "unsafe" } }] }), {
            status: 200,
          });
        }, async () => {
          resetLLMRateLimitForTesting();
          const response = await diffSummaryRoute.POST(
            createJsonPostRequest(
              "/api/llm/diff-summary",
              { baselineRunUid, currentRunUid, userProfile: testUserProfile },
              "198.51.100.212"
            )
          );
          const body = await response.json();
          assert.equal(response.status, 422);
          assert.equal(body.code, "comparison_incompatible_site");
          assert.equal(fetchCalls, 0);
        });
      }
    );
    resetLLMRateLimitForTesting();
  });
});

run("DB-01 empty current observation is insufficient rather than removal or closure", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      currentHosts: [],
    });

    const result = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(result);
    assert.equal(result.evidence.status, "insufficient-evidence");
    assert.ok(result.evidence.reasonCodes.includes("empty-observation"));
    assert.deepEqual(result.removedHosts, []);
    assert.deepEqual(result.portsClosed, []);
    assert.doesNotMatch(result.summary, /stable|safe|removed|closed/i);
  });
});

run("DB-01 address-only ports artifact is insufficient and cannot imply closure", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          hostname: "db01-device.local",
          ports: [],
        },
      ],
    });

    const diff = computeDiff(baselineRunUid, currentRunUid);
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(diff);
    assert.ok(scorecard);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.equal(scorecard.evidence.status, "insufficient-evidence");
    assert.ok(diff.evidence.reasonCodes.includes("partial-coverage"));
    assert.deepEqual(diff.portsClosed, []);
    assert.doesNotMatch(scorecard.summary, /No P0 or P1 services were observed/i);
  });
});

run("DB-01 explicit zero-open port-state evidence remains representable", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid, currentManifest } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          hostname: "db01-device.local",
          ports: [],
        },
      ],
    });
    fs.writeFileSync(
      currentManifest.keyFiles.ports[0],
      '<nmaprun><scaninfo type="synthetic" protocol="tcp" numservices="65535" services="1-65535" /><host><status state="up" /><address addr="192.0.2.10" addrtype="ipv4" /><address addr="02:00:00:00:00:10" addrtype="mac" /><ports><extraports state="closed" count="65535" /></ports></host><runstats><finished exit="success" /></runstats></nmaprun>'
    );

    const diff = computeDiff(baselineRunUid, currentRunUid);
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(diff);
    assert.ok(scorecard);
    assert.equal(diff.evidence.status, "supported");
    assert.equal(scorecard.evidence.status, "supported");
    assert.equal(scorecard.openPorts, 0);
    assert.equal(scorecard.riskPorts, 0);
    assert.deepEqual(diff.portsClosed.map((finding) => finding.port), [443]);
    assert.match(scorecard.summary, /No P0 or P1 services were observed within the recorded coverage/i);
    assert.match(scorecard.summary, /does not establish overall security/i);
  });
});

run("DB-01 per-device port coverage prevents cross-device closure and addition claims", async () => {
  await withTempCwd(async () => {
    const sharedHosts = [
      {
        ip: "192.0.2.50",
        mac: "02:00:00:00:00:50",
        hostname: "device-a.local",
        ports: [{ port: 443, protocol: "tcp", service: "https" }],
      },
      {
        ip: "192.0.2.51",
        mac: "02:00:00:00:00:51",
        hostname: "device-b.local",
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ];
    const { baselineRunUid, currentRunUid, currentManifest } = writeDb01RunPairFixtures({
      baselineHosts: sharedHosts,
      currentHosts: sharedHosts,
    });
    fs.writeFileSync(
      currentManifest.keyFiles.ports[0],
      createObservationNmapXml([{ ...sharedHosts[0], ports: [] }, sharedHosts[1]])
    );

    const diff = computeDiff(baselineRunUid, currentRunUid);
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(diff);
    assert.ok(scorecard);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.equal(scorecard.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
  });

  await withTempCwd(async () => {
    const baselineHosts = [
      {
        ip: "192.0.2.60",
        mac: "02:00:00:00:00:60",
        hostname: "device-a.local",
        ports: [{ port: 443, protocol: "tcp", service: "https" }],
      },
      {
        ip: "192.0.2.61",
        mac: "02:00:00:00:00:61",
        hostname: "device-b.local",
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ];
    const currentHosts = [
      {
        ...baselineHosts[0],
        ports: [
          { port: 443, protocol: "tcp", service: "https" },
          { port: 8080, protocol: "tcp", service: "http-proxy" },
        ],
      },
      baselineHosts[1],
    ];
    const { baselineRunUid, currentRunUid, baselineManifest } = writeDb01RunPairFixtures({
      baselineHosts,
      currentHosts,
    });
    fs.writeFileSync(
      baselineManifest.keyFiles.ports[0],
      createObservationNmapXml([{ ...baselineHosts[0], ports: [] }, baselineHosts[1]])
    );

    const diff = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(diff);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsOpened, []);
    assert.deepEqual(diff.riskFindings, []);
  });
});

run("DB-01 incompatible declared port ranges cannot create closure conclusions", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid, currentManifest } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          hostname: "db01-device.local",
          ports: [],
        },
      ],
    });
    fs.writeFileSync(
      currentManifest.keyFiles.ports[0],
      '<nmaprun><scaninfo type="synthetic" protocol="tcp" numservices="1" services="22" /><host><status state="up" /><address addr="192.0.2.10" addrtype="ipv4" /><address addr="02:00:00:00:00:10" addrtype="mac" /><ports><extraports state="closed" count="1" /></ports></host><runstats><finished exit="success" /></runstats></nmaprun>'
    );

    const diff = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(diff);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
    assert.match(diff.summary, /insufficient/i);
    assert.doesNotMatch(diff.summary, /service was closed|services were closed|baseline is stable/i);
  });
});

run("DB-01 incomplete states within a declared port range cannot imply closure", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid, currentManifest } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          hostname: "db01-device.local",
          ports: [],
        },
      ],
    });
    fs.writeFileSync(
      currentManifest.keyFiles.ports[0],
      '<nmaprun><scaninfo type="synthetic" protocol="tcp" numservices="65535" services="1-65535" /><host><status state="up" /><address addr="192.0.2.10" addrtype="ipv4" /><address addr="02:00:00:00:00:10" addrtype="mac" /><ports><port protocol="tcp" portid="22"><state state="closed" /></port></ports></host><runstats><finished exit="success" /></runstats></nmaprun>'
    );

    const diff = computeDiff(baselineRunUid, currentRunUid);
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(diff);
    assert.ok(scorecard);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.equal(scorecard.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
    assert.equal(diff.evidence.supports.comparisonPersistence, false);
    assert.equal(diff.evidence.supports.llmSummary, false);
  });
});

run("DB-01 ambiguous current port states cannot imply closure", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid, currentManifest } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          hostname: "db01-device.local",
          ports: [],
        },
      ],
    });
    fs.writeFileSync(
      currentManifest.keyFiles.ports[0],
      '<nmaprun><scaninfo type="synthetic" protocol="tcp" numservices="1" services="443" /><host><status state="up" /><address addr="192.0.2.10" addrtype="ipv4" /><address addr="02:00:00:00:00:10" addrtype="mac" /><ports><port protocol="tcp" portid="443"><state state="open|filtered" /></port></ports></host><runstats><finished exit="success" /></runstats></nmaprun>'
    );

    const diff = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(diff);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
    assert.equal(diff.evidence.supports.comparisonPersistence, false);
    assert.doesNotMatch(diff.summary, /service was closed|service closure/i);
  });
});

run("DB-01 failed sibling artifacts cannot contribute scan-range coverage", async () => {
  await withTempCwd(async () => {
    const { baselineManifest, currentManifest } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          hostname: "db01-device.local",
          ports: [],
        },
      ],
    });
    const successfulPort22Path = path.join(currentManifest.runFolder, "ports_22.xml");
    const failedFullRangePath = path.join(currentManifest.runFolder, "ports_failed_full.xml");
    fs.writeFileSync(
      successfulPort22Path,
      '<nmaprun><scaninfo type="synthetic" protocol="tcp" numservices="1" services="22" /><host><status state="up" /><address addr="192.0.2.10" addrtype="ipv4" /><address addr="02:00:00:00:00:10" addrtype="mac" /><ports><port protocol="tcp" portid="22"><state state="closed" /></port></ports></host><runstats><finished exit="success" /></runstats></nmaprun>'
    );
    fs.writeFileSync(
      failedFullRangePath,
      '<nmaprun><scaninfo type="synthetic" protocol="tcp" numservices="65535" services="1-65535" /><host><status state="up" /><address addr="192.0.2.10" addrtype="ipv4" /><address addr="02:00:00:00:00:10" addrtype="mac" /><ports><extraports state="closed" count="65535" /></ports></host><runstats><finished exit="error" /></runstats></nmaprun>'
    );
    currentManifest.keyFiles.ports = [successfulPort22Path, failedFullRangePath];

    const baseline = adaptRunManifestToObservationBundleV1(baselineManifest);
    const current = adaptRunManifestToObservationBundleV1(currentManifest);
    const diff = buildDiffFromObservationBundles(baseline, current);
    const currentCoverage = current.devices.flatMap((device) => device.portCoverage ?? []);

    assert.equal(current.coverage.status, "partial");
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
    assert.equal(
      currentCoverage.some((coverage) =>
        coverage.ranges.some((range) => 443 >= range.start && 443 <= range.end)
      ),
      false
    );
  });
});

run("DB-01 failed Nmap evidence cannot imply device or service absence", async () => {
  await withTempCwd(async () => {
    const baselineHosts = [
      {
        ip: "192.0.2.10",
        mac: "02:00:00:00:00:10",
        hostname: "device-a.local",
        ports: [{ port: 443, protocol: "tcp", service: "https" }],
      },
      {
        ip: "192.0.2.11",
        mac: "02:00:00:00:00:11",
        hostname: "device-b.local",
        ports: [{ port: 80, protocol: "tcp", service: "http" }],
      },
    ];
    const { baselineRunUid, currentRunUid, currentManifest } = writeDb01RunPairFixtures({
      baselineHosts,
      currentHosts: [baselineHosts[0]],
    });
    const failedXml = fs
      .readFileSync(currentManifest.keyFiles.ports[0], "utf8")
      .replace('exit="success"', 'exit="error"');
    fs.writeFileSync(currentManifest.keyFiles.ports[0], failedXml);

    const diff = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(diff);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.ok(diff.evidence.reasonCodes.includes("partial-coverage"));
    assert.deepEqual(diff.removedHosts, []);
    assert.deepEqual(diff.portsClosed, []);
    assert.equal(diff.evidence.supports.comparisonPersistence, false);
    assert.equal(diff.evidence.supports.llmSummary, false);
  });
});

run("DB-01 conflicting network scopes fail closed with privacy-safe diagnostics", async () => {
  const diffRoute = await import("../src/app/api/diff/route.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineScope: "192.0.2.0/24",
      currentScope: "198.51.100.0/24",
    });
    const response = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", { baselineRunUid, currentRunUid })
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.code, "comparison_incompatible_site");
    assert.doesNotMatch(JSON.stringify(body), /192\.0\.2|198\.51\.100/);
  });
});

run("DB-01 incompatible scan run types fail closed", async () => {
  const diffRoute = await import("../src/app/api/diff/route.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineRunType: "baselinekit_v0",
      currentRunType: "smoketest",
    });
    const response = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", { baselineRunUid, currentRunUid })
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.code, "comparison_incompatible_scan");
    assert.doesNotMatch(JSON.stringify(body), /baselinekit|smoketest|192\.0\.2/);
  });
});

run("DB-01 internal-only P0 observation stays a bounded service review finding", async () => {
  await withTempCwd(async () => {
    const { currentRunUid } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.30",
          mac: "02:00:00:00:00:30",
          hostname: "review-device.local",
          ports: [{ port: 3389, protocol: "tcp", service: "ms-wbt-server" }],
        },
      ],
    });
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(scorecard);
    assert.equal(scorecard.evidence.vantage.externalReachability, "not-established");
    assert.equal(scorecard.riskPorts, 1);

    const fallback = generateRuleBasedSummary(scorecard, testUserProfile);
    const executiveFallback = generateRuleBasedExecutiveSummary(scorecard, testUserProfile);
    const combined = [scorecard.summary, fallback, executiveFallback].join("\n");

    assert.match(combined, /external reachability (?:is )?not established|does not establish (?:internet|external|reachability beyond)|reachability beyond .* was not established/i);
    assert.doesNotMatch(
      combined,
      /is exposed to (?:the )?internet|accessible from outside|perimeter (?:is )?(?:secure|failed)|breach probability|\$[0-9]|no critical security issues|no urgent actions/i
    );
  });
});

run("DB-01 P1-only Scorecard reports the observed review finding", async () => {
  await withTempCwd(async () => {
    const { currentRunUid } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.31",
          mac: "02:00:00:00:00:31",
          hostname: "p1-review-device.local",
          ports: [{ port: 8080, protocol: "tcp", service: "http-proxy" }],
        },
      ],
    });
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(scorecard);
    assert.equal(scorecard.riskPorts, 1);
    assert.equal(scorecard.riskPortsDetail[0].risk, "P1");
    assert.match(scorecard.summary, /0 P0 and 1 P1 service finding/i);
    assert.doesNotMatch(scorecard.summary, /No P0 or P1 services were observed/i);
  });
});

run("DB-01 Diff review findings include newly observed P1 services", async () => {
  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      baselineHosts: [
        {
          ip: "192.0.2.32",
          mac: "02:00:00:00:00:32",
          hostname: "p1-diff-device.local",
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ],
      currentHosts: [
        {
          ip: "192.0.2.32",
          mac: "02:00:00:00:00:32",
          hostname: "p1-diff-device.local",
          ports: [
            { port: 443, protocol: "tcp", service: "https" },
            { port: 8080, protocol: "tcp", service: "http-proxy" },
          ],
        },
      ],
    });
    const diff = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(diff);
    assert.equal(diff.riskFindings.length, 1);
    assert.equal(diff.riskFindings[0].risk, "P1");
    assert.match(diff.summary, /P0\/P1-classified service finding/i);
    assert.doesNotMatch(diff.summary, /newly observed P0 service finding/i);
    const fallback = generateRuleBasedDiffSummary(diff, testUserProfile);
    assert.match(fallback, /1 P0\/P1-classified service observation requiring review/i);
  });
});

run("DB-01 complete compatible scan with zero risk findings remains bounded and supported", async () => {
  await withTempCwd(async () => {
    const { currentRunUid } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.40",
          mac: "02:00:00:00:00:40",
          hostname: "ordinary-device.local",
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ],
    });
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(scorecard);
    assert.equal(scorecard.evidence.status, "supported");
    assert.equal(scorecard.riskPorts, 0);
    assert.match(scorecard.summary, /no P0 or P1 services were observed|no priority services were observed/i);
    assert.doesNotMatch(scorecard.summary, /safe|no security risk|expected parameters|normal|clean/i);

    const fallback = generateRuleBasedSummary(scorecard, testUserProfile);
    assert.match(fallback, /does not establish|not an all-clear|not a safety/i);
    assert.doesNotMatch(fallback, /no critical security issues|no urgent actions|clean security posture/i);
  });
});

run("DB-01 insufficient comparison cannot be persisted", async () => {
  const comparisonsRoute = await import("../src/app/api/comparisons/route.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      currentCoverage: "partial",
    });
    const forgedDiffData = createDiffData([]);
    forgedDiffData.baselineRunUid = baselineRunUid;
    forgedDiffData.currentRunUid = currentRunUid;
    forgedDiffData.evidence.status = "supported";
    forgedDiffData.evidence.supports.comparisonPersistence = true;
    const response = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", {
        baselineRunUid,
        currentRunUid,
        diffData: forgedDiffData,
      })
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.success, false);
    assert.equal(body.code, "comparison_insufficient_evidence");
    assert.equal(fs.existsSync(path.join(process.cwd(), "data", "comparisons", "index.json")), false);
  });
});

run("DB-01 comparison persistence ignores a forged request Diff and recomputes valid evidence", async () => {
  const comparisonsRoute = await import("../src/app/api/comparisons/route.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures();
    const authoritative = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(authoritative);

    const forgedDiffData = createDiffData([]);
    forgedDiffData.baselineRunUid = baselineRunUid;
    forgedDiffData.currentRunUid = currentRunUid;
    forgedDiffData.network = "forged-network";
    forgedDiffData.removedHosts = [
      { ip: "192.0.2.250", hostname: "forged", changeType: "removed" },
    ];
    forgedDiffData.portsClosed = [
      {
        ip: "192.0.2.250",
        port: 443,
        protocol: "tcp",
        service: "https",
        changeType: "closed",
      },
    ];

    const response = await comparisonsRoute.POST(
      createJsonRequest("/api/comparisons", "POST", {
        baselineRunUid,
        currentRunUid,
        title: "server recomputed",
        diffData: forgedDiffData,
      })
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.comparison.network, authoritative.network);
    assert.deepEqual(body.comparison.diffData, authoritative);
    assert.equal(
      body.comparison.diffData.removedHosts.some(
        (host) => host.ip === "192.0.2.250"
      ),
      false
    );
    assert.equal(
      body.comparison.diffData.portsClosed.some(
        (port) => port.ip === "192.0.2.250" && port.port === 443
      ),
      false
    );
  });
});

run("DB-01 legacy saved comparisons without evidence do not render as supported", async () => {
  const comparisonsRoute = await import("../src/app/api/comparisons/route.ts");

  await withTempCwd(async () => {
    const comparisonsDir = path.join(process.cwd(), "data", "comparisons");
    const legacyDiffData = { ...createDiffData([]) };
    delete legacyDiffData.evidence;
    fs.mkdirSync(comparisonsDir, { recursive: true });
    fs.writeFileSync(
      path.join(comparisonsDir, "index.json"),
      JSON.stringify({
        version: 1,
        comparisons: {
          LEGACY01: {
            comparisonId: "LEGACY01",
            baselineRunUid: "legacy-a",
            currentRunUid: "legacy-b",
            network: "legacy-network",
            createdAt: "2026-01-01T00:00:00.000Z",
            diffData: legacyDiffData,
            riskScore: 100,
            riskLabel: "Excellent",
          },
        },
        lastUpdated: "2026-01-01T00:00:00.000Z",
      })
    );

    const response = await comparisonsRoute.GET(
      new Request("http://localhost/api/comparisons")
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.comparisons, []);
  });
});

run("DB-01 persistence boundary recomputes instead of trusting a forged supported Diff", async () => {
  const comparisonsRegistry = await import("../src/lib/services/comparisons-registry.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      currentCoverage: "partial",
    });
    const forged = JSON.parse(JSON.stringify(createDiffData([])));
    forged.baselineRunUid = baselineRunUid;
    forged.currentRunUid = currentRunUid;
    forged.evidence.status = "supported";
    forged.evidence.reasonCodes = [
      "partial-coverage",
      "external-reachability-not-established",
    ];
    forged.evidence.coverage.current.status = "partial";
    forged.evidence.coverage.current.partial = true;
    forged.evidence.coverage.current.missingSources = ["discovery"];
    forged.evidence.supports.comparisonPersistence = true;

    assert.throws(
      // The extra argument demonstrates the reviewed boundary bypass. The
      // corrected implementation ignores caller-supplied conclusions and
      // recomputes from the registered run IDs.
      () => comparisonsRegistry.saveComparison(
        { baselineRunUid, currentRunUid },
        forged
      ),
      (error) => error?.name === "UnsupportedComparisonPersistenceError"
    );
    assert.equal(
      fs.existsSync(path.join(process.cwd(), "data", "comparisons", "index.json")),
      false
    );
  });
});

run("DB-01 forged registry evidence and unsupported findings stay non-authoritative", async () => {
  const comparisonsRegistry = await import("../src/lib/services/comparisons-registry.ts");

  await withTempCwd(async () => {
    const comparisonsDir = path.join(process.cwd(), "data", "comparisons");
    const indexPath = path.join(comparisonsDir, "index.json");
    fs.mkdirSync(comparisonsDir, { recursive: true });

    const partialDiff = JSON.parse(JSON.stringify(createDiffData([])));
    partialDiff.evidence.reasonCodes = [
      "partial-coverage",
      "external-reachability-not-established",
    ];
    partialDiff.evidence.coverage.current.status = "partial";
    partialDiff.evidence.coverage.current.partial = true;
    partialDiff.evidence.coverage.current.missingSources = ["discovery"];

    const uncertainDiff = JSON.parse(JSON.stringify(createDiffData([])));
    uncertainDiff.evidence.identity = { status: "uncertain", uncertainCount: 1 };

    const unsupportedFindingsDiff = JSON.parse(JSON.stringify(createDiffData([])));
    unsupportedFindingsDiff.evidence.supports.deviceAbsence = false;
    unsupportedFindingsDiff.evidence.supports.portClosure = false;
    unsupportedFindingsDiff.removedHosts = [
      { ip: "192.0.2.90", changeType: "removed" },
    ];
    unsupportedFindingsDiff.portsClosed = [
      {
        ip: "192.0.2.90",
        port: 443,
        protocol: "tcp",
        service: "https",
        changeType: "closed",
      },
    ];

    const truncatedCoverageDiff = JSON.parse(JSON.stringify(createDiffData([])));
    truncatedCoverageDiff.evidence.coverage.current.normalizationStatus = "truncated";
    truncatedCoverageDiff.evidence.coverage.current.normalizationReasonCodes = [
      "open-port-limit-exceeded",
    ];
    truncatedCoverageDiff.evidence.coverage.baseline.normalizationStatus = "truncated";
    truncatedCoverageDiff.evidence.coverage.baseline.normalizationReasonCodes = [
      "open-port-limit-exceeded",
    ];
    truncatedCoverageDiff.portsClosed = [
      {
        ip: "192.0.2.91",
        port: 443,
        protocol: "tcp",
        service: "https",
        changeType: "closed",
      },
    ];

    const conflictingProvenanceDiff = JSON.parse(JSON.stringify(createDiffData([])));
    conflictingProvenanceDiff.evidence.coverage.current.targetProvenanceStatus = "conflicting";
    conflictingProvenanceDiff.evidence.coverage.current.coverageReasonCodes = [
      "target-provenance-conflict",
    ];
    conflictingProvenanceDiff.evidence.coverage.baseline.targetProvenanceStatus = "conflicting";
    conflictingProvenanceDiff.evidence.coverage.baseline.coverageReasonCodes = [
      "target-provenance-conflict",
    ];
    conflictingProvenanceDiff.removedHosts = [
      { ip: "192.0.2.92", changeType: "removed" },
    ];

    const record = (comparisonId, diffData) => ({
      comparisonId,
      baselineRunUid: diffData.baselineRunUid,
      currentRunUid: diffData.currentRunUid,
      network: diffData.network,
      createdAt: "2026-02-09T00:00:00.000Z",
      diffData,
    });
    fs.writeFileSync(
      indexPath,
      JSON.stringify(
        {
          version: 2,
          comparisons: {
            FORGEPAR: record("FORGEPAR", partialDiff),
            FORGEIDN: record("FORGEIDN", uncertainDiff),
            FORGEOUT: record("FORGEOUT", unsupportedFindingsDiff),
            FORGETRN: record("FORGETRN", truncatedCoverageDiff),
            FORGEPRV: record("FORGEPRV", conflictingProvenanceDiff),
          },
          lastUpdated: "2026-02-09T00:00:00.000Z",
        },
        null,
        2
      )
    );
    const before = fs.readFileSync(indexPath);

    assert.deepEqual(comparisonsRegistry.listComparisons(), []);
    assert.equal(comparisonsRegistry.getComparisonById("FORGEPAR"), null);
    assert.equal(comparisonsRegistry.getComparisonById("FORGEIDN"), null);
    assert.equal(comparisonsRegistry.getComparisonById("FORGEOUT"), null);
    assert.equal(comparisonsRegistry.getComparisonById("FORGETRN"), null);
    assert.equal(comparisonsRegistry.getComparisonById("FORGEPRV"), null);
    assert.deepEqual(fs.readFileSync(indexPath), before);
  });
});

run("DB-01 valid registry mutations preserve co-resident legacy records", async () => {
  const comparisonsRegistry = await import("../src/lib/services/comparisons-registry.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures();
    const validDiff = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(validDiff);

    const comparisonsDir = path.join(process.cwd(), "data", "comparisons");
    const indexPath = path.join(comparisonsDir, "index.json");
    fs.mkdirSync(comparisonsDir, { recursive: true });
    const legacy = {
      comparisonId: "00",
      baselineRunUid: "legacy-a",
      currentRunUid: "legacy-b",
      network: "legacy-network",
      createdAt: "2026-01-01T00:00:00.000Z",
      diffData: { network: "legacy-network", summary: "legacy bytes stay here" },
      riskScore: 100,
      riskLabel: "Excellent",
      unknownLegacyField: { preserve: ["exactly", 1, true] },
    };
    fs.writeFileSync(
      indexPath,
      JSON.stringify(
        {
          version: 1,
          comparisons: { "00": legacy },
          lastUpdated: "2026-01-01T00:00:00.000Z",
        },
        null,
        2
      )
    );
    const legacyBytes = JSON.stringify(legacy);

    const originalDateNow = Date.now;
    const originalRandom = Math.random;
    let randomCall = 0;
    Date.now = () => 0;
    Math.random = () => (randomCall++ === 0 ? 0 : 0.5);
    let saved;
    try {
      // The second argument keeps this test failing on the reviewed API while
      // remaining ignored by the corrected server-recomputing boundary.
      saved = comparisonsRegistry.saveComparison(
        { baselineRunUid, currentRunUid, title: "valid" },
        validDiff
      );
    } finally {
      Date.now = originalDateNow;
      Math.random = originalRandom;
    }

    assert.notEqual(saved.comparisonId, "00");
    let persisted = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    assert.equal(JSON.stringify(persisted.comparisons["00"]), legacyBytes);
    assert.equal(persisted.comparisons[saved.comparisonId].title, "valid");
    assert.deepEqual(
      comparisonsRegistry.listComparisons().map((comparison) => comparison.comparisonId),
      [saved.comparisonId]
    );

    const updated = comparisonsRegistry.updateComparison(saved.comparisonId, {
      title: "updated",
      notes: "preserve legacy",
    });
    assert.equal(updated?.title, "updated");
    persisted = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    assert.equal(JSON.stringify(persisted.comparisons["00"]), legacyBytes);

    assert.equal(comparisonsRegistry.deleteComparison(saved.comparisonId), true);
    persisted = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    assert.equal(JSON.stringify(persisted.comparisons["00"]), legacyBytes);
    assert.equal(saved.comparisonId in persisted.comparisons, false);

    const beforeLegacyMutation = fs.readFileSync(indexPath);
    assert.equal(comparisonsRegistry.updateComparison("00", { title: "do not mutate" }), null);
    assert.equal(comparisonsRegistry.deleteComparison("00"), false);
    assert.deepEqual(fs.readFileSync(indexPath), beforeLegacyMutation);
  });
});

run("DB-01 malformed comparison registries cannot be overwritten by mutations", async () => {
  const comparisonsRegistry = await import("../src/lib/services/comparisons-registry.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures();
    const validDiff = computeDiff(baselineRunUid, currentRunUid);
    assert.ok(validDiff);

    const comparisonsDir = path.join(process.cwd(), "data", "comparisons");
    const indexPath = path.join(comparisonsDir, "index.json");
    fs.mkdirSync(comparisonsDir, { recursive: true });
    fs.writeFileSync(indexPath, "{ malformed-registry");
    const before = fs.readFileSync(indexPath);
    const integrityError = (error) => error?.name === "ComparisonRegistryIntegrityError";

    assert.throws(
      () => comparisonsRegistry.saveComparison(
        { baselineRunUid, currentRunUid },
        validDiff
      ),
      integrityError
    );
    assert.deepEqual(fs.readFileSync(indexPath), before);
    assert.throws(
      () => comparisonsRegistry.updateComparison("ANY", { title: "no" }),
      integrityError
    );
    assert.deepEqual(fs.readFileSync(indexPath), before);
    assert.throws(
      () => comparisonsRegistry.deleteComparison("ANY"),
      integrityError
    );
    assert.deepEqual(fs.readFileSync(indexPath), before);
  });
});

run("DB-01 insufficient comparison cannot invoke an LLM", async () => {
  const diffSummaryRoute = await import("../src/app/api/llm/diff-summary/route.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      currentCoverage: "partial",
    });
    const unsafeLegacyDiff = computeDiff(baselineRunUid, currentRunUid);
    let fetchCalls = 0;

    await withEnv(
      { OPENAI_API_KEY: "test-openai-key", ANTHROPIC_API_KEY: undefined },
      async () => {
        await withMockedFetch(async () => {
          fetchCalls += 1;
          return new Response(JSON.stringify({ choices: [{ message: { content: "unsafe" } }] }), {
            status: 200,
          });
        }, async () => {
          resetLLMRateLimitForTesting();
          const response = await diffSummaryRoute.POST(
            createJsonPostRequest(
              "/api/llm/diff-summary",
              {
                baselineRunUid,
                currentRunUid,
                diffData: unsafeLegacyDiff,
                userProfile: testUserProfile,
              },
              "198.51.100.210"
            )
          );
          const body = await response.json();

          assert.equal(response.status, 422);
          assert.equal(body.code, "comparison_insufficient_evidence");
          assert.equal(fetchCalls, 0);
        });
      }
    );
    resetLLMRateLimitForTesting();
  });
});

run("DB-01 insufficient Scorecard cannot invoke summary or executive LLM paths", async () => {
  const [scorecardSummaryRoute, executiveSummaryRoute] = await Promise.all([
    import("../src/app/api/llm/scorecard-summary/route.ts"),
    import("../src/app/api/llm/executive-summary/route.ts"),
  ]);

  await withTempCwd(async () => {
    const { currentRunUid } = writeDb01RunPairFixtures({ currentCoverage: "partial" });
    let fetchCalls = 0;

    await withEnv(
      { OPENAI_API_KEY: "test-openai-key", ANTHROPIC_API_KEY: undefined },
      async () => {
        await withMockedFetch(async () => {
          fetchCalls += 1;
          return new Response(JSON.stringify({ choices: [{ message: { content: "unsafe" } }] }), {
            status: 200,
          });
        }, async () => {
          resetLLMRateLimitForTesting();
          for (const [pathname, post, body] of [
            [
              "/api/llm/scorecard-summary",
              scorecardSummaryRoute.POST,
              { runUid: currentRunUid, userProfile: testUserProfile },
            ],
            [
              "/api/llm/executive-summary",
              executiveSummaryRoute.POST,
              { runUid: currentRunUid, userProfile: testUserProfile },
            ],
          ]) {
            const response = await post(
              createJsonPostRequest(pathname, body, `198.51.100.${pathname.includes("executive") ? "214" : "213"}`)
            );
            const responseBody = await response.json();
            assert.equal(response.status, 422);
            assert.equal(responseBody.code, "scorecard_insufficient_evidence");
          }
          assert.equal(fetchCalls, 0);
        });
      }
    );
    resetLLMRateLimitForTesting();
  });
});

run("DB-01 free-form providers cannot supply evidence summaries", async () => {
  const routeCases = await getLLMRouteCases();
  let fetchCalls = 0;
  const unsafeProviderText = [
    "## Evidence Status",
    "Status: supported.",
    "External reachability is not established.",
    "Internet exposure is confirmed and the network is safe, although compromise cannot be proven.",
    "No changes were detected; all devices are accounted for and the security posture is strong.",
    "Financial impact is $5,000,000, although breach probability cannot be estimated.",
  ].join("\n");

  await withEnv(
    { OPENAI_API_KEY: "test-openai-key", ANTHROPIC_API_KEY: undefined },
    async () => {
      await withMockedFetch(async () => {
        fetchCalls += 1;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: unsafeProviderText } }] }),
          { status: 200 }
        );
      }, async () => {
          for (let index = 0; index < routeCases.length; index += 1) {
            const routeCase = routeCases[index];
            resetLLMRateLimitForTesting();
            const response = await routeCase.post(
              createJsonPostRequest(
                routeCase.path,
                routeCase.body(),
                `198.51.100.${220 + index}`
              )
            );
            const body = await response.json();

            assert.equal(response.status, 200, routeCase.name);
            assert.equal(body.success, true, routeCase.name);
            assert.equal(body.isRuleBased, true, routeCase.name);
            assert.equal(body.provider, "rule-based", routeCase.name);
            assert.doesNotMatch(
              body.summary,
              /internet exposure is confirmed|network is safe|no changes were detected|all devices are accounted for|security posture is strong|financial impact is \$5,000,000/i,
              routeCase.name
            );
            assert.match(
              body.summary,
              /does not establish reachability|reachability beyond.*not established|do not establish reachability/i,
              routeCase.name
            );
          }
          assert.equal(fetchCalls, 0);
        });
    }
  );
  resetLLMRateLimitForTesting();
});

run("DB-01 internal port-impact path cannot invoke an LLM", async () => {
  const portImpactRoute = await import("../src/app/api/llm/port-impact/route.ts");
  let fetchCalls = 0;

  await withEnv(
    { OPENAI_API_KEY: "test-openai-key", ANTHROPIC_API_KEY: undefined },
    async () => {
      await withMockedFetch(async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
          status: 200,
        });
      }, async () => {
        resetLLMRateLimitForTesting();
        const response = await portImpactRoute.POST(
          createJsonPostRequest(
            "/api/llm/port-impact",
            { port: 3389, protocol: "tcp", service: "ms-wbt-server" },
            "198.51.100.211"
          )
        );
        const body = await response.json();

        assert.equal(response.status, 422);
        assert.equal(body.code, "external_evidence_required");
        assert.equal(fetchCalls, 0);
      });
    }
  );
  resetLLMRateLimitForTesting();
});

run("DB-01 API and exports preserve the same evidence status", async () => {
  const diffRoute = await import("../src/app/api/diff/route.ts");

  await withTempCwd(async () => {
    const { baselineRunUid, currentRunUid } = writeDb01RunPairFixtures({
      currentCoverage: "partial",
    });
    const response = await diffRoute.POST(
      createJsonRequest("/api/diff", "POST", { baselineRunUid, currentRunUid })
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.evidence.status, "insufficient-evidence");
    const csv = diffToCSV(body.data);
    const markdown = diffToMarkdown(body.data);
    assert.match(csv, /Evidence Status,insufficient-evidence/);
    assert.match(csv, /External Reachability,not-established/);
    assert.match(csv, /Supports device absence,false/);
    assert.match(csv, /Supports port closure,false/);
    assert.match(csv, /Supports stable baseline,false/);
    assert.match(csv, /Supports external reachability,false/);
    assert.match(csv, /Supports comparison persistence,false/);
    assert.match(csv, /Supports LLM summary,false/);
    assert.match(markdown, /Supports stable baseline: false/);
    assert.match(markdown, /Supports external reachability: false/);
    assert.doesNotMatch(csv, /Network baseline is stable|No hosts removed|No ports closed/);
  });
});

run("DB-01 scorecard export and rule fallback preserve evidence limitations", async () => {
  await withTempCwd(async () => {
    const { currentRunUid } = writeDb01RunPairFixtures({ currentCoverage: "partial" });
    const scorecard = buildScorecardData(currentRunUid);
    assert.ok(scorecard);

    const csv = scorecardToCSV(scorecard);
    const fallback = generateRuleBasedSummary(scorecard, testUserProfile);
    assert.match(csv, /Evidence Status,insufficient-evidence/);
    assert.match(csv, /External Reachability,not-established/);
    assert.match(fallback, /insufficient evidence/i);
    assert.doesNotMatch(fallback, /safe|clean|normal|no urgent actions|no security risk/i);
  });
});

run("DB-01 production demo is useful, synthetic, and evidence bounded", () => {
  const demo = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "demo", "demo-data.json"), "utf8")
  );

  for (const scorecard of [demo.baselineScorecard, demo.currentScorecard]) {
    assert.equal(scorecard.evidence.version, "psec.evidence.v1");
    assert.equal(scorecard.evidence.status, "supported");
    assert.equal(scorecard.evidence.supports.llmSummary, false);
    assert.equal(scorecard.riskPorts, scorecard.riskPortsDetail.length);
    assert.deepEqual(scorecard.evidence.coverage.current.expectedSources, [
      "ports",
      "discovery",
      "hosts_up",
      "arp_snapshot",
      "scan_metadata",
    ]);
    assert.deepEqual(scorecard.evidence.coverage.current.missingSources, []);
    assert.equal(scorecard.evidence.coverage.current.normalizationStatus, "complete");
    assert.equal(scorecard.evidence.coverage.current.targetProvenanceStatus, "verified");
    assert.match(scorecard.evidence.limitations.join("\n"), /synthetic demonstration/i);
  }

  assert.equal(demo.diff.evidence.status, "supported");
  assert.equal(demo.diff.evidence.supports.deviceAbsence, true);
  assert.equal(demo.diff.evidence.supports.portClosure, true);
  assert.equal(demo.diff.evidence.supports.comparisonPersistence, false);
  assert.equal(demo.diff.evidence.supports.llmSummary, false);
  assert.equal(demo.diff.newHosts.length, 1);
  assert.deepEqual(demo.diff.removedHosts, []);
  assert.equal(demo.diff.portsOpened.length, 1);
  assert.deepEqual(demo.diff.portsClosed, []);
  assert.deepEqual(demo.diff.riskFindings, demo.diff.portsOpened);
  assert.deepEqual(demo.diff.identityUncertain, []);
  assert.match(demo.diff.evidence.limitations.join("\n"), /synthetic demonstration/i);
  assert.doesNotMatch(
    demo.diff.summary,
    /internet exposure|perimeter failure|breach probability|financial impact|network (?:is )?safe/i
  );
});

run("DB-01 corrective normalization records the 256/257 open-port boundary and blocks false closure", async () => {
  await withTempCwd(async () => {
    const baselineRaw = createObservationRegistryBundle({
      runUid: "normalization-port-baseline",
      network: "normalization-lab",
      startedAt: "2026-07-01T10:00:00.000Z",
      endedAt: "2026-07-01T10:01:00.000Z",
      generatedAt: "2026-07-01T10:01:00.000Z",
    });
    const currentRaw = createObservationRegistryBundle({
      runUid: "normalization-port-current",
      network: "normalization-lab",
      startedAt: "2026-07-01T11:00:00.000Z",
      endedAt: "2026-07-01T11:01:00.000Z",
      generatedAt: "2026-07-01T11:01:00.000Z",
    });
    baselineRaw.devices = baselineRaw.devices.filter((device) => device.macs.includes("02:00:00:00:00:10"));
    currentRaw.devices = currentRaw.devices.filter((device) => device.macs.includes("02:00:00:00:00:10"));
    const baselineSource = baselineRaw.sources.find((source) => source.artifactLabel === "ports").sourceId;
    const currentSource = currentRaw.sources.find((source) => source.artifactLabel === "ports").sourceId;
    baselineRaw.devices[0].openPorts = [observationTestPort(baselineSource, 65535)];
    currentRaw.devices[0].openPorts = [
      ...Array.from({ length: 256 }, (_, index) => observationTestPort(currentSource, index + 1)),
      observationTestPort(currentSource, 65535),
    ];

    const at256Raw = cloneJson(currentRaw);
    at256Raw.devices[0].openPorts = at256Raw.devices[0].openPorts.slice(0, 256);
    const at256 = sanitizeObservationBundleV1(at256Raw);
    const at257 = sanitizeObservationBundleV1(currentRaw);
    const baseline = sanitizeObservationBundleV1(baselineRaw);
    const diff = buildDiffFromObservationBundles(baseline, at257);

    assert.equal(at256.normalization.status, "complete");
    assert.equal(at257.normalization.status, "truncated");
    assert.ok(at257.normalization.reasonCodes.includes("open-port-limit-exceeded"));
    assert.notEqual(at257.coverage.status, "complete");
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
  });
});

run("DB-01 legacy or internally inconsistent normalization provenance fails closed", async () => {
  await withTempCwd(async () => {
    const baselineRaw = createObservationRegistryBundle({
      runUid: "normalization-provenance-baseline",
      network: "normalization-provenance-lab",
      startedAt: "2026-07-01T10:00:00.000Z",
      endedAt: "2026-07-01T10:01:00.000Z",
      generatedAt: "2026-07-01T10:01:00.000Z",
    });
    const currentTemplate = createObservationRegistryBundle({
      runUid: "normalization-provenance-current",
      network: "normalization-provenance-lab",
      startedAt: "2026-07-01T11:00:00.000Z",
      endedAt: "2026-07-01T11:01:00.000Z",
      generatedAt: "2026-07-01T11:01:00.000Z",
    });
    baselineRaw.devices = baselineRaw.devices.filter((device) =>
      device.macs.includes("02:00:00:00:00:10")
    );
    currentTemplate.devices = currentTemplate.devices.filter((device) =>
      device.macs.includes("02:00:00:00:00:10")
    );
    const baselineSource = baselineRaw.sources.find(
      (source) => source.artifactLabel === "ports"
    ).sourceId;
    baselineRaw.devices[0].openPorts = [observationTestPort(baselineSource, 443)];
    currentTemplate.devices[0].openPorts = [];
    const baseline = sanitizeObservationBundleV1(baselineRaw);

    for (const testCase of [
      {
        name: "missing normalization record",
        reasonCode: "normalization-record-missing",
        mutate(bundle) {
          delete bundle.normalization;
        },
      },
      {
        name: "truncated status without reasons",
        reasonCode: "normalization-record-inconsistent",
        mutate(bundle) {
          bundle.normalization = { status: "truncated", reasonCodes: [], losses: [] };
        },
      },
    ]) {
      const imported = cloneJson(currentTemplate);
      testCase.mutate(imported);
      const current = sanitizeObservationBundleV1(imported);
      const diff = buildDiffFromObservationBundles(baseline, current);

      assert.equal(
        current.normalization.status,
        "truncated",
        `${testCase.name} was unsafely upgraded to complete`
      );
      assert.ok(current.normalization.reasonCodes.includes(testCase.reasonCode), testCase.name);
      assert.notEqual(current.coverage.status, "complete", testCase.name);
      assert.equal(diff.evidence.status, "insufficient-evidence", testCase.name);
      assert.equal(diff.evidence.supports.portClosure, false, testCase.name);
      assert.equal(diff.evidence.supports.comparisonPersistence, false, testCase.name);
      assert.equal(diff.evidence.supports.llmSummary, false, testCase.name);
      assert.deepEqual(diff.portsClosed, [], testCase.name);
    }
  });
});

run("DB-01 corrective normalization records malformed still-open evidence and blocks false closure", async () => {
  await withTempCwd(async () => {
    const baselineRaw = createObservationRegistryBundle({
      runUid: "normalization-invalid-port-baseline",
      network: "normalization-invalid-lab",
      startedAt: "2026-07-01T12:00:00.000Z",
      endedAt: "2026-07-01T12:01:00.000Z",
      generatedAt: "2026-07-01T12:01:00.000Z",
    });
    const currentRaw = createObservationRegistryBundle({
      runUid: "normalization-invalid-port-current",
      network: "normalization-invalid-lab",
      startedAt: "2026-07-01T13:00:00.000Z",
      endedAt: "2026-07-01T13:01:00.000Z",
      generatedAt: "2026-07-01T13:01:00.000Z",
    });
    baselineRaw.devices = baselineRaw.devices.filter((device) =>
      device.macs.includes("02:00:00:00:00:10")
    );
    currentRaw.devices = currentRaw.devices.filter((device) =>
      device.macs.includes("02:00:00:00:00:10")
    );
    const baselineSource = baselineRaw.sources.find(
      (source) => source.artifactLabel === "ports"
    ).sourceId;
    const currentSource = currentRaw.sources.find(
      (source) => source.artifactLabel === "ports"
    ).sourceId;
    baselineRaw.devices[0].openPorts = [observationTestPort(baselineSource, 443)];
    currentRaw.devices[0].openPorts = [
      {
        ...observationTestPort(currentSource, 443),
        port: "443",
      },
    ];

    const baseline = sanitizeObservationBundleV1(baselineRaw);
    const current = sanitizeObservationBundleV1(currentRaw);
    const diff = buildDiffFromObservationBundles(baseline, current);

    assert.equal(current.normalization.status, "truncated");
    assert.ok(current.normalization.reasonCodes.includes("invalid-open-port-dropped"));
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.portsClosed, []);
  });
});

run("DB-01 corrective normalization records the 1000/1001 device boundary", async () => {
  await withTempCwd(async () => {
    const raw = createObservationRegistryBundle({ runUid: "normalization-device-limit" });
    const template = raw.devices[0];
    const sourceId = raw.sources[0].sourceId;
    raw.devices = Array.from({ length: 1000 }, (_, index) =>
      observationTestDevice(template, index, sourceId)
    );
    const at1000 = sanitizeObservationBundleV1(raw);
    raw.devices.push(observationTestDevice(template, 1000, sourceId));
    const at1001 = sanitizeObservationBundleV1(raw);

    assert.equal(at1000.devices.length, 1000);
    assert.equal(at1000.normalization.status, "complete");
    assert.equal(at1001.devices.length, 1000);
    assert.equal(at1001.normalization.status, "truncated");
    assert.ok(at1001.normalization.reasonCodes.includes("device-limit-exceeded"));
    assert.notEqual(at1001.coverage.status, "complete");
  });
});

run("DB-01 corrective normalization records the 50/51 source boundary", async () => {
  await withTempCwd(async () => {
    const raw = createObservationRegistryBundle({ runUid: "normalization-source-limit" });
    const originalSources = cloneJson(raw.sources);
    while (raw.sources.length < 50) {
      const index = raw.sources.length + 1;
      raw.sources.push({
        ...cloneJson(originalSources[0]),
        sourceId: `src-extra-${index}`,
        artifactLabel: `supplemental-${index}`,
      });
    }
    const at50 = sanitizeObservationBundleV1(raw);
    raw.sources.push({
      ...cloneJson(originalSources[0]),
      sourceId: "src-extra-51",
      artifactLabel: "supplemental-51",
    });
    const at51 = sanitizeObservationBundleV1(raw);

    assert.equal(at50.sources.length, 50);
    assert.equal(at50.normalization.status, "complete");
    assert.equal(at51.sources.length, 50);
    assert.equal(at51.normalization.status, "truncated");
    assert.ok(at51.normalization.reasonCodes.includes("source-limit-exceeded"));
    assert.notEqual(at51.coverage.status, "complete");
  });
});

run("DB-01 imported observations preserve unknown collector and vantage fields as evidence loss", async () => {
  await withTempCwd(async () => {
    const baseline = sanitizeObservationBundleV1(
      createObservationRegistryBundle({
        runUid: "import-field-baseline",
        network: "import-field-lab",
        startedAt: "2026-07-01T14:00:00.000Z",
        endedAt: "2026-07-01T14:01:00.000Z",
        generatedAt: "2026-07-01T14:01:00.000Z",
      })
    );
    const validCurrent = createObservationRegistryBundle({
      runUid: "import-field-current",
      network: "import-field-lab",
      startedAt: "2026-07-01T15:00:00.000Z",
      endedAt: "2026-07-01T15:01:00.000Z",
      generatedAt: "2026-07-01T15:01:00.000Z",
    });
    validCurrent.devices[0].openPorts = [];

    for (const testCase of [
      {
        name: "missing",
        mutate(bundle) {
          delete bundle.collector.kind;
          delete bundle.vantage.type;
        },
      },
      {
        name: "invalid",
        mutate(bundle) {
          bundle.collector.kind = "forged-registered-collector";
          bundle.vantage.type = "forged-active-vantage";
        },
      },
    ]) {
      const imported = cloneJson(validCurrent);
      testCase.mutate(imported);
      const current = sanitizeObservationBundleV1(imported);
      const diff = buildDiffFromObservationBundles(baseline, current);
      const fallback = generateRuleBasedDiffSummary(diff, testUserProfile);

      assert.equal(current.collector.kind, "unknown", testCase.name);
      assert.equal(current.vantage.type, "unknown", testCase.name);
      assert.equal(current.normalization.status, "truncated", testCase.name);
      assert.ok(
        current.normalization.reasonCodes.includes("invalid-collector-kind"),
        testCase.name
      );
      assert.ok(
        current.normalization.reasonCodes.includes("invalid-vantage-type"),
        testCase.name
      );
      assert.equal(diff.evidence.status, "insufficient-evidence", testCase.name);
      assert.deepEqual(diff.removedHosts, [], testCase.name);
      assert.deepEqual(diff.portsClosed, [], testCase.name);
      assert.equal(diff.evidence.supports.comparisonPersistence, false, testCase.name);
      assert.equal(diff.evidence.supports.llmSummary, false, testCase.name);
      assert.match(fallback, /insufficient evidence/i, testCase.name);
      assert.doesNotMatch(fallback, /service closure.+supported|baseline is stable/i, testCase.name);
    }
  });
});

run("DB-01 imported coverage is derived from source provenance rather than self-declared fields", async () => {
  await withTempCwd(async () => {
    const baselineRaw = createObservationRegistryBundle({
      runUid: "import-coverage-baseline",
      network: "import-coverage-lab",
      startedAt: "2026-07-01T16:00:00.000Z",
      endedAt: "2026-07-01T16:01:00.000Z",
      generatedAt: "2026-07-01T16:01:00.000Z",
    });
    const removedDevice = cloneJson(baselineRaw.devices[0]);
    removedDevice.deviceId = "import-coverage-removed-device";
    removedDevice.ips = ["192.0.2.88"];
    removedDevice.macs = ["02:00:00:00:00:88"];
    removedDevice.hostnames = ["removed-device.example"];
    removedDevice.identityEvidence = removedDevice.identityEvidence.map((evidence) => {
      if (evidence.kind === "ip-address" || evidence.kind === "host-up") {
        return { ...evidence, value: "192.0.2.88" };
      }
      if (evidence.kind === "mac-address") {
        return { ...evidence, value: "02:00:00:00:00:88" };
      }
      if (evidence.kind === "arp-neighbor") {
        return { ...evidence, value: "192.0.2.88 02:00:00:00:00:88" };
      }
      if (evidence.kind === "hostname") {
        return { ...evidence, value: "removed-device.example" };
      }
      return evidence;
    });
    baselineRaw.devices.push(removedDevice);

    const currentRaw = createObservationRegistryBundle({
      runUid: "import-coverage-current",
      network: "import-coverage-lab",
      startedAt: "2026-07-01T17:00:00.000Z",
      endedAt: "2026-07-01T17:01:00.000Z",
      generatedAt: "2026-07-01T17:01:00.000Z",
    });
    currentRaw.devices[0].openPorts = [];
    currentRaw.sources = currentRaw.sources.filter(
      (source) => !["hosts_up", "arp_snapshot", "scan_metadata"].includes(source.artifactLabel)
    );
    const retainedSourceIds = new Set(currentRaw.sources.map((source) => source.sourceId));
    currentRaw.devices[0].identityEvidence = currentRaw.devices[0].identityEvidence.filter(
      (evidence) => retainedSourceIds.has(evidence.sourceId)
    );
    currentRaw.coverage = {
      status: "complete",
      score: 1,
      expectedSources: ["ports", "discovery"],
      presentSources: [
        "ports",
        "discovery",
        "hosts_up",
        "arp_snapshot",
        "scan_metadata",
      ],
      missingSources: [],
      notes: [],
      reasonCodes: [],
      targetProvenance: {
        status: "verified",
        declaredScope: currentRaw.site.networkScope,
        observedScopes: [currentRaw.site.networkScope],
      },
    };
    currentRaw.batch.partial = false;

    const baseline = sanitizeObservationBundleV1(baselineRaw);
    const current = sanitizeObservationBundleV1(currentRaw);
    const diff = buildDiffFromObservationBundles(baseline, current);
    const fallback = generateRuleBasedDiffSummary(diff, testUserProfile);

    assert.deepEqual(current.coverage.expectedSources, comparisonExpectedSources);
    assert.deepEqual(current.coverage.presentSources, ["ports", "discovery"]);
    assert.deepEqual(current.coverage.missingSources, [
      "hosts_up",
      "arp_snapshot",
      "scan_metadata",
    ]);
    assert.equal(current.coverage.score, 0.6);
    assert.equal(current.coverage.status, "partial");
    assert.equal(current.batch.partial, true);
    assert.equal(diff.evidence.status, "insufficient-evidence");
    assert.deepEqual(diff.removedHosts, []);
    assert.deepEqual(diff.portsClosed, []);
    assert.equal(diff.evidence.supports.comparisonPersistence, false);
    assert.equal(diff.evidence.supports.llmSummary, false);
    assert.match(fallback, /insufficient evidence/i);
    assert.doesNotMatch(
      fallback,
      /device absence.+supported|service closure.+supported|baseline is stable/i
    );
  });
});

run("DB-01 corrective coverage rejects empty discovery support artifacts", async () => {
  await withTempCwd(async () => {
    const { currentManifest } = writeDb01RunPairFixtures();
    fs.writeFileSync(currentManifest.keyFiles.hosts_up[0], "");
    fs.writeFileSync(currentManifest.keyFiles.snapshots[0], "");
    const current = adaptRunManifestToObservationBundleV1(currentManifest);

    assert.notEqual(current.coverage.status, "complete");
    assert.equal(current.coverage.presentSources.includes("hosts_up"), false);
    assert.equal(current.coverage.presentSources.includes("arp_snapshot"), false);
    assert.ok(current.coverage.reasonCodes.includes("empty-hosts-up"));
    assert.ok(current.coverage.reasonCodes.includes("empty-arp-snapshot"));
  });
});

run("DB-01 corrective coverage rejects a one-host discovery presented as a larger scope", async () => {
  await withTempCwd(async () => {
    const { currentManifest } = writeDb01RunPairFixtures({
      currentHosts: [
        {
          ip: "192.0.2.10",
          mac: "02:00:00:00:00:10",
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ],
      currentScope: "192.0.2.0/24",
    });
    const discoveryPath = currentManifest.keyFiles.discovery[0];
    const narrowXml = createObservationNmapXml([
      { ip: "192.0.2.10", mac: "02:00:00:00:00:10", ports: [] },
    ]).replace(/<nmaprun[^>]*>/, '<nmaprun args="nmap -sn 192.0.2.10">');
    fs.writeFileSync(discoveryPath, narrowXml);
    const current = adaptRunManifestToObservationBundleV1(currentManifest);

    assert.notEqual(current.coverage.status, "complete");
    assert.ok(current.coverage.reasonCodes.includes("target-coverage-unverified"));
  });
});

run("DB-01 corrective coverage rejects conflicting metadata and Nmap target provenance", async () => {
  await withTempCwd(async () => {
    const { currentManifest } = writeDb01RunPairFixtures({ currentScope: "192.0.2.0/24" });
    for (const label of ["ports", "discovery"]) {
      const xmlPath = currentManifest.keyFiles[label][0];
      const xml = fs.readFileSync(xmlPath, "utf8");
      fs.writeFileSync(
        xmlPath,
        xml.replace(/<nmaprun[^>]*>/, '<nmaprun args="nmap 198.51.100.0/24">')
      );
    }
    const current = adaptRunManifestToObservationBundleV1(currentManifest);

    assert.notEqual(current.coverage.status, "complete");
    assert.ok(current.coverage.reasonCodes.includes("target-provenance-conflict"));
  });
});

run("DB-01 corrective identity keeps explicitly weak shared MAC evidence uncertain", async () => {
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "weak-mac-baseline",
      network: "identity-lab",
      startedAt: "2026-07-02T10:00:00.000Z",
      endedAt: "2026-07-02T10:01:00.000Z",
      generatedAt: "2026-07-02T10:01:00.000Z",
    });
    const current = createObservationRegistryBundle({
      runUid: "weak-mac-current",
      network: "identity-lab",
      startedAt: "2026-07-02T11:00:00.000Z",
      endedAt: "2026-07-02T11:01:00.000Z",
      generatedAt: "2026-07-02T11:01:00.000Z",
    });
    for (const bundle of [baseline, current]) {
      bundle.devices = bundle.devices.filter((device) => device.macs.includes("02:00:00:00:00:10"));
      for (const evidence of bundle.devices[0].identityEvidence) {
        if (evidence.kind === "mac-address") evidence.confidence = "weak";
      }
    }
    current.devices[0].ips = ["192.0.2.77"];
    const diff = buildDiffFromObservationBundles(baseline, current);

    assert.equal(diff.evidence.status, "uncertain");
    assert.ok(diff.evidence.reasonCodes.includes("identity-uncertain"));
    assert.deepEqual(diff.portsClosed, []);
  });
});

run("DB-01 corrective identity records conflicting transitive MAC and IP evidence without merging", async () => {
  await withTempCwd(async () => {
    const { currentManifest } = writeDb01RunPairFixtures({
      currentHosts: [
        { ip: "192.0.2.10", mac: "02:00:00:00:00:AA", ports: [] },
        { ip: "192.0.2.20", mac: "02:00:00:00:00:BB", ports: [] },
      ],
    });
    fs.writeFileSync(
      currentManifest.keyFiles.discovery[0],
      createObservationNmapXml([
        { ip: "192.0.2.10", mac: "02:00:00:00:00:BB", ports: [] },
      ])
    );
    const current = adaptRunManifestToObservationBundleV1(currentManifest);

    assert.equal(current.identity.status, "conflicting");
    assert.ok(current.identity.reasonCodes.includes("conflicting-identifiers"));
    assert.ok(current.devices.length >= 2);
  });
});

run("DB-01 corrective identity treats one observed MAC reused by multiple devices as uncertain", async () => {
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "mac-reuse-baseline",
      network: "identity-lab",
      startedAt: "2026-07-03T10:00:00.000Z",
      endedAt: "2026-07-03T10:01:00.000Z",
      generatedAt: "2026-07-03T10:01:00.000Z",
    });
    const current = createObservationRegistryBundle({
      runUid: "mac-reuse-current",
      network: "identity-lab",
      startedAt: "2026-07-03T11:00:00.000Z",
      endedAt: "2026-07-03T11:01:00.000Z",
      generatedAt: "2026-07-03T11:01:00.000Z",
    });
    baseline.devices = baseline.devices.filter((device) => device.macs.includes("02:00:00:00:00:10"));
    current.devices = current.devices.filter((device) => device.macs.includes("02:00:00:00:00:10"));
    const reused = cloneJson(current.devices[0]);
    reused.deviceId = "second-record-sharing-mac";
    reused.ips = ["192.0.2.77"];
    reused.identityEvidence = reused.identityEvidence.map((evidence) =>
      evidence.kind === "ip-address" ? { ...evidence, value: "192.0.2.77" } : evidence
    );
    current.devices.push(reused);
    const normalizedCurrent = sanitizeObservationBundleV1(current);
    const diff = buildDiffFromObservationBundles(baseline, normalizedCurrent);

    assert.equal(normalizedCurrent.identity.status, "conflicting");
    assert.equal(diff.evidence.status, "uncertain");
    assert.deepEqual(diff.portsOpened, []);
    assert.deepEqual(diff.portsClosed, []);
  });
});

run("DB-01 corrective compatibility rejects overlapping collection intervals", async () => {
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "interval-baseline",
      network: "interval-lab",
      startedAt: "2026-07-04T10:00:00.000Z",
      endedAt: "2026-07-04T10:10:00.000Z",
      generatedAt: "2026-07-04T10:10:00.000Z",
    });
    const current = createObservationRegistryBundle({
      runUid: "interval-current",
      network: "interval-lab",
      startedAt: "2026-07-04T10:05:00.000Z",
      endedAt: "2026-07-04T10:15:00.000Z",
      generatedAt: "2026-07-04T10:15:00.000Z",
    });

    assert.throws(
      () => buildDiffFromObservationBundles(baseline, current),
      (error) => error instanceof DiffComparisonError && error.code === "overlapping-collection-intervals"
    );
  });
});

run("DB-01 corrective compatibility rejects changed collection vantage and collector position", async () => {
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "vantage-baseline",
      network: "vantage-lab",
      startedAt: "2026-07-05T10:00:00.000Z",
      endedAt: "2026-07-05T10:01:00.000Z",
      generatedAt: "2026-07-05T10:01:00.000Z",
    });
    const current = createObservationRegistryBundle({
      runUid: "vantage-current",
      network: "vantage-lab",
      startedAt: "2026-07-05T11:00:00.000Z",
      endedAt: "2026-07-05T11:01:00.000Z",
      generatedAt: "2026-07-05T11:01:00.000Z",
    });
    current.vantage.type = "packet-highway-mirror-tap";
    assert.throws(
      () => buildDiffFromObservationBundles(baseline, current),
      (error) => error instanceof DiffComparisonError && error.code === "incompatible-vantage"
    );

    current.vantage.type = baseline.vantage.type;
    current.vantage.collectorHost = "different-collector-position";
    assert.throws(
      () => buildDiffFromObservationBundles(baseline, current),
      (error) => error instanceof DiffComparisonError && error.code === "incompatible-collector"
    );
  });
});

run("DB-01 corrective compatibility accepts canonical scope and run-type aliases", async () => {
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "canonical-baseline",
      network: "canonical-lab",
      startedAt: "2026-07-06T10:00:00.000Z",
      endedAt: "2026-07-06T10:01:00.000Z",
      generatedAt: "2026-07-06T10:01:00.000Z",
    });
    const current = createObservationRegistryBundle({
      runUid: "canonical-current",
      network: "canonical-lab",
      startedAt: "2026-07-06T11:00:00.000Z",
      endedAt: "2026-07-06T11:01:00.000Z",
      generatedAt: "2026-07-06T11:01:00.000Z",
    });
    baseline.site.networkScope = "192.0.2.7/24";
    baseline.vantage.target = "192.0.2.7/24";
    baseline.vantage.runType = "baselinekit_v0";
    current.site.networkScope = "192.0.2.0/24";
    current.vantage.target = "192.0.2.0/24";
    current.vantage.runType = "baselinekit-v0";

    const diff = buildDiffFromObservationBundles(baseline, current);
    assert.ok(diff);
  });
});

run("DB-01 corrective Activity fails closed instead of emitting closure from partial current evidence", async () => {
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "activity-policy-baseline",
      network: "activity-policy-lab",
      startedAt: "2026-07-07T10:00:00.000Z",
      endedAt: "2026-07-07T10:01:00.000Z",
      generatedAt: "2026-07-07T10:01:00.000Z",
    });
    const currentComplete = createObservationRegistryBundle({
      runUid: "activity-policy-current",
      network: "activity-policy-lab",
      startedAt: "2026-07-07T11:00:00.000Z",
      endedAt: "2026-07-07T11:01:00.000Z",
      generatedAt: "2026-07-07T11:01:00.000Z",
    });
    const current = makePartialCurrentBundleWithClosedPort(currentComplete);
    registerObservationBundle(baseline, { evaluatedAt: "2026-07-07T12:00:00.000Z" });
    registerObservationBundle(current, { evaluatedAt: "2026-07-07T12:00:00.000Z" });

    const activity = buildNetworkActivity({ evaluatedAt: "2026-07-07T12:00:00.000Z" });
    assert.equal(activity.status, "insufficient-evidence");
    assert.equal(
      activity.events.some((event) => event.type === "service-or-port-closed"),
      false
    );
    assert.doesNotMatch(activity.summary, /no meaningful changes/i);
    assert.ok(activity.evidence.reasonCodes.includes("partial-coverage"));
  });
});

run("DB-01 corrective Statement cannot become ready or export stability from insufficient comparisons", async () => {
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "statement-policy-baseline",
      network: "statement-policy-lab",
      startedAt: "2026-07-08T10:00:00.000Z",
      endedAt: "2026-07-08T10:01:00.000Z",
      generatedAt: "2026-07-08T10:01:00.000Z",
    });
    const current = makePartialCurrentBundleWithClosedPort(
      createObservationRegistryBundle({
        runUid: "statement-policy-current",
        network: "statement-policy-lab",
        startedAt: "2026-07-08T11:00:00.000Z",
        endedAt: "2026-07-08T11:01:00.000Z",
        generatedAt: "2026-07-08T11:01:00.000Z",
      })
    );
    registerObservationBundle(baseline, { evaluatedAt: "2026-07-08T12:00:00.000Z" });
    registerObservationBundle(current, { evaluatedAt: "2026-07-08T12:00:00.000Z" });

    const statement = buildNetworkStatement({
      siteId: baseline.site.siteId,
      from: "2026-07-08T00:00:00.000Z",
      to: "2026-07-08T23:59:59.999Z",
      evaluatedAt: "2026-07-08T12:00:00.000Z",
    });
    const markdown = renderNetworkStatementMarkdown(statement);

    assert.equal(statement.status, "insufficient-evidence");
    assert.ok(statement.evidence.reasonCodes.includes("partial-coverage"));
    assert.match(markdown, /insufficient-evidence|partial coverage/i);
    assert.doesNotMatch(markdown, /appeared stable|no deterministic change events|stability reflects/i);
  });
});

run("DB-01 corrective device responses cannot persist against an unsupported Activity conclusion", async () => {
  const deviceResponseRoute = await import("../src/app/api/activity/device-response/route.ts");
  await withTempCwd(async () => {
    const baseline = createObservationRegistryBundle({
      runUid: "response-policy-baseline",
      network: "response-policy-lab",
      startedAt: "2026-07-09T10:00:00.000Z",
      endedAt: "2026-07-09T10:01:00.000Z",
      generatedAt: "2026-07-09T10:01:00.000Z",
    });
    const current = makePartialCurrentBundleWithClosedPort(
      createObservationRegistryBundle({
        runUid: "response-policy-current",
        network: "response-policy-lab",
        startedAt: "2026-07-09T11:00:00.000Z",
        endedAt: "2026-07-09T11:01:00.000Z",
        generatedAt: "2026-07-09T11:01:00.000Z",
      })
    );
    registerObservationBundle(baseline, { evaluatedAt: "2026-07-09T12:00:00.000Z" });
    registerObservationBundle(current, { evaluatedAt: "2026-07-09T12:00:00.000Z" });
    const device = current.devices.find((candidate) => candidate.macs.includes("02:00:00:00:00:10"));
    assert.ok(device);
    const target = buildDeviceResponseTarget({
      siteId: current.site.siteId,
      observationId: current.observationId,
      deviceId: device.deviceId,
      macs: device.macs,
      identityRuleId: "identity.mac",
      identityValues: device.macs,
    });
    assert.ok(target);

    const response = await deviceResponseRoute.POST(
      createJsonRequest("/api/activity/device-response", "POST", {
        target,
        state: "investigate",
        friendlyName: "Unsupported closure",
      })
    );
    const body = await response.json();
    assert.equal(response.status, 422);
    assert.equal(body.success, false);
    assert.equal(fs.existsSync(path.join(process.cwd(), "data", "device-responses", "index.json")), false);
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

    const malformedXmlPath = path.join(extractedDir, "broken.xml");
    fs.writeFileSync(malformedXmlPath, "<nmaprun><host>");
    const malformedXmlResponse = await parseRoute.POST(
      createJsonRequest("/api/parse", "POST", {
        xmlPath: path.join("data", "extracted", "sample", "broken.xml"),
      })
    );
    await assertJsonError(malformedXmlResponse, 400, /not valid Nmap XML/);

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

run("ingest POST accepts Windows-style ZIP member paths", async () => {
  const ingestRoute = await import("../src/app/api/ingest/route.ts");

  await withTempCwd(async () => {
    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    const zipPath = path.join(uploadsDir, "windows-style-scan.zip");
    fs.mkdirSync(uploadsDir, { recursive: true });
    writeZip(zipPath, [
      {
        name: "placeholder.xml",
        unsafeName: "home-lab\\rawscans\\2026-02-08_1000_baselinekit_v0\\ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [{ port: 80, protocol: "tcp", service: "http" }],
          },
        ]),
      },
    ]);

    const ingestResponse = await ingestRoute.POST(
      createJsonRequest("/api/ingest", "POST", {
        zipPath: path.join("data", "uploads", "windows-style-scan.zip"),
        network: "home-lab",
      })
    );
    const ingestBody = await ingestResponse.json();

    assert.equal(ingestResponse.status, 200);
    assert.equal(ingestBody.success, true);
    assert.equal(ingestBody.runs.length, 1);
    assert.equal(ingestBody.newRuns, 1);
    assert.equal(ingestBody.duplicateRuns, 0);
    assert.equal(ingestBody.observations.created, 1);
    assert.equal(ingestBody.observations.failed, 0);
    assert.deepEqual(ingestBody.observations.warnings, []);
    assertObservationRegistryOutputSafe(readObservationRegistryFilesText());
  });
});
run("ingest POST creates observation records that populate network activity", async () => {
  const ingestRoute = await import("../src/app/api/ingest/route.ts");

  await withTempCwd(async () => {
    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    const zipPath = path.join(uploadsDir, "activity-scans.zip");
    fs.mkdirSync(uploadsDir, { recursive: true });
    writeZip(zipPath, [
      {
        name: "home-lab/rawscans/2026-02-01_1000_baselinekit_v0/ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [{ port: 80, protocol: "tcp", service: "http" }],
          },
        ]),
      },
      {
        name: "home-lab/rawscans/2026-02-08_1000_baselinekit_v0/ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [
              { port: 80, protocol: "tcp", service: "http" },
              { port: 443, protocol: "tcp", service: "https" },
            ],
          },
        ]),
      },
    ]);

    const ingestResponse = await ingestRoute.POST(
      createJsonRequest("/api/ingest", "POST", {
        zipPath: path.join("data", "uploads", "activity-scans.zip"),
        network: "home-lab",
      })
    );
    const ingestBody = await ingestResponse.json();
    const observations = listObservations(
      { network: "home-lab", order: "asc" },
      { evaluatedAt: "2026-02-09T00:00:00.000Z" }
    );
    const activity = buildNetworkActivity({
      evaluatedAt: "2026-02-09T00:00:00.000Z",
    });

    assert.equal(ingestResponse.status, 200);
    assert.equal(ingestBody.success, true);
    assert.equal(ingestBody.runs.length, 2);
    assert.equal(ingestBody.observations.created, 2);
    assert.equal(ingestBody.observations.failed, 0);
    assert.deepEqual(ingestBody.observations.warnings, []);
    assert.equal(observations.length, 2);
    assert.equal(activity.status, "insufficient-evidence");
    assert.equal(activity.site.networkName, "home-lab");
    assert.equal(activity.events.length, 0);
    assert.match(activity.summary, /insufficient|unsupported|no supported/i);
    assertObservationRegistryOutputSafe(readObservationRegistryFilesText());
  });
});

run("ingest POST preserves scan runs when observation registration fails", async () => {
  const ingestRoute = await import("../src/app/api/ingest/route.ts");

  await withMutedConsoleMethods(["error"], async () => {
    await withTempCwd(async () => {
      const uploadsDir = path.join(process.cwd(), "data", "uploads");
      const observationsPath = path.join(process.cwd(), "data", "observations");
      const zipPath = path.join(uploadsDir, "activity-observation-failure.zip");
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.mkdirSync(path.dirname(observationsPath), { recursive: true });
      fs.writeFileSync(observationsPath, "not a directory");
      writeZip(zipPath, [
        {
          name: "home-lab/rawscans/2026-02-01_1000_baselinekit_v0/ports_top200_open.xml",
          content: createObservationNmapXml([
            {
              ip: "192.0.2.10",
              mac: "02:00:00:00:00:10",
              vendor: "Example Devices",
              hostname: "family-laptop.local",
              ports: [{ port: 80, protocol: "tcp", service: "http" }],
            },
          ]),
        },
      ]);

      const ingestResponse = await ingestRoute.POST(
        createJsonRequest("/api/ingest", "POST", {
          zipPath: path.join("data", "uploads", "activity-observation-failure.zip"),
          network: "home-lab",
        })
      );
      const ingestBody = await ingestResponse.json();
      const runsIndex = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "data", "runs", "index.json"), "utf-8")
      );
      const warningText = ingestBody.observations.warnings.join("\n");

      assert.equal(ingestResponse.status, 200);
      assert.equal(ingestBody.success, true);
      assert.equal(ingestBody.runs.length, 1);
      assert.equal(ingestBody.newRuns, 1);
      assert.equal(Object.keys(runsIndex.runs).length, 1);
      assert.equal(ingestBody.observations.created, 0);
      assert.equal(ingestBody.observations.failed, 1);
      assert.equal(ingestBody.observations.warnings.length, 1);
      assert.match(ingestBody.observations.warnings[0], /activity observation record could not be created/);
      assert.doesNotMatch(warningText, /[A-Za-z]:\\|\/tmp\/|rawscans|<nmaprun|192\.0\.2\.10/);
    });
  });
});

run("ingest POST is idempotent for duplicate scan uploads", async () => {
  const ingestRoute = await import("../src/app/api/ingest/route.ts");

  await withTempCwd(async () => {
    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    const zipPath = path.join(uploadsDir, "idempotent-scans.zip");
    fs.mkdirSync(uploadsDir, { recursive: true });
    writeZip(zipPath, [
      {
        name: "home-lab/rawscans/2026-02-01_1000_baselinekit_v0/ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [{ port: 80, protocol: "tcp", service: "http" }],
          },
        ]),
      },
      {
        name: "home-lab/rawscans/2026-02-08_1000_baselinekit_v0/ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [
              { port: 80, protocol: "tcp", service: "http" },
              { port: 443, protocol: "tcp", service: "https" },
            ],
          },
        ]),
      },
    ]);

    const ingestOnce = async () => {
      const response = await ingestRoute.POST(
        createJsonRequest("/api/ingest", "POST", {
          zipPath: path.join("data", "uploads", "idempotent-scans.zip"),
          network: "home-lab",
        })
      );
      return response.json();
    };

    const firstBody = await ingestOnce();
    const firstObservations = listObservations(
      { network: "home-lab", order: "asc" },
      { evaluatedAt: "2026-02-09T00:00:00.000Z" }
    );
    const firstActivity = buildNetworkActivity({ evaluatedAt: "2026-02-09T00:00:00.000Z" });

    assert.equal(firstBody.success, true);
    assert.equal(firstBody.newRuns, 2);
    assert.equal(firstBody.duplicateRuns, 0);
    assert.equal(firstBody.observations.created, 2);
    assert.equal(firstBody.observations.duplicate, 0);
    assert.equal(firstBody.observations.failed, 0);
    assert.equal(firstObservations.length, 2);
    assert.equal(firstActivity.status, "insufficient-evidence");

    // Re-uploading the exact same scan must not create new runs or new
    // observation records, and must not pollute /activity with repeated
    // same-timestamp observations.
    const secondBody = await ingestOnce();
    const secondObservations = listObservations(
      { network: "home-lab", order: "asc" },
      { evaluatedAt: "2026-02-09T00:00:00.000Z" }
    );
    const secondActivity = buildNetworkActivity({ evaluatedAt: "2026-02-09T00:00:00.000Z" });

    assert.equal(secondBody.success, true);
    assert.equal(secondBody.newRuns, 0, "duplicate upload must not register new runs");
    assert.equal(secondBody.duplicateRuns, 2, "scan run dedupe counts must be preserved");
    assert.equal(secondBody.observations.created, 0, "duplicate upload must not create observations");
    assert.equal(secondBody.observations.duplicate, 2);
    assert.equal(secondBody.observations.failed, 0);
    assert.deepEqual(secondBody.observations.warnings, []);

    assert.equal(secondObservations.length, 2, "duplicate upload must not add observation records");
    assert.deepEqual(
      secondObservations.map((entry) => entry.registryId).sort(),
      firstObservations.map((entry) => entry.registryId).sort(),
      "observation registry identities must be stable across duplicate uploads"
    );
    assert.equal(secondActivity.status, "insufficient-evidence");
    assert.equal(
      secondActivity.events.length,
      firstActivity.events.length,
      "/activity must not gain repeated events from duplicate uploads"
    );
    assertObservationRegistryOutputSafe(readObservationRegistryFilesText());
  });
});

run("ingest POST dedupes old-style observations by source run identity", async () => {
  const ingestRoute = await import("../src/app/api/ingest/route.ts");

  await withTempCwd(async () => {
    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    const observationsDir = path.join(process.cwd(), "data", "observations");
    const zipPath = path.join(uploadsDir, "old-style-observation-scans.zip");
    fs.mkdirSync(uploadsDir, { recursive: true });
    writeZip(zipPath, [
      {
        name: "home-lab/rawscans/2026-02-01_1000_baselinekit_v0/ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [{ port: 80, protocol: "tcp", service: "http" }],
          },
        ]),
      },
      {
        name: "home-lab/rawscans/2026-02-08_1000_baselinekit_v0/ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [
              { port: 80, protocol: "tcp", service: "http" },
              { port: 443, protocol: "tcp", service: "https" },
            ],
          },
        ]),
      },
    ]);

    const ingestOnce = async () => {
      const response = await ingestRoute.POST(
        createJsonRequest("/api/ingest", "POST", {
          zipPath: path.join("data", "uploads", "old-style-observation-scans.zip"),
          network: "home-lab",
        })
      );
      return response.json();
    };

    const firstBody = await ingestOnce();
    const runsIndex = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "runs", "index.json"), "utf-8")
    );
    const runUids = Object.keys(runsIndex.runs).sort();

    assert.equal(firstBody.success, true);
    assert.equal(firstBody.newRuns, 2);
    assert.equal(firstBody.observations.created, 2);
    assert.equal(runUids.length, 2);

    fs.rmSync(observationsDir, { recursive: true, force: true });
    assert.equal(listObservations({ network: "home-lab" }).length, 0);

    for (const [index, runUid] of runUids.entries()) {
      const deterministicBundle = buildObservationBundleV1FromRun(runUid);
      const oldStyleBundle = buildObservationBundleV1FromRun(runUid, {
        generatedAt: `2026-06-19T12:00:0${index}.000Z`,
      });

      assert.ok(deterministicBundle);
      assert.ok(oldStyleBundle);
      assert.equal(oldStyleBundle.batch.sourceRunUid, deterministicBundle.batch.sourceRunUid);
      assert.equal(oldStyleBundle.observationId, deterministicBundle.observationId);
      assert.notEqual(
        computeObservationBundleContentHash(oldStyleBundle),
        computeObservationBundleContentHash(deterministicBundle),
        "old wall-clock generatedAt must reproduce the compatibility gap"
      );

      const oldStyleResult = registerObservationBundle(oldStyleBundle, {
        importedAt: "2026-06-19T12:30:00.000Z",
        evaluatedAt: "2026-06-19T12:30:00.000Z",
      });
      assert.equal(oldStyleResult.isNew, true);
    }

    const oldStyleObservations = listObservations(
      { network: "home-lab", order: "asc" },
      { evaluatedAt: "2026-06-20T00:00:00.000Z" }
    );
    const oldStyleRegistryIds = oldStyleObservations
      .map((entry) => entry.registryId)
      .sort();
    const oldStyleActivity = buildNetworkActivity({
      evaluatedAt: "2026-06-20T00:00:00.000Z",
    });

    assert.equal(oldStyleObservations.length, 2);
    assert.equal(oldStyleActivity.status, "insufficient-evidence");

    const secondBody = await ingestOnce();
    const secondObservations = listObservations(
      { network: "home-lab", order: "asc" },
      { evaluatedAt: "2026-06-20T00:00:00.000Z" }
    );
    const secondActivity = buildNetworkActivity({
      evaluatedAt: "2026-06-20T00:00:00.000Z",
    });

    assert.equal(secondBody.success, true);
    assert.equal(secondBody.newRuns, 0, "existing scan runs must still dedupe");
    assert.equal(secondBody.duplicateRuns, 2);
    assert.equal(secondBody.observations.created, 0);
    assert.equal(secondBody.observations.duplicate, 2);
    assert.equal(secondBody.observations.failed, 0);
    assert.deepEqual(secondBody.observations.warnings, []);
    assert.equal(secondObservations.length, 2, "old-style same-run observations must not duplicate");
    assert.deepEqual(
      secondObservations.map((entry) => entry.registryId).sort(),
      oldStyleRegistryIds,
      "existing old-style observation records must be preserved"
    );
    assert.equal(secondActivity.status, "insufficient-evidence");
    assert.equal(
      secondActivity.events.length,
      oldStyleActivity.events.length,
      "/activity must not gain repeated same-run events after compatibility dedupe"
    );
    assertObservationRegistryOutputSafe(readObservationRegistryFilesText());
  });
});

run("ingest POST backfills a missing observation for an existing run idempotently", async () => {
  const ingestRoute = await import("../src/app/api/ingest/route.ts");

  await withTempCwd(async () => {
    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    const observationsDir = path.join(process.cwd(), "data", "observations");
    const zipPath = path.join(uploadsDir, "backfill-scan.zip");
    fs.mkdirSync(uploadsDir, { recursive: true });
    writeZip(zipPath, [
      {
        name: "home-lab/rawscans/2026-02-01_1000_baselinekit_v0/ports_top200_open.xml",
        content: createObservationNmapXml([
          {
            ip: "192.0.2.10",
            mac: "02:00:00:00:00:10",
            vendor: "Example Devices",
            hostname: "family-laptop.local",
            ports: [{ port: 80, protocol: "tcp", service: "http" }],
          },
        ]),
      },
    ]);

    const ingestOnce = async () => {
      const response = await ingestRoute.POST(
        createJsonRequest("/api/ingest", "POST", {
          zipPath: path.join("data", "uploads", "backfill-scan.zip"),
          network: "home-lab",
        })
      );
      return response.json();
    };

    // First upload registers the run and its observation.
    const firstBody = await ingestOnce();
    assert.equal(firstBody.observations.created, 1);
    const observedRegistryId = listObservations({ network: "home-lab" })[0].registryId;

    // Simulate a run that was registered before the ingest-to-observation
    // bridge existed: the scan run still exists, but its observation record is
    // gone. Re-ingesting the same scan must backfill exactly one observation.
    fs.rmSync(observationsDir, { recursive: true, force: true });
    assert.equal(listObservations({ network: "home-lab" }).length, 0);

    const backfillBody = await ingestOnce();
    const backfilled = listObservations({ network: "home-lab" });

    assert.equal(backfillBody.success, true);
    assert.equal(backfillBody.newRuns, 0, "run already exists, so no new run");
    assert.equal(backfillBody.duplicateRuns, 1);
    assert.equal(backfillBody.observations.created, 1, "missing observation must be backfilled");
    assert.equal(backfillBody.observations.failed, 0);
    assert.equal(backfilled.length, 1);
    assert.equal(
      backfilled[0].registryId,
      observedRegistryId,
      "backfilled observation must reuse the deterministic registry identity"
    );

    // A further duplicate upload must dedupe rather than create another record.
    const afterBody = await ingestOnce();
    assert.equal(afterBody.observations.created, 0);
    assert.equal(afterBody.observations.duplicate, 1);
    assert.equal(listObservations({ network: "home-lab" }).length, 1);
    assertObservationRegistryOutputSafe(readObservationRegistryFilesText());
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
        assert.equal(body.provider, "rule-based", routeCase.name);
        assert.equal(body.isRuleBased, true, routeCase.name);
      }
    });
  });
  resetLLMRateLimitForTesting();
});

run("LLM provider config uses safe defaults for invalid env values", async () => {
  await withEnv(
    {
      LLM_REQUEST_TIMEOUT_MS: "0",
      LLM_MAX_TOKENS: "not-a-number",
    },
    async () => {
      assert.equal(getLLMRequestTimeoutMs(), DEFAULT_LLM_REQUEST_TIMEOUT_MS);
      assert.equal(getLLMMaxTokens(), DEFAULT_LLM_MAX_TOKENS);
    }
  );

  await withEnv(
    {
      LLM_MAX_TOKENS: String(LLM_MAX_TOKENS_UPPER_CAP + 1),
    },
    async () => {
      assert.equal(getLLMMaxTokens(), LLM_MAX_TOKENS_UPPER_CAP);
    }
  );
});

run("LLM provider passes configured max tokens to Anthropic", async () => {
  let requestBody = null;

  await withEnv(
    {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      OPENAI_API_KEY: undefined,
      LLM_MAX_TOKENS: "1234",
    },
    async () => {
      await withMockedFetch(async (_url, options = {}) => {
        assert.ok(options.signal instanceof AbortSignal);
        requestBody = JSON.parse(options.body);

        return new Response(
          JSON.stringify({
            content: [{ text: "anthropic ok" }],
            usage: { input_tokens: 1, output_tokens: 2 },
          }),
          { status: 200 }
        );
      }, async () => {
        const response = await callLLM("system", "user");

        assert.equal(response.success, true);
      });
    }
  );

  assert.equal(requestBody.max_tokens, 1234);
});

run("LLM provider passes configured max tokens to OpenAI", async () => {
  let requestBody = null;

  await withEnv(
    {
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: "test-openai-key",
      LLM_MAX_TOKENS: "3456",
    },
    async () => {
      await withMockedFetch(async (_url, options = {}) => {
        assert.ok(options.signal instanceof AbortSignal);
        requestBody = JSON.parse(options.body);

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "openai ok" } }],
            usage: { total_tokens: 3 },
          }),
          { status: 200 }
        );
      }, async () => {
        const response = await callLLM("system", "user");

        assert.equal(response.success, true);
      });
    }
  );

  assert.equal(requestBody.max_tokens, 3456);
});

run("LLM provider aborts slow OpenAI requests and returns success=false", async () => {
  let receivedSignal = false;
  let aborted = false;

  await withMutedConsoleMethods(["error"], async () => {
    await withEnv(
      {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: "test-openai-key",
        LLM_REQUEST_TIMEOUT_MS: "5",
      },
      async () => {
        await withMockedFetch(
          createAbortableFetch((options) => {
            receivedSignal = options.signal instanceof AbortSignal;
            options.signal.addEventListener(
              "abort",
              () => {
                aborted = true;
              },
              { once: true }
            );
          }),
          async () => {
            const startedAt = Date.now();
            const response = await callLLM("system", "user");
            const elapsedMs = Date.now() - startedAt;

            assert.equal(receivedSignal, true);
            assert.equal(aborted, true);
            assert.equal(response.success, false);
            assert.equal(response.provider, "openai");
            assert.match(response.error, /timed out/);
            assert.ok(elapsedMs < 250, `expected timeout path under 250ms, got ${elapsedMs}ms`);
          }
        );
      }
    );
  });
});

run("LLM provider aborts stalled OpenAI response JSON and returns success=false", async () => {
  let receivedSignal = false;
  let bodyReadAborted = false;
  let fetchCalls = 0;

  await withMutedConsoleMethods(["error"], async () => {
    await withEnv(
      {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: "test-openai-key",
        LLM_REQUEST_TIMEOUT_MS: "5",
      },
      async () => {
        await withMockedFetch(async (_url, options = {}) => {
          fetchCalls += 1;
          receivedSignal = options.signal instanceof AbortSignal;

          return {
            ok: true,
            status: 200,
            json: () =>
              createAbortableBodyRead(options.signal, () => {
                bodyReadAborted = true;
              }),
          };
        }, async () => {
          const startedAt = Date.now();
          const response = await callLLM("system", "user");
          const elapsedMs = Date.now() - startedAt;

          assert.equal(fetchCalls, 1);
          assert.equal(receivedSignal, true);
          assert.equal(bodyReadAborted, true);
          assert.equal(response.success, false);
          assert.equal(response.provider, "openai");
          assert.match(response.error, /timed out/);
          assert.ok(elapsedMs < 250, `expected timeout path under 250ms, got ${elapsedMs}ms`);
        });
      }
    );
  });
});

run("LLM provider aborts stalled Anthropic error response text and returns success=false", async () => {
  let receivedSignal = false;
  let bodyReadAborted = false;
  let fetchCalls = 0;

  await withMutedConsoleMethods(["error"], async () => {
    await withEnv(
      {
        ANTHROPIC_API_KEY: "test-anthropic-key",
        OPENAI_API_KEY: undefined,
        LLM_REQUEST_TIMEOUT_MS: "5",
      },
      async () => {
        await withMockedFetch(async (_url, options = {}) => {
          fetchCalls += 1;
          receivedSignal = options.signal instanceof AbortSignal;

          return {
            ok: false,
            status: 502,
            text: () =>
              createAbortableBodyRead(options.signal, () => {
                bodyReadAborted = true;
              }),
          };
        }, async () => {
          const startedAt = Date.now();
          const response = await callLLM("system", "user");
          const elapsedMs = Date.now() - startedAt;

          assert.equal(fetchCalls, 1);
          assert.equal(receivedSignal, true);
          assert.equal(bodyReadAborted, true);
          assert.equal(response.success, false);
          assert.equal(response.provider, "anthropic");
          assert.match(response.error, /timed out/);
          assert.ok(elapsedMs < 250, `expected timeout path under 250ms, got ${elapsedMs}ms`);
        });
      }
    );
  });
});

run("LLM POST route falls back when provider request times out", async () => {
  await withMutedConsoleMethods(["error", "warn"], async () => {
    await withEnv(
      {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: "test-openai-key",
        LLM_REQUEST_TIMEOUT_MS: "5",
      },
      async () => {
        await withMockedFetch(createAbortableFetch(), async () => {
          resetLLMRateLimitForTesting();
          const llmRouteCases = await getLLMRouteCases();
          const routeCase = llmRouteCases.find(
            (candidate) => candidate.name === "scorecard summary"
          );
          const response = await routeCase.post(
            createJsonPostRequest(
              routeCase.path,
              routeCase.body(),
              "198.51.100.80"
            )
          );
          const body = await response.json();

          assert.equal(response.status, 200);
          assert.equal(body.success, true);
          assert.equal(body.provider, "rule-based");
          assert.equal(body.isRuleBased, true);
        });
      }
    );
  });
  resetLLMRateLimitForTesting();
});

run("LLM POST route falls back when provider response body read times out", async () => {
  await withMutedConsoleMethods(["error", "warn"], async () => {
    await withEnv(
      {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: "test-openai-key",
        LLM_REQUEST_TIMEOUT_MS: "5",
      },
      async () => {
        await withMockedFetch(async (_url, options = {}) => {
          assert.ok(options.signal instanceof AbortSignal);

          return {
            ok: true,
            status: 200,
            json: () => createAbortableBodyRead(options.signal),
          };
        }, async () => {
          resetLLMRateLimitForTesting();
          try {
            const llmRouteCases = await getLLMRouteCases();
            const routeCase = llmRouteCases.find(
              (candidate) => candidate.name === "scorecard summary"
            );
            const response = await routeCase.post(
              createJsonPostRequest(
                routeCase.path,
                routeCase.body(),
                "198.51.100.82"
              )
            );
            const body = await response.json();

            assert.equal(response.status, 200);
            assert.equal(body.success, true);
            assert.equal(body.provider, "rule-based");
            assert.equal(body.isRuleBased, true);
          } finally {
            resetLLMRateLimitForTesting();
          }
        });
      }
    );
  });
});

run("LLM POST route falls back when provider returns an error", async () => {
  await withMutedConsoleMethods(["error", "warn"], async () => {
    await withEnv(
      {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: "test-openai-key",
      },
      async () => {
        await withMockedFetch(
          async () => new Response("provider unavailable", { status: 502 }),
          async () => {
            resetLLMRateLimitForTesting();
            const llmRouteCases = await getLLMRouteCases();
            const routeCase = llmRouteCases.find(
              (candidate) => candidate.name === "scorecard summary"
            );
            const response = await routeCase.post(
              createJsonPostRequest(
                routeCase.path,
                routeCase.body(),
                "198.51.100.81"
              )
            );
            const body = await response.json();

            assert.equal(response.status, 200);
            assert.equal(body.success, true);
            assert.equal(body.provider, "rule-based");
            assert.equal(body.isRuleBased, true);
          }
        );
      }
    );
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

// DB-01 corrective identity-boundary regressions.
run("DB-01 hostname-only device identity stays uncertain across Diff Activity and Statement", async () => {
  await withTempCwd(async () => {
    const sharedDevice = {
      deviceId: "shared-anchor",
      ips: ["192.0.2.10"],
      macs: ["02:00:00:00:00:10"],
      ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
    };
    const baseline = sanitizeObservationBundleV1(
      createComparisonBundle({
        observationId: "obs-hostname-only-baseline",
        siteId: "site-hostname-only",
        networkName: "hostname-only-lab",
        observedAt: "2026-07-10T10:00:00.000Z",
        devices: [
          sharedDevice,
          {
            deviceId: "printer-import-label",
            ips: [],
            macs: [],
            hostnames: ["printer.example.test"],
            vendors: ["Example Printer"],
            ports: [{ port: 443, protocol: "tcp", service: "https" }],
          },
        ],
      })
    );
    const current = sanitizeObservationBundleV1(
      createComparisonBundle({
        observationId: "obs-hostname-only-current",
        siteId: "site-hostname-only",
        networkName: "hostname-only-lab",
        observedAt: "2026-07-10T11:00:00.000Z",
        devices: [sharedDevice],
      })
    );

    assert.equal(baseline.identity.status, "uncertain");
    assert.ok(baseline.identity.reasonCodes.includes("weak-identity-evidence"));

    const diff = buildDiffFromObservationBundles(baseline, current);
    assert.equal(diff.evidence.status, "uncertain");
    assert.equal(diff.evidence.supports.deviceAbsence, false);
    assert.equal(diff.evidence.supports.portClosure, false);
    assert.deepEqual(diff.removedHosts, []);
    assert.deepEqual(diff.portsClosed, []);

    registerObservationBundle(baseline, {
      importedAt: "2026-07-10T10:05:00.000Z",
      evaluatedAt: "2026-07-10T12:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-07-10T11:05:00.000Z",
      evaluatedAt: "2026-07-10T12:00:00.000Z",
    });

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-07-10T12:00:00.000Z",
    });
    assert.equal(activity.status, "insufficient-evidence");
    assert.equal(activity.evidence.supports.deviceAbsence, false);
    assert.equal(activity.evidence.supports.portClosure, false);
    assert.equal(
      activity.events.some(
        (event) =>
          event.type === "previously-observed-device-not-observed" ||
          event.type === "service-or-port-closed"
      ),
      false
    );

    const statement = buildNetworkStatement({
      siteId: "site-hostname-only",
      from: "2026-07-10T00:00:00.000Z",
      to: "2026-07-10T23:59:59.999Z",
      evaluatedAt: "2026-07-10T12:00:00.000Z",
    });
    const markdown = renderNetworkStatementMarkdown(statement);
    assert.equal(statement.status, "insufficient-evidence");
    assert.equal(statement.evidence.supports.deviceAbsence, false);
    assert.equal(statement.evidence.supports.portClosure, false);
    assert.doesNotMatch(markdown, /appeared stable|no meaningful changes|service closure/i);
  });
});

run("DB-01 device response targets use comparator identity instead of imported device IDs", () => {
  const firstMac = "02:00:00:00:00:81";
  const secondMac = "02:00:00:00:00:82";
  const first = buildDeviceResponseTarget({
    siteId: "site-response-identity",
    observationId: "obs-response-identity-first",
    deviceId: "printer",
    macs: [firstMac],
    identityRuleId: "identity.mac",
    identityValues: [firstMac],
  });
  const second = buildDeviceResponseTarget({
    siteId: "site-response-identity",
    observationId: "obs-response-identity-second",
    deviceId: "printer",
    macs: [secondMac],
    identityRuleId: "identity.mac",
    identityValues: [secondMac],
  });

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.identity.kind, "mac-address");
  assert.equal(second.identity.kind, "mac-address");
  assert.notEqual(first.responseId, second.responseId);

  const hashedMac = `sha256:${"a".repeat(64)}`;
  const hashed = buildDeviceResponseTarget({
    siteId: "site-response-identity",
    observationId: "obs-response-identity-hashed",
    deviceId: "printer",
    macs: [firstMac],
    identityRuleId: "identity.hashed-mac",
    identityValues: [hashedMac],
  });
  assert.ok(hashed);
  assert.equal(hashed.identity.kind, "hashed-mac");

  assert.equal(
    buildDeviceResponseTarget({
      siteId: "site-response-identity",
      observationId: "obs-response-identity-weak",
      deviceId: "printer",
      macs: [firstMac],
      identityRuleId: "identity.ip-continuity",
      identityValues: ["192.0.2.81"],
    }),
    null
  );
});

run("DB-01 repeated imported device IDs cannot carry responses across conflicting observed MACs", async () => {
  await withTempCwd(async () => {
    const baseline = createComparisonBundle({
      observationId: "obs-response-reused-id-baseline",
      siteId: "site-response-reused-id",
      networkName: "response-reused-id-lab",
      observedAt: "2026-07-11T10:00:00.000Z",
      devices: [
        {
          deviceId: "printer",
          ips: ["192.0.2.91"],
          macs: ["02:00:00:00:00:91"],
          ports: [{ port: 80, protocol: "tcp", service: "http" }],
        },
      ],
    });
    const current = createComparisonBundle({
      observationId: "obs-response-reused-id-current",
      siteId: "site-response-reused-id",
      networkName: "response-reused-id-lab",
      observedAt: "2026-07-11T11:00:00.000Z",
      devices: [
        {
          deviceId: "printer",
          ips: ["192.0.2.91"],
          macs: ["02:00:00:00:00:92"],
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ],
    });
    const baselineTarget = buildDeviceResponseTarget({
      siteId: baseline.site.siteId,
      observationId: baseline.observationId,
      deviceId: baseline.devices[0].deviceId,
      macs: baseline.devices[0].macs,
      identityRuleId: "identity.mac",
      identityValues: baseline.devices[0].macs,
    });
    assert.ok(baselineTarget);
    upsertDeviceResponse(baselineTarget, "mine", "Old printer", {
      now: "2026-07-11T10:05:00.000Z",
    });
    registerObservationBundle(baseline, {
      importedAt: "2026-07-11T10:05:00.000Z",
      evaluatedAt: "2026-07-11T12:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-07-11T11:05:00.000Z",
      evaluatedAt: "2026-07-11T12:00:00.000Z",
    });

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-07-11T12:00:00.000Z",
    });
    const uncertain = activity.events.find(
      (event) => event.type === "identity-uncertain-possibly-same-device"
    );
    assert.ok(uncertain);
    assert.equal(uncertain.deviceResponse.target, null);
    assert.equal(uncertain.deviceResponse.statement, null);
    assert.equal(
      activity.events.some(
        (event) => event.deviceResponse.statement?.friendlyName === "Old printer"
      ),
      false
    );
  });
});

run("DB-01 unmatched-device response targets require comparator-attested MAC intersection", () => {
  const rawMac = "02:00:00:00:00:AA";
  for (const [ruleId, attestedMac] of [
    ["identity.no-baseline-match", "02:00:00:00:00:BB"],
    ["identity.no-current-match", "02:00:00:00:00:CC"],
  ]) {
    assert.equal(
      buildDeviceResponseTarget({
        siteId: "site-response-mismatch",
        observationId: `obs-${ruleId}`,
        deviceId: "printer",
        macs: [rawMac],
        identityRuleId: ruleId,
        identityValues: [attestedMac],
      }),
      null,
      `${ruleId} must not ignore comparator-attested identity values`
    );
  }
});

run("DB-01 Activity does not attach a response target when raw and attested MAC evidence disagree", async () => {
  await withTempCwd(async () => {
    const stableDevice = {
      deviceId: "stable-device",
      ips: ["192.0.2.101"],
      macs: ["02:00:00:00:01:01"],
      ports: [{ port: 22, protocol: "tcp", service: "ssh" }],
    };
    const baseline = createComparisonBundle({
      observationId: "obs-response-mismatch-baseline",
      siteId: "site-response-mismatch-activity",
      networkName: "response-mismatch-lab",
      observedAt: "2026-07-12T10:00:00.000Z",
      devices: [stableDevice],
    });
    const current = createComparisonBundle({
      observationId: "obs-response-mismatch-current",
      siteId: "site-response-mismatch-activity",
      networkName: "response-mismatch-lab",
      observedAt: "2026-07-12T11:00:00.000Z",
      devices: [
        stableDevice,
        {
          deviceId: "printer",
          ips: ["192.0.2.102"],
          macs: ["02:00:00:00:01:AA"],
          ports: [{ port: 443, protocol: "tcp", service: "https" }],
        },
      ],
    });
    const importedPrinter = current.devices.find(
      (device) => device.deviceId === "printer"
    );
    assert.ok(importedPrinter);
    const macEvidence = importedPrinter.identityEvidence.find(
      (evidence) => evidence.kind === "mac-address"
    );
    assert.ok(macEvidence);
    macEvidence.value = "02:00:00:00:01:BB";

    registerObservationBundle(baseline, {
      importedAt: "2026-07-12T10:05:00.000Z",
      evaluatedAt: "2026-07-12T12:00:00.000Z",
    });
    registerObservationBundle(current, {
      importedAt: "2026-07-12T11:05:00.000Z",
      evaluatedAt: "2026-07-12T12:00:00.000Z",
    });

    const activity = buildNetworkActivity({
      evaluatedAt: "2026-07-12T12:00:00.000Z",
    });
    const added = activity.events.find(
      (event) =>
        event.type === "new-device-observed" &&
        event.technicalEvidence.currentDevice?.deviceId === "printer"
    );
    assert.ok(added);
    assert.equal(added.technicalEvidence.identityRuleId, "identity.no-baseline-match");
    assert.deepEqual(added.technicalEvidence.identityValues, ["02:00:00:00:01:bb"]);
    assert.equal(added.deviceResponse.target, null);
    assert.equal(added.deviceResponse.statement, null);
  });
});

finish().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
