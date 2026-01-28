# Setup Instructions for Custom Rules Feature

## Issue
The build is failing because required dependencies are not installed in `node_modules`.

## Solution

Run these commands in order:

```bash
# 1. Install all dependencies (including new Radix UI packages)
npm install

# 2. Clear Next.js cache (optional but recommended)
rm -rf .next

# 3. Start development server
npm run dev
```

## What Was Added

The custom rules feature requires these new UI components:
- Alert (for error/info messages)
- Input (for form text fields)
- Label (for form labels)
- Select (for dropdowns)
- Textarea (for multi-line input)

These components depend on:
- `@radix-ui/react-label@2.1.4`
- `@radix-ui/react-select@2.2.6`
- `class-variance-authority@0.7.1` (already installed)

## Verification

After running `npm install`, you should see these directories:
- `node_modules/@radix-ui/react-label/`
- `node_modules/@radix-ui/react-select/`

## If Still Having Issues

1. **Check Node version:** `node --version` (should be 20+)
2. **Check npm version:** `npm --version` (should be 10+)
3. **Try clean install:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
4. **Check for specific error messages** and let me know what they say

## Next Steps After Successful Build

1. Go to http://localhost:3000/rules to manage custom risk rules
2. Or create rules directly from the Health Overview page when viewing risk exposures
