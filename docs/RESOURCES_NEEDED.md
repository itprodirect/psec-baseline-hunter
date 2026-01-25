# Resources Needed for PSEC Baseline Hunter Migration

**Last Updated:** 2026-01-25

---

## 1. AWS Setup

### S3 Bucket Configuration

Create an S3 bucket with the following structure:

```
s3://psec-baseline-hunter-{env}/
├── uploads/          # Raw ZIP files (presigned upload)
├── extracted/        # Unzipped contents per extraction
├── runs/             # Run manifests + parsed JSON cache
└── comparisons/      # CHANGES.md + WATCHLIST.md exports
```

**Bucket Settings:**
- Region: `us-east-1` (or your preferred region)
- Block all public access: **Yes**
- Versioning: Optional (recommended for production)
- Encryption: SSE-S3 or SSE-KMS

### IAM Policy (Least Privilege)

Create an IAM user or role with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::psec-baseline-hunter-dev",
        "arn:aws:s3:::psec-baseline-hunter-dev/*"
      ]
    }
  ]
}
```

### Required Credentials

After creating IAM user, you'll need:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET` name

Add these to `.env.local` (copy from `.env.example`).

---

## 2. Local Development Setup

### Prerequisites

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | 20+ (22.14.0 installed) | `node --version` |
| npm | 10+ (11.1.0 installed) | `npm --version` |
| Git | Any recent | `git --version` |

### Initial Setup

```bash
# Clone and checkout migration branch
cd C:\Users\user\Desktop\psec-baseline-hunter
git checkout feature/nextjs-migration

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your AWS credentials

# Start development server
npm run dev
# Opens http://localhost:3000
```

### Useful Commands

```bash
# Development
npm run dev           # Start dev server (hot reload)
npm run build         # Production build
npm run start         # Start production server
npm run lint          # Run ESLint

# Type checking
npx tsc --noEmit      # Check types without emitting

# Add shadcn components
npx shadcn@latest add [component-name]
```

---

## 3. NPM Packages to Install (Phase 1+)

### Phase 1: Upload/Storage
```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
npm install react-dropzone
npm install adm-zip
npm install -D @types/adm-zip
```

### Phase 3: XML Parsing
```bash
npm install fast-xml-parser
```

### Phase 4+: State Management & Tables
```bash
npm install swr zustand
npm install @tanstack/react-table
```

---

## 4. Test Data

### Sample Baselinekit ZIPs

The project has sample data in `data/uploads/` (gitignored):
- `batman_last2_*.zip` - Batman network (2 runs)
- `orange_last2_*.zip` - Orange network (2 runs)

**Baselinekit ZIP Structure:**
```
{network}-network/
└── rawscans/
    └── YYYY-MM-DD_HHMM_{run_type}/
        ├── ports_top200_open.xml      # Main port scan data
        ├── hosts_up.txt               # List of responding hosts
        ├── discovery_ping_sweep.xml   # Discovery scan
        ├── http_titles.xml            # HTTP service detection
        ├── infra_services.xml         # Infrastructure services
        └── gw_ports_smoke.xml         # Gateway smoke test
```

### Nmap XML Format

Key elements to parse:
```xml
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="192.168.254.14" addrtype="ipv4"/>
    <address addr="00:15:26:0E:FF:05" addrtype="mac" vendor="..."/>
    <hostnames><hostname name="WattBox"/></hostnames>
    <ports>
      <port protocol="tcp" portid="8080">
        <state state="open"/>
        <service name="http-alt" product="Apache" version="2.4"/>
      </port>
    </ports>
  </host>
</nmaprun>
```

---

## 5. Vercel Deployment

### Setup Steps

