# Network Scanning Guide for Baseline Hunter

This guide shows you how to create scan files that work with PSEC Baseline Hunter using free tools.

---

## Quick Start: Your First Baseline Scan

### 1. Run the Scans (5-10 minutes)

Open a terminal and run these commands. Replace `192.168.1.0/24` with your network range.

```bash
# Create output directory with proper naming
# Format: YYYY-MM-DD_HHMM_runtype
mkdir -p my-network/rawscans/$(date +%Y-%m-%d_%H%M)_baselinekit_v0
cd my-network/rawscans/$(date +%Y-%m-%d_%H%M)_baselinekit_v0

# Main port scan (most important - this is what gets analyzed)
nmap -sV --top-ports 200 192.168.1.0/24 -oX ports_top200_open.xml

# Host discovery (quick, finds live hosts)
nmap -sn 192.168.1.0/24 -oX discovery_ping_sweep.xml

# Create hosts_up.txt (list of live IPs)
grep -oP 'addr="\K[0-9.]+(?=")' discovery_ping_sweep.xml | sort -u > hosts_up.txt
```

### 2. Package as ZIP

```bash
cd ../../../
zip -r my-network-baseline.zip my-network/
```

### 3. Upload to Baseline Hunter

1. Open http://localhost:3000/upload
2. Drag your ZIP file onto the upload area
3. Click "Extract + Detect"
4. View your detected run

---

## Detailed Scan Commands

### Port Scanning

| Scan Type | Command | Duration | Use When |
|-----------|---------|----------|----------|
| **Quick** | `nmap -sV --top-ports 100 TARGET -oX output.xml` | 2-5 min | Initial discovery |
| **Standard** | `nmap -sV --top-ports 200 TARGET -oX output.xml` | 5-15 min | Regular baselines |
| **Thorough** | `nmap -sV -p 1-1000 TARGET -oX output.xml` | 15-30 min | Detailed analysis |
| **Full** | `nmap -sV -p- TARGET -oX output.xml` | 1-4 hours | Complete audit |

### Service Detection

| Scan Type | Command | What It Finds |
|-----------|---------|---------------|
| **Version detect** | `nmap -sV TARGET` | Service names and versions |
| **Script scan** | `nmap -sV -sC TARGET` | Additional service details |
| **HTTP titles** | `nmap -sV --script=http-title TARGET` | Web page titles |

### Operating System Detection

```bash
# Requires root/admin privileges
sudo nmap -O --osscan-guess TARGET -oX os_detection.xml
```

---

## File Naming Requirements

### Folder Structure

```
{network-name}/
└── rawscans/
    └── YYYY-MM-DD_HHMM_{run-type}/
        ├── ports_top200_open.xml
        ├── discovery_ping_sweep.xml
        ├── hosts_up.txt
        └── [optional additional files]
```

### Required Naming Pattern

The folder name MUST match this format:
```
YYYY-MM-DD_HHMM_runtype
```

**Examples:**
- `2026-01-25_1430_baselinekit_v0` (Jan 25, 2026 at 2:30 PM)
- `2026-01-25_0900_smoketest` (Jan 25, 2026 at 9:00 AM)
- `2026-02-01_2200_weekly_scan` (Feb 1, 2026 at 10:00 PM)

**Script to create folder name:**
```bash
# Bash/Linux/Mac
echo $(date +%Y-%m-%d_%H%M)_baselinekit_v0

# Windows PowerShell
(Get-Date -Format "yyyy-MM-dd_HHmm") + "_baselinekit_v0"
```

---

## Complete Baseline Scan Script

Save this as `baseline_scan.sh`:

```bash
#!/bin/bash

# Configuration - EDIT THESE
NETWORK="192.168.1.0/24"           # Your network range
NETWORK_NAME="my-home-network"      # Name for organizing
SCAN_TYPE="baselinekit_v0"          # Type identifier

# Generate folder name with timestamp
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
OUTPUT_DIR="${NETWORK_NAME}/rawscans/${TIMESTAMP}_${SCAN_TYPE}"

# Create directory structure
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

echo "=== Starting baseline scan of $NETWORK ==="
echo "Output directory: $OUTPUT_DIR"
echo ""

# 1. Discovery scan (quick ping sweep)
echo "Step 1/4: Discovery scan..."
nmap -sn $NETWORK -oX discovery_ping_sweep.xml 2>/dev/null

# Extract live hosts
grep -oP 'addr="\K[0-9.]+(?=")' discovery_ping_sweep.xml | sort -u > hosts_up.txt
HOST_COUNT=$(wc -l < hosts_up.txt)
echo "   Found $HOST_COUNT live hosts"

# 2. Port scan (main data for analysis)
echo "Step 2/4: Port scan (top 200 ports)..."
nmap -sV --top-ports 200 $NETWORK -oX ports_top200_open.xml 2>/dev/null
echo "   Port scan complete"

# 3. HTTP title detection (optional but useful)
echo "Step 3/4: HTTP title detection..."
nmap -sV --script=http-title -p 80,443,8080,8443 $NETWORK -oX http_titles.xml 2>/dev/null
echo "   HTTP scan complete"

# 4. Infrastructure services check (optional)
echo "Step 4/4: Infrastructure services..."
nmap -sV -p 22,23,53,67,68,69,161,162,389,636,445,3389 $NETWORK -oX infra_services.xml 2>/dev/null
echo "   Infrastructure scan complete"

echo ""
echo "=== Scan complete ==="
echo "Files created:"
ls -la

# Return to original directory
cd - > /dev/null

# Create ZIP
echo ""
echo "Creating ZIP file..."
zip -r "${NETWORK_NAME}_${TIMESTAMP}.zip" "${NETWORK_NAME}/"
echo "ZIP created: ${NETWORK_NAME}_${TIMESTAMP}.zip"
echo ""
echo "Upload this ZIP to Baseline Hunter: ${NETWORK_NAME}_${TIMESTAMP}.zip"
```

