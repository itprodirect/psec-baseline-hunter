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

run("LLM rate limit identity prefers forwarded and real IP headers", () => {
  assert.equal(
    getLLMRateLimitIdentity(
      new Headers({
        "x-forwarded-for": "198.51.100.10, 203.0.113.20",
        "x-real-ip": "203.0.113.30",
      })
    ),
    "198.51.100.10"
  );
  assert.equal(
    getLLMRateLimitIdentity(new Headers({ "x-real-ip": "203.0.113.30" })),
    "203.0.113.30"
  );
  assert.equal(getLLMRateLimitIdentity(new Headers()), "unknown");
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

run("LLM POST routes return 429 after the default threshold", async () => {
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
              "203.0.113.200"
            )
          );

          assert.notEqual(response.status, 429, routeCase.name);
          await response.json();
        }

        const limitedResponse = await routeCase.post(
          createJsonPostRequest(routeCase.path, routeCase.body(), "203.0.113.200")
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
