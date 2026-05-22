## Getting Started

### Prerequisites
- **Node.js v20.x** (required — see Known Dependency Constraints below)
```bash
  # Install nvm-windows from https://github.com/coreybutler/nvm-windows/releases
  nvm install 20
  nvm use 20
  node --version  # should show v20.x.x
```
- **npm 10.x** (comes with Node 20)
- **Git**

### Setup
1. Clone the repository:
```bash
   git clone <repo-url>
   cd medical-center-monorepo
```

2. Install dependencies:
```bash
   npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env` in the relevant app folders
   - Fill in your database connection string and other required values

4. Generate Prisma client:
```bash
   cd packages/db
   npx prisma generate
   cd ../..
```
   *(This also runs automatically after `npm install` via the postinstall script)*

5. Verify everything works:
```bash
   npx turbo run build
   npx turbo run lint
```
   Both should pass with no errors.

### Running in Development
```bash
# Run all apps
npx turbo run dev

# Run only the web app
cd apps/web && npm run dev

# Run only the mobile driver app
cd apps/mobile-driver && npm run start

# Run only the mobile patient app
cd apps/mobile-patient && npm run start
```

### Project Structure
```
medical-center-monorepo/
├── apps/
│   ├── web/              # Next.js 14 web application
│   ├── mobile-driver/    # Expo React Native app (driver)
│   └── mobile-patient/   # Expo React Native app (patient)
└── packages/
    └── db/               # Shared Prisma database package
```

---

## ⚠️ Known Dependency Constraints — Read Before Upgrading

### Current State
Running `npm ls react` and `npm ls eslint` will show multiple versions 
of both React and ESLint in node_modules. This is expected and intentional:

- **React 18** is used by `apps/web` (Next.js requirement)
- **React 19** is used by `apps/mobile-driver` and `apps/mobile-patient` (Expo 54 requirement)
- **ESLint 8** is used by all lint scripts
- **ESLint 9** exists inside `eslint-plugin-expo` but is never invoked

These coexist safely because:
- `apps/web` resolves React from its own `node_modules` first, never touching React 19
- Mobile apps call ESLint 8 directly via `eslint . --ext .js,.jsx,.ts,.tsx`,
  never invoking `expo lint` which would load ESLint 9

---

### Next.js is Pinned to 14.1.4

**Why:** Next.js 14.2.x introduced a bug in `patch-incorrect-lockfile.js`
that crashes the production build on Windows with:
`TypeError: Cannot read properties of undefined (reading 'os')`

Next.js 15.x resolves this bug but requires React 19 in `apps/web`,
which requires a full coordinated upgrade of all apps.

**Do not upgrade Next.js until either:**
- The monorepo is migrated to Linux/macOS development and CI, OR
- All apps are upgraded simultaneously: Next.js 15 + React 19 in `apps/web`

---

### Do Not Upgrade These Packages Without Testing

| Package | Current | Reason |
|---------|---------|--------|
| `next` in `apps/web` | 14.1.4 | 14.2.x crashes on Windows; 15.x needs React 19 |
| `react`/`react-dom` in `apps/web` | ^18 | Next.js 14.1.4 requires React 18 |
| `eslint` in mobile apps | ^8.x | eslint-config-expo not fully compatible with ESLint 9 |
| `eslint-config-expo` in mobile apps | ^8.x | v10 uses ESLint 9 flat config which breaks our setup |
| Node.js | 20.x | Node 24 breaks Next.js 14.1.4 internal tooling |

---

### Node.js Must Be Version 20.x

Use nvm to manage Node versions:
```bash
# Windows (nvm-windows)
# Download installer from: https://github.com/coreybutler/nvm-windows/releases
nvm install 20
nvm use 20

# macOS/Linux (nvm)
# Install nvm from: https://github.com/nvm-sh/nvm
nvm install 20
nvm use 20

node --version  # must show v20.x.x
```

---

### The Eventual Final Fix

All constraints go away when:
1. Next.js 15 stabilises on Windows (currently has lockfile patch issues)
2. `apps/web` is upgraded to Next.js 15 + React 19
3. `eslint-config-expo` fully supports ESLint 9

Steps to upgrade when ready:
```bash
# In apps/web
npm install next@15 react@19 react-dom@19

# In apps/mobile-driver and apps/mobile-patient
npm install eslint@9 eslint-config-expo@latest

# Replace .eslintrc.js with eslint.config.js in mobile apps
# Change lint script back to: "lint": "expo lint"
# Delete this warning from README
```

---

### On Linux/macOS

The Next.js lockfile bug is **Windows-specific**. On Linux or macOS:
- You can upgrade to Next.js 15 freely
- The React version constraint still applies until Next.js 15 + React 19
  upgrade is done across all apps
- The ESLint 8 constraint is platform-independent and still applies
  until `eslint-config-expo` fully supports ESLint 9