# Warp Central — Instagram Moodboard Queue (Vercel)

Queue moodboard images online. A free external cron wakes the app every minute and posts what’s due to Instagram.

## How it works (simple)

1. You open your Vercel site and upload photos.
2. Photos are stored on **Vercel Blob** (public HTTPS links Meta can download).
3. The schedule is saved in **Postgres** (Neon).
4. Every minute, **cron-job.org** calls `/api/publish`.
5. The app asks Meta’s Instagram API to publish the next due image(s).

You do **not** leave your laptop on. You do **not** need ngrok.

```
You → Vercel website → Blob (photos) + Postgres (queue)
                ↑
         cron-job.org (every minute)
                ↓
         Meta → Instagram
```

---

## Credentials checklist (where to grab each)

| Env var | What it is | Where to get it |
|---------|------------|-----------------|
| `DATABASE_URL` | Postgres connection string | [Neon](https://console.neon.tech) → Create project → **Connection string** (use the one with `sslmode=require`) |
| `BLOB_READ_WRITE_TOKEN` | Token to upload photos | [Vercel](https://vercel.com) → your project → **Storage** → create **Blob** store → copy token into env vars (Vercel often adds this automatically) |
| `CRON_SECRET` | Password so only your cron can hit publish | Invent one, e.g. run `openssl rand -hex 24` in a terminal |
| `META_ACCESS_TOKEN` | Key that lets the app post as you | [Meta for Developers](https://developers.facebook.com) — see steps below |
| `IG_USER_ID` | Your Instagram Business account number | Meta Graph API Explorer — see steps below |
| `META_GRAPH_VERSION` | API version | Leave as `v21.0` unless Meta docs say otherwise |

### Meta token + Instagram ID (step by step)

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App** (type **Business**).
2. Add the **Instagram** product / Instagram Graph API.
3. Make sure your IG is **Professional (Business)** and linked to a **Facebook Page**.
4. In **Graph API Explorer**:
   - Select your app
   - Get a User/Page token with permissions:
     - `instagram_basic`
     - `instagram_content_publish`
     - `pages_show_list`
     - `pages_read_engagement`
5. Call `me/accounts` → open your Page → then  
   `/{page-id}?fields=instagram_business_account`  
   → copy the `id` → that is **`IG_USER_ID`**.
6. Exchange for a **long-lived** token (Meta docs: long-lived page access token) → that is **`META_ACCESS_TOKEN`**.
7. For real production posting beyond test users, submit **App Review** for `instagram_content_publish`.

---

## Push to GitHub → connect Vercel

### 1. Push this repo

```bash
git add .
git commit -m "Vercel-ready Instagram moodboard queue"
git remote add origin https://github.com/YOUR_USER/warp_central.git   # if needed
git push -u origin main
```

### 2. Import on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. **Import** your GitHub repo
3. Framework: Next.js (auto-detected)
4. **Before Deploy**, add Environment Variables (Production):

```
DATABASE_URL=...
BLOB_READ_WRITE_TOKEN=...
CRON_SECRET=...
META_ACCESS_TOKEN=...
IG_USER_ID=...
META_GRAPH_VERSION=v21.0
```

5. Click **Deploy**

Tips:
- Create the **Blob** store on the Vercel project first (Storage tab) so `BLOB_READ_WRITE_TOKEN` is available.
- Create a free **Neon** database and paste `DATABASE_URL` before the first deploy (build runs `prisma db push`).

### 3. Wire auto-publish (required — otherwise nothing posts by itself)

Scheduling only saves times in the database. Something must wake the app to
call `/api/publish`. Pick **one** (GitHub Action is easiest if the repo is already on GitHub):

#### Option A — GitHub Actions (recommended)

1. In GitHub, create file `.github/workflows/auto-publish.yml`
2. Paste the contents from this repo’s `docs/auto-publish.workflow.yml`
3. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `PUBLISH_URL`
   - Value: `https://YOUR-APP.vercel.app/api/publish?secret=YOUR_CRON_SECRET`
4. **Actions** tab → **Auto-publish due Instagram posts** → **Run workflow** once to test
5. It then runs every **5 minutes** forever

#### Option B — cron-job.org

1. Go to [cron-job.org](https://cron-job.org) → create account
2. Create job:
   - URL: `https://YOUR-APP.vercel.app/api/publish?secret=YOUR_CRON_SECRET`
   - Schedule: every **1 minute**
3. Save — leave it running

While the Warp Central tab is open, the page also auto-publishes due posts every minute as a backup.

Vercel Hobby’s built-in cron only runs about once per day (extra safety net only).

---

## Day-to-day use

1. Open `https://YOUR-APP.vercel.app`
2. Select ~20 moodboard images
3. Choose **Spread across a day**
4. Click **Add to queue**
5. Walk away — cron + Meta do the rest

Meta allows **100 API posts / 24 hours**. 20/day is fine.

---

## Local development (optional)

Same env vars in `.env` (Neon + Blob tokens work from your laptop).

```bash
npm install
npm run db:push
npm run dev
```

Open http://localhost:3000

---

## Why not Vercel Cron every minute?

| Plan | Cron frequency |
|------|----------------|
| Hobby (free) | Once per day only |
| Pro | Every minute |

This project uses **cron-job.org** so the free Vercel plan still works for 20 spaced posts/day.
