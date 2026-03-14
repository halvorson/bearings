# Bearings — Setup Guide (Your Tasks)
**Complete these 7 steps in order before handing off to an agent.**

---

## Prerequisites

Install these on your machine before starting:

- **Node.js 20+** — [nodejs.org](https://nodejs.org) (download the LTS version)
- **Firebase CLI** — run in terminal: `npm install -g firebase-tools`
- **GitHub CLI** — [cli.github.com](https://cli.github.com) (download and install)
- **Git** — [git-scm.com](https://git-scm.com) (likely already installed on Mac)

Verify they're installed by running:
```
node --version      # should say v20.x.x or higher
firebase --version  # should say 13.x.x or similar
gh --version        # should say gh version 2.x.x or similar
git --version       # should say git version 2.x.x or similar
```

---

## Step 1 — Create Firebase Projects

You need two projects: one for development, one for production.

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Project name: `bearings-app-dev`
   - Disable Google Analytics on this screen (you'll set it up separately in Step 4)
   - Click **Create project**
4. Once created, **upgrade to the Blaze plan** (required for Cloud Functions):
   - In the left sidebar, click the **Spark** label at the bottom left → **Upgrade**
   - Select **Blaze (pay as you go)**
   - Add a billing account if prompted. Cloud Functions usage at this scale costs pennies.
5. Repeat steps 2–4 for `bearings-app-prod`

---

## Step 2 — Enable Firestore and Hosting

Do this for **both** projects (`bearings-app-dev` and `bearings-app-prod`).

**Firestore:**
1. In the Firebase Console, select the project
2. Left sidebar → **Build** → **Firestore Database**
3. Click **Create database**
4. Select **Start in production mode** (the agent will deploy the proper rules)
5. Location: choose **us-central1** (Iowa) — this must match where Cloud Functions run
6. Click **Enable**

**Hosting:**
1. Left sidebar → **Build** → **Hosting**
2. Click **Get started**
3. Click through the setup wizard — you don't need to run any commands, just click Next/Continue until you reach the end
4. Click **Continue to console**

---

## Step 3 — Mapbox Account & Tokens

1. Go to [account.mapbox.com](https://account.mapbox.com) and create a free account (or log in)
2. Once logged in, go to **Tokens** (in the top navigation or at [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens))
3. You'll see a **Default public token** already exists — do not use this one. Create two new scoped tokens:

**Dev token:**
1. Click **+ Create a token**
2. Name: `bearings-dev`
3. Under **Token scopes**, keep the default public scopes checked (styles:read, tiles:read, etc.)
4. Under **Allowed URLs**, add:
   - `http://localhost:5173` (Vite dev server)
   - `https://bearings-app-dev.web.app`
   - `https://bearings-app-dev.firebaseapp.com`
5. Click **Create token**
6. **Copy and save this token somewhere safe** (you won't be able to see it again)

**Prod token:**
1. Click **+ Create a token**
2. Name: `bearings-prod`
3. Same scopes as above
4. Under **Allowed URLs**, add your production domain once you have it. For now just add:
   - `https://bearings-app-prod.web.app`
   - `https://bearings-app-prod.firebaseapp.com`
5. Click **Create token**
6. **Copy and save this token somewhere safe**

---

## Step 4 — Google Analytics 4

1. Go to [analytics.google.com](https://analytics.google.com)
2. Click **Start measuring** (or **Admin** if you already have an account)
3. **Create an Account:**
   - Account name: `Bearings`
   - Click **Next**
4. **Create a Property:**
   - Property name: `Bearings Dev`
   - Timezone and currency: set to your location
   - Click **Next**, fill in business details, click **Create**
5. **Set up a data stream:**
   - Choose **Web**
   - Stream URL: `https://bearings-app-dev.web.app`
   - Stream name: `Bearings Dev Web`
   - Click **Create stream**
6. You'll see a **Measurement ID** that looks like `G-XXXXXXXXXX` — **copy and save this**
7. Repeat steps 3–6 to create a second property called `Bearings Prod` with stream URL `https://bearings-app-prod.web.app` and save that Measurement ID too

---

## Step 5 — Create the GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Fill in the form:
   - **Repository name:** `bearings`
   - **Description:** `Collaborative GPS + compass triangulation app`
   - **Visibility:** Private (recommended) or Public — your choice
   - **Initialize this repository with:** check **Add a README file**
   - **Add .gitignore:** leave as None (the agent will create one)
   - **Choose a license:** MIT is a good default if you want one, otherwise None
3. Click **Create repository**
4. Clone it to your machine:
   ```bash
   # Navigate to wherever you keep your projects, e.g.:
   cd ~/Projects

   # Clone the repo (replace YOUR_USERNAME with your GitHub username)
   git clone https://github.com/YOUR_USERNAME/bearings.git

   # Enter the directory
   cd bearings
   ```
5. Authenticate the GitHub CLI:
   ```bash
   gh auth login
   # Choose: GitHub.com → HTTPS → Yes (authenticate with credentials) → Login with a web browser
   # Follow the prompts
   ```

---

## Step 6 — Firebase Service Account Keys

You need to generate a service account JSON key for each Firebase project and add them as GitHub secrets. These allow GitHub Actions to deploy to Firebase on your behalf.

**For bearings-app-dev:**
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → select `bearings-app-dev`
2. Click the **gear icon** (⚙️) next to "Project Overview" → **Project settings**
3. Click the **Service accounts** tab
4. Click **Generate new private key**
5. Click **Generate key** in the confirmation dialog
6. A JSON file downloads to your computer — name doesn't matter, but rename it to `bearings-dev-sa.json` so you know what it is
7. Now add it as a GitHub secret. In your terminal (from inside the `bearings` repo folder):
   ```bash
   gh secret set FIREBASE_SERVICE_ACCOUNT_DEV < ~/Downloads/bearings-dev-sa.json
   ```
   (Adjust the path if your file downloaded somewhere other than `~/Downloads`)

**For bearings-app-prod:**
1. Repeat steps 1–6 above but for the `bearings-app-prod` project
2. Rename the downloaded file to `bearings-prod-sa.json`
3. Add it as a secret:
   ```bash
   gh secret set FIREBASE_SERVICE_ACCOUNT_PROD < ~/Downloads/bearings-prod-sa.json
   ```

> **Security:** Delete both JSON files from your Downloads folder once the secrets are added. They contain sensitive credentials that should not sit on your machine.

---

## Step 7 — Add Remaining GitHub Secrets

You need to add 6 more secrets. Run these commands from inside your `bearings` repo folder, replacing the placeholder values with your real ones from Steps 3 and 4.

```bash
# Mapbox tokens (from Step 3)
gh secret set VITE_MAPBOX_TOKEN_DEV --body "pk.eyJ1IjoiREVWX1RPS0VOX0hFUkUi..."
gh secret set VITE_MAPBOX_TOKEN_PROD --body "pk.eyJ1IjoiUFJPRF9UT0tFTl9IRVJF..."

# GA4 Measurement IDs (from Step 4)
gh secret set VITE_GA_MEASUREMENT_ID_DEV --body "G-XXXXXXXXXX"
gh secret set VITE_GA_MEASUREMENT_ID_PROD --body "G-YYYYYYYYYY"
```

**The two Firebase config secrets** require one more step. You need to get the Firebase client config object for each project and base64-encode it.

1. Go to Firebase Console → `bearings-app-dev` → **Project settings** (gear icon)
2. Scroll down to **Your apps** — if there's no web app yet, click the **</>** icon to add one
   - App nickname: `Bearings Web Dev`
   - Do not check "Also set up Firebase Hosting" (already done)
   - Click **Register app**
3. You'll see a `firebaseConfig` object like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "bearings-app-dev.firebaseapp.com",
     projectId: "bearings-app-dev",
     storageBucket: "bearings-app-dev.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
4. Copy just the object contents (the `{ ... }` part) as valid JSON (use double quotes, no trailing commas) and save it to a temporary file, e.g. `firebase-config-dev.json`
5. Base64-encode and add as a secret:
   ```bash
   gh secret set VITE_FIREBASE_CONFIG_DEV --body "$(base64 < ~/Downloads/firebase-config-dev.json)"
   ```
6. Repeat steps 1–5 for `bearings-app-prod`, naming the app `Bearings Web Prod` and saving to `firebase-config-prod.json`:
   ```bash
   gh secret set VITE_FIREBASE_CONFIG_PROD --body "$(base64 < ~/Downloads/firebase-config-prod.json)"
   ```
7. Delete both JSON files from your Downloads folder.

---

## Step 8 — Verify Everything

Run this to confirm all 8 secrets are present:

```bash
gh secret list --repo YOUR_USERNAME/bearings
```

You should see:
```
FIREBASE_SERVICE_ACCOUNT_DEV     Updated ...
FIREBASE_SERVICE_ACCOUNT_PROD    Updated ...
VITE_MAPBOX_TOKEN_DEV            Updated ...
VITE_MAPBOX_TOKEN_PROD           Updated ...
VITE_GA_MEASUREMENT_ID_DEV       Updated ...
VITE_GA_MEASUREMENT_ID_PROD      Updated ...
VITE_FIREBASE_CONFIG_DEV         Updated ...
VITE_FIREBASE_CONFIG_PROD        Updated ...
```

Also log into the Firebase CLI so the agent can use it later:

```bash
firebase login
# This opens a browser window — log in with the same Google account you used for Firebase Console
```

---

## You're Done ✓

Hand off to the agent with:

> "All Phase 1 steps are complete. The GitHub repo is at github.com/YOUR_USERNAME/bearings, cloned locally at ~/Projects/bearings. All 8 secrets are set. Firebase CLI is authenticated. Please begin Phase 2."

The agent takes it from here through Phase 8. Your next hands-on moment is the **smoke test** in Phase 9 — running the dev build on a real phone to test GPS and compass.