### Windows PowerShell Version

Save as `baseline_scan.ps1`:

```powershell
# Configuration - EDIT THESE
$NETWORK = "192.168.1.0/24"
$NETWORK_NAME = "my-home-network"
$SCAN_TYPE = "baselinekit_v0"

# Generate folder name
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HHmm"
$OUTPUT_DIR = "$NETWORK_NAME\rawscans\${TIMESTAMP}_${SCAN_TYPE}"

# Create directory
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null
Set-Location $OUTPUT_DIR

Write-Host "=== Starting baseline scan of $NETWORK ===" -ForegroundColor Green

# Discovery scan
Write-Host "Step 1/3: Discovery scan..."
nmap -sn $NETWORK -oX discovery_ping_sweep.xml 2>$null

# Port scan
Write-Host "Step 2/3: Port scan..."
nmap -sV --top-ports 200 $NETWORK -oX ports_top200_open.xml 2>$null

# Create hosts_up.txt
Select-String -Path discovery_ping_sweep.xml -Pattern 'addr="(\d+\.\d+\.\d+\.\d+)"' -AllMatches |
    ForEach-Object { $_.Matches } |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique |
    Out-File hosts_up.txt

Write-Host "Step 3/3: Creating ZIP..."
Set-Location ..\..\..
Compress-Archive -Path $NETWORK_NAME -DestinationPath "${NETWORK_NAME}_${TIMESTAMP}.zip" -Force

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Upload this file: ${NETWORK_NAME}_${TIMESTAMP}.zip"
```

---

## Scan Safety Guidelines

### Legal Considerations

**Only scan networks you own or have explicit permission to scan.**

| Environment | Who to Ask |
|-------------|------------|
| Home network | You own it - go ahead |
| Work network | IT Security team / Network admin |
| Client network | Written authorization required |
| Cloud VMs | Check provider's terms of service |

### Minimizing Network Impact

| Setting | Command Flag | Purpose |
|---------|--------------|---------|
| Slower timing | `-T2` | Reduces network load |
| Skip ping | `-Pn` | For firewalled hosts |
| Limit rate | `--max-rate 100` | Packets per second limit |
| Specific ports | `-p 22,80,443` | Scan only what you need |

**Gentle scan example:**
```bash
nmap -sV -T2 --max-rate 100 --top-ports 100 192.168.1.0/24 -oX gentle_scan.xml
```

---

## Interpreting Nmap Output

### Port States

| State | Meaning | Should You Worry? |
|-------|---------|-------------------|
| `open` | Service is listening | Investigate if unexpected |
| `closed` | No service listening | Normal, nothing there |
| `filtered` | Firewall blocking | Can't determine state |

### Service Detection Example

```xml
<port protocol="tcp" portid="22">
  <state state="open"/>
  <service name="ssh" product="OpenSSH" version="8.9p1"/>
</port>
```

This tells us:
- Port 22 TCP is open
- Running SSH service
- Product: OpenSSH version 8.9p1

### Common Risky Findings

| Port | Service | Risk | Action |
|------|---------|------|--------|
| 23 | Telnet | HIGH | Disable, use SSH instead |
| 445 | SMB | HIGH | Ensure patched, limit access |
| 3389 | RDP | HIGH | Use VPN, enable NLA |
| 5900 | VNC | HIGH | Disable or use tunnel |
| 21 | FTP | MEDIUM | Use SFTP instead |

---

## Recommended Scan Schedule

| Network Type | Frequency | Scan Depth |
|--------------|-----------|------------|
| Home network | Weekly | Top 200 ports |
| Small office | Weekly | Top 200 ports |
| Enterprise | Daily | Common services |
| DMZ | Daily | Full port range |
| IoT devices | Weekly | Full port range |
| After changes | Immediately | Full scan |

---

## Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| No hosts found | Firewall blocking ping | Use `-Pn` flag |
| Scan very slow | Too many hosts | Scan smaller subnets |
| Permission denied | Need root for some scans | Use `sudo` or admin terminal |
| XML file empty | Target unreachable | Check network connectivity |

### Verifying Your Scan

```bash
# Check if XML is valid and has data
grep -c "<host>" ports_top200_open.xml
# Should return number of hosts found

# Check for open ports
grep -c 'state="open"' ports_top200_open.xml
# Should return number of open ports found
```

---

## Next Steps

1. **First scan:** Run the quick start commands above
2. **Create ZIP:** Package your scan folder
3. **Upload:** Go to http://localhost:3000/upload
4. **Analyze:** View your detected runs
5. **Compare:** After your second scan, compare to find changes

---

*Need help? Check the main [ROADMAP.md](./ROADMAP.md) for the full feature guide.*
