import { chromium } from "playwright";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../data/schedule.json");

const SCHEDULE_URL =
  "https://app.clearevent.com/eventPortal#/event/0aed3d62-2a7d-460f-a7ad-058cf1a67eab/schedules/2323/detail";

/**
 * Parse the ClearEvent friendly date string into structured date/time fields.
 *
 * Handles two formats:
 *   "Jul 25, 2026, 8:00 AM - 8:50 AM"          (same-day)
 *   "Jul 24, 5:30 PM - Jul 25, 7:00 PM, 2026"  (multi-day)
 */
function parseDateTimeString(raw) {
  const s = (raw || "").replace(/\s+/g, " ").trim();

  // Same-day: "Jul 25, 2026, 8:00 AM - 8:50 AM"
  const sameDay = s.match(
    /^(\w+ \d{1,2}, \d{4}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i
  );
  if (sameDay) {
    return { date: sameDay[1], startTime: sameDay[2], endTime: sameDay[3] };
  }

  // Multi-day: "Jul 24, 5:30 PM - Jul 25, 7:00 PM, 2026"
  const multiDay = s.match(
    /^(\w+ \d{1,2}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\w+ \d{1,2}),\s*(\d{1,2}:\d{2}\s*[AP]M),\s*(\d{4})$/i
  );
  if (multiDay) {
    return {
      date: `${multiDay[1]}, ${multiDay[5]}`,
      startTime: multiDay[2],
      endTime: multiDay[4],
    };
  }

  return { date: s, startTime: "", endTime: "" };
}

/**
 * Attempt to extract an instructor name from a title string.
 * Looks for patterns like "w/Name Name" or "with Name Name".
 */
function extractInstructor(title) {
  const match = title.match(/\b(?:w\/|with\s+)([A-Z][A-Za-z'']+(?:\s+[A-Z][A-Za-z'']+)*)/);
  return match ? match[1].trim() : "";
}

async function scrape() {
  console.log("Launching browser…");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    console.log(`Navigating to ${SCHEDULE_URL}`);
    await page.goto(SCHEDULE_URL, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    console.log("Waiting for schedule items to render…");
    await page.waitForSelector(".schedule-content", { timeout: 30_000 });
    // Small buffer for KnockoutJS bindings to settle
    await page.waitForTimeout(2000);

    const sessions = await page.$$eval(".schedule-content", (cards) =>
      cards.map((card) => {
        const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

        const title =
          text(card.querySelector('[data-bind*="text: title"]')) ||
          text(card.querySelector(".heading"));

        const dateTimeRaw = text(
          card.querySelector('[data-bind*="shortFriendlyStartToEndDate"]')
        );

        const description = text(card.querySelector(".markdown"));

        const location = text(
          card.querySelector('[data-bind*="text: location"]')
        );

        const category = text(
          card.querySelector('[data-bind*="text: categoryName"]')
        );

        return { title, dateTimeRaw, description, location, category };
      })
    );

    if (!sessions.length) {
      console.error("ERROR: No sessions found on the page.");
      process.exit(1);
    }

    const formattedSessions = sessions.map((s) => {
      const { date, startTime, endTime } = parseDateTimeString(s.dateTimeRaw);
      return {
        title: s.title,
        description: s.description,
        instructor: extractInstructor(s.title),
        date,
        startTime,
        endTime,
        location: s.location,
        category: s.category,
        capacity: null,
        tags: [],
      };
    });

    // Compare against the existing file so we only update lastUpdated when
    // session data actually changes — avoids a new commit every run.
    let previousTimestamp = null;
    let sessionsChanged = true;
    if (existsSync(OUTPUT_PATH)) {
      try {
        const prev = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
        previousTimestamp = prev.lastUpdated || null;
        sessionsChanged =
          JSON.stringify(prev.sessions) !== JSON.stringify(formattedSessions);
      } catch {
        // Corrupt file — treat as changed
      }
    }

    const output = {
      lastUpdated: sessionsChanged
        ? new Date().toISOString()
        : previousTimestamp,
      eventName: "Catskill Mountain Yoga Festival",
      sessions: formattedSessions,
    };

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");

    if (sessionsChanged) {
      console.log(
        `Success: scraped ${formattedSessions.length} sessions (data changed) → ${OUTPUT_PATH}`
      );
    } else {
      console.log(
        `Success: scraped ${formattedSessions.length} sessions (no changes detected)`
      );
    }
  } catch (err) {
    console.error("Scrape failed:", err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

scrape();
