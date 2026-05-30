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

let total = 0;
let failed = 0;

function run(name, fn) {
  total += 1;
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error instanceof Error ? error.stack : error);
  }
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

if (failed > 0) {
  console.error(`\n${failed}/${total} tests failed`);
  process.exit(1);
}

console.log(`\n${total} tests passed`);