1. **Connect Repository**
   - Go to [vercel.com](https://vercel.com)
   - Import `itprodirect/psec-baseline-hunter` from GitHub
   - Select `feature/nextjs-migration` branch for preview

2. **Environment Variables**
   Add in Vercel Dashboard → Project → Settings → Environment Variables:
   ```
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=xxx
   AWS_SECRET_ACCESS_KEY=xxx
   S3_BUCKET=psec-baseline-hunter-prod
   ```

3. **Build Settings**
   - Framework: Next.js (auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm ci`

### Vercel Limits (Important)

| Limit | Value | Impact |
|-------|-------|--------|
| Serverless function timeout | 60s (Pro) / 10s (Hobby) | Large ZIP extraction may timeout |
| Request body size | 4.5MB | Must use presigned URLs for uploads |
| /tmp storage | 512MB | Limit on ZIP extraction size |

---

## 6. Reference Documentation

### Next.js
- [App Router Docs](https://nextjs.org/docs/app)
- [API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)

### shadcn/ui
- [Components](https://ui.shadcn.com/docs/components)
- [Theming](https://ui.shadcn.com/docs/theming)

### AWS SDK v3
- [S3 Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/)
- [Presigned URLs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/)

### TanStack Table
- [Documentation](https://tanstack.com/table/latest/docs/introduction)

---

## 7. Risk Port Configuration

These are the default risk classifications (from `core/diff.py`):

```typescript
// To be created at: src/lib/constants/risk-ports.ts

export const RISK_PORTS = {
  P0: new Set([23, 445, 3389, 5900, 135, 139, 1080]),  // Critical
  P1: new Set([8080, 8443, 8888]),                     // Admin/dev
  P2: new Set([22, 80, 443]),                          // Context-dependent
};

export const PORT_NOTES: Record<number, string> = {
  23: "Telnet (cleartext remote shell)",
  445: "SMB (Windows file sharing)",
  3389: "RDP (remote desktop)",
  5900: "VNC (remote desktop)",
  135: "RPC endpoint mapper",
  139: "NetBIOS/SMB legacy",
  1080: "SOCKS proxy (possible pivot)",
  8080: "HTTP alt / admin panel common",
  8443: "HTTPS alt / admin panel common",
  8888: "Dev/admin service common (Jupyter/etc.)",
  22: "SSH (remote admin)",
  80: "HTTP (web UI/admin possible)",
  443: "HTTPS (web UI/admin possible)",
};
```

---

## 8. GitHub Issues to Create

Phase 0 is complete. Here are the Phase 1 issues to create:

```markdown
#10: Configure AWS SDK and S3 client
Labels: phase-1, backend
- Install @aws-sdk/client-s3, @aws-sdk/lib-storage
- Create src/lib/aws/s3.ts with client wrapper
- Add getPresignedUrl, uploadFile, getFile utilities
- Test with .env.local credentials

#11: Create /api/upload route with presigned URLs
Labels: phase-1, api
- POST /api/upload returns presigned S3 URL
- URL expires in 15 minutes
- Include content-length limit (500MB)

#12: Build Dropzone component
Labels: phase-1, ui
- Install react-dropzone
- Create src/components/upload/dropzone.tsx
- Accept .zip files only
- Show file info on drop

#13: Implement S3 upload with progress
Labels: phase-1, ui
- Direct browser-to-S3 upload using presigned URL
- Track upload progress (0-100%)
- Show in UploadProgress component

#14: Add ZIP validation (magic bytes, size)
Labels: phase-1, backend
- Verify ZIP magic bytes (0x50 0x4B 0x03 0x04)
- Enforce 500MB max file size
- Return clear error messages

#15: Add Zip Slip prevention
Labels: phase-1, security
- Validate all ZIP entry paths
- Reject absolute paths, parent traversal (..)
- Reject symlinks

#16: Build upload status display
Labels: phase-1, ui
- Show upload stages: uploading → validating → complete
- Error state with retry option
- Success state with detected runs preview

#17: Write validation tests
Labels: phase-1, testing
- Test ZIP magic byte detection
- Test path traversal rejection
- Test size limit enforcement
```
