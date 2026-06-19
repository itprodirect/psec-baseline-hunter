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
let isObservationBundleValidationError;
let MAX_OBSERVATION_BUNDLE_JSON_BYTES;
let MAX_OBSERVATION_NMAP_XML_BYTES;
let MAX_OBSERVATION_HOSTS_UP_BYTES;
let MAX_OBSERVATION_ARP_SNAPSHOT_BYTES;

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
  ] = await Promise.all([
    import("../src/lib/services/path-safety.ts"),
    import("../src/lib/services/archive-safety.ts"),
    import("../src/lib/services/diff-actions.ts"),
    import("../src/lib/services/inventory-csv-safety.ts"),
    import("../src/lib/services/api-response-safety.ts"),
    import("../src/lib/services/llm-rate-limit.ts"),
    import("../src/lib/llm/provider.ts"),
    import("../src/lib/services/observation-bundle.ts"),
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
    isObservationBundleValidationError,
    MAX_OBSERVATION_BUNDLE_JSON_BYTES,
    MAX_OBSERVATION_NMAP_XML_BYTES,
    MAX_OBSERVATION_HOSTS_UP_BYTES,
    MAX_OBSERVATION_ARP_SNAPSHOT_BYTES,
  } = observationBundle);
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

function writeRunRegistryFixtures(options = {}) {
  const dataDir = path.join(process.cwd(), "data");
  const scansDir = path.join(dataDir, "test-scans");
  const runsDir = path.join(dataDir, "runs");
  const baselineRunUid = options.baselineRunUid ?? "baseline-run";
  const currentRunUid = options.currentRunUid ?? "current-run";
  const baselineTimestamp = options.baselineTimestamp ?? "2026-02-01T10:00:00.000Z";
  const currentTimestamp = options.currentTimestamp ?? "2026-02-08T10:00:00.000Z";
  const network = options.network ?? "home-lab";
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
            baselineTimestamp,
            baselineXmlPath,
            network
          ),
          [currentRunUid]: createRunManifest(
            currentRunUid,
            currentTimestamp,
            currentXmlPath,
            network
          ),
        },
        lastUpdated: currentTimestamp,
      },
      null,
      2
    )
  );

  return { baselineRunUid, currentRunUid };
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
  return [
    "<nmaprun>",
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
        ? `<ports>${host.ports.map((port) => `<port protocol="${port.protocol}" portid="${port.port}"><state state="open" /><service name="${port.service}" product="${port.product ?? ""}" version="${port.version ?? ""}" /></port>`).join("")}</ports>`
        : "";
      return `<host><status state="up" />${addresses}${hostnames}${ports}</host>`;
    }),
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

run("observation bundle adapter marks runs partial when only ARP or metadata is missing", async () => {
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

      assert.deepEqual(bundle.coverage.missingSources, [testCase.name], testCase.name);
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

run("observation bundle merge repoints secondary indexes after accumulator merges", async () => {
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
    const allMacs = bundle.devices.flatMap((device) => device.macs);

    assert.equal(ip31Devices.length, 1);
    assert.ok(ip31Devices[0].macs.includes("02:00:00:00:00:40"));
    assert.ok(ip31Devices[0].macs.includes("02:00:00:00:00:31"));
    assert.equal(allMacs.length, new Set(allMacs).size);
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

finish().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
