<#
.SYNOPSIS
    Network Baseline Scanner for PSEC Baseline Hunter
    Runs Nmap scans and packages results for upload to the app.

.DESCRIPTION
    This script performs a network scan using Nmap and packages the results
    into a ZIP file that can be uploaded directly to PSEC Baseline Hunter.

.PARAMETER Target
    The target network to scan (e.g., 192.168.1.0/24)

.PARAMETER NetworkName
    A friendly name for this network (e.g., "home-network", "office-lan")

.PARAMETER OutputDir
    Directory to save scan results (default: current directory)

.EXAMPLE
    .\network-scan.ps1 -Target "192.168.1.0/24" -NetworkName "home-network"

.EXAMPLE
    .\network-scan.ps1 -Target "10.0.0.0/24" -NetworkName "office" -OutputDir "C:\Scans"

.NOTES
    Requires Nmap to be installed and in PATH.
    Download from: https://nmap.org/download.html
    Run as Administrator for best results.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Target,

    [Parameter(Mandatory=$true)]
    [string]$NetworkName,

    [string]$OutputDir = (Get-Location).Path
)

# Configuration
$ErrorActionPreference = "Stop"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$RunType = "baselinekit_v0"
$RunFolder = "${Timestamp}_${RunType}"

# Colors for output
function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Info { param($Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warn { param($Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Err { param($Message) Write-Host $Message -ForegroundColor Red }

# Banner
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  PSEC Baseline Hunter - Network Scanner" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check for Nmap
Write-Info "Checking for Nmap..."
$NmapPath = Get-Command nmap -ErrorAction SilentlyContinue
if (-not $NmapPath) {
    Write-Err "Nmap not found! Please install Nmap from https://nmap.org/download.html"
    Write-Err "Make sure to add Nmap to your PATH during installation."
    exit 1
}
Write-Success "Found Nmap at: $($NmapPath.Source)"

# Check for admin rights (recommended but not required)
$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Warn "Not running as Administrator. Some scan features may be limited."
    Write-Warn "For best results, run PowerShell as Administrator."
    Write-Host ""
}

# Create output directory structure
$NetworkDir = Join-Path $OutputDir $NetworkName
$RawscansDir = Join-Path $NetworkDir "rawscans"
$ScanDir = Join-Path $RawscansDir $RunFolder

Write-Info "Creating scan directory: $ScanDir"
New-Item -ItemType Directory -Force -Path $ScanDir | Out-Null

# Scan functions
function Run-Scan {
    param(
        [string]$Name,
        [string]$Description,
        [string]$Arguments,
        [string]$OutputBase
    )

    Write-Info "Running: $Description..."
    $OutputPath = Join-Path $ScanDir $OutputBase

    try {
        $Process = Start-Process -FilePath "nmap" `
            -ArgumentList "$Arguments -oA `"$OutputPath`" $Target" `
            -NoNewWindow -Wait -PassThru

        if ($Process.ExitCode -eq 0) {
            Write-Success "  Completed: $Name"
            return $true
        } else {
            Write-Warn "  Warning: $Name completed with exit code $($Process.ExitCode)"
            return $true
        }
    } catch {
        Write-Err "  Failed: $Name - $_"
        return $false
    }
}

# Run scans
Write-Host ""
Write-Info "Starting network scan of $Target"
Write-Info "This may take several minutes depending on network size..."
Write-Host ""

$ScanResults = @()

# 1. Discovery scan (ping sweep)
$ScanResults += Run-Scan `
    -Name "Discovery" `
    -Description "Host discovery (ping sweep)" `
    -Arguments "-sn -PE -PP -PM" `
    -OutputBase "discovery_ping_sweep"

# 2. Top 200 ports scan
$ScanResults += Run-Scan `
    -Name "Ports" `
    -Description "Top 200 ports scan" `
    -Arguments "-sS -sV --top-ports 200 --open" `
    -OutputBase "ports_top200_open"

# 3. Create hosts_up.txt from discovery results
$DiscoveryGnmap = Join-Path $ScanDir "discovery_ping_sweep.gnmap"
$HostsUpFile = Join-Path $ScanDir "hosts_up.txt"

if (Test-Path $DiscoveryGnmap) {
    Write-Info "Extracting live hosts..."
    $LiveHosts = Get-Content $DiscoveryGnmap |
        Where-Object { $_ -match "Status: Up" } |
        ForEach-Object { ($_ -split " ")[1] }

    $LiveHosts | Out-File -FilePath $HostsUpFile -Encoding UTF8
    Write-Success "  Found $($LiveHosts.Count) live hosts"
}

# 4. Capture local network info
Write-Info "Capturing local network configuration..."

# ARP table
$ArpFile = Join-Path $ScanDir "arp_table.txt"
arp -a | Out-File -FilePath $ArpFile -Encoding UTF8

# IP configuration
$IpconfigFile = Join-Path $ScanDir "ipconfig.txt"
ipconfig /all | Out-File -FilePath $IpconfigFile -Encoding UTF8

# Route table
$RouteFile = Join-Path $ScanDir "route_table.txt"
route print | Out-File -FilePath $RouteFile -Encoding UTF8

Write-Success "  Captured network configuration"

# Create scan metadata
$MetadataFile = Join-Path $ScanDir "scan_metadata.json"
$Metadata = @{
    network = $NetworkName
    target = $Target
    timestamp = (Get-Date).ToString("o")
    runFolder = $RunFolder
    runType = $RunType
    scanner = "PSEC Network Scanner v1.0"
    platform = "Windows $([System.Environment]::OSVersion.Version.ToString())"
    nmapVersion = (nmap --version | Select-Object -First 1)
    isAdmin = $IsAdmin
} | ConvertTo-Json -Depth 3

$Metadata | Out-File -FilePath $MetadataFile -Encoding UTF8

# Create ZIP file
$ZipName = "${NetworkName}_${Timestamp}.zip"
$ZipPath = Join-Path $OutputDir $ZipName

Write-Host ""
Write-Info "Packaging scan results..."

# Remove existing ZIP if present
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

# Create ZIP
Compress-Archive -Path $NetworkDir -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Success "Scan Complete!"
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Results saved to:" -ForegroundColor White
Write-Host "  ZIP: $ZipPath" -ForegroundColor Yellow
Write-Host "  Raw: $ScanDir" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Open PSEC Baseline Hunter in your browser" -ForegroundColor Gray
Write-Host "  2. Click 'Upload' and select: $ZipName" -ForegroundColor Gray
Write-Host "  3. View your network health report!" -ForegroundColor Gray
Write-Host ""

# Clean up temp directory (keep ZIP)
$CleanupChoice = Read-Host "Delete raw scan folder? (keeps ZIP) [y/N]"
if ($CleanupChoice -eq "y" -or $CleanupChoice -eq "Y") {
    Remove-Item $NetworkDir -Recurse -Force
    Write-Info "Raw scan folder deleted."
}

Write-Host ""
Write-Success "Done! Upload $ZipName to PSEC Baseline Hunter."
Write-Host ""
