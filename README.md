# Catskill Mountain Yoga Festival — Schedule Scraper

Automated scraper that pulls the public schedule from the [ClearEvent portal](https://app.clearevent.com/eventPortal#/event/0aed3d62-2a7d-460f-a7ad-058cf1a67eab/schedules/2323/detail) and outputs a clean `data/schedule.json` file. A GitHub Action runs the scraper every 6 hours and commits any changes. The JSON is consumed by an embeddable snippet designed for Squarespace Code Blocks.

## Project structure

```
├── .github/workflows/scrape-schedule.yml   ← GitHub Action (cron + manual)
├── scraper/
│   ├── package.json
│   └── scrape.js                           ← Playwright scraper
├── data/
│   └── schedule.json                       ← output (committed by the Action)
└── squarespace/
    └── schedule-embed.html                 ← paste into a Squarespace Code Block
```

## Running the scraper locally

```bash
cd scraper
npm ci
npx playwright install --with-deps chromium
npm run scrape
```

On success the script prints the session count and writes `data/schedule.json`. If the page fails to load or no sessions are found it exits with a non-zero code and does **not** overwrite the existing file.

## GitHub Action

The workflow at `.github/workflows/scrape-schedule.yml` runs automatically:

| Trigger | Schedule |
|---------|----------|
| Cron | Every 6 hours (`0 */6 * * *`) |
| Manual | **Actions → Scrape ClearEvent Schedule → Run workflow** |

After scraping it checks `git diff`; if `schedule.json` changed it commits with the `github-actions[bot]` identity and pushes. Otherwise it skips the commit.

You can view past runs under the **Actions** tab in the repository.

## Making the JSON accessible

The Squarespace embed fetches `schedule.json` via a raw URL. Choose one of the options below.

### Option A — Public repository (simplest)

1. Go to **Settings → General → Danger Zone** and change visibility to **Public**.
2. The raw URL will be:
   ```
   https://raw.githubusercontent.com/<OWNER>/<REPO>/main/data/schedule.json
   ```
3. Update the `SCHEDULE_JSON_URL` constant inside `squarespace/schedule-embed.html` with this URL.

### Option B — GitHub Pages (repo can stay private)

1. Go to **Settings → Pages**.
2. Set **Source** to **Deploy from a branch**, choose **main** branch, and set the folder to **/ (root)**.
3. After the first deploy the JSON will be available at:
   ```
   https://<OWNER>.github.io/<REPO>/data/schedule.json
   ```
4. Update `SCHEDULE_JSON_URL` in the embed snippet with this URL.

## Squarespace embed setup

1. Open `squarespace/schedule-embed.html` and replace the `SCHEDULE_JSON_URL` value with the URL from the step above.
2. In your Squarespace page editor, add a **Code Block** (insert point → Code).
3. Paste the entire contents of `schedule-embed.html` into the code block.
4. Turn **off** the "Display Source" toggle and save.

The embed is fully self-contained — no external dependencies, no build step. CSS custom properties at the top of the `<style>` block (`--cmyf-*`) let you quickly adjust colors and fonts to match your site theme.
