import { chromium } from "playwright";
import fs from "fs";
import { env } from "process";
import { callToMain } from "./secondPhone.js";

const { URL, EMAIL, PASSWORD, TG_BOT_TOKEN, TG_CHAT_ID } = env;

let browser;
let context;
let page;
let lastState = "init";

// -------------------------
// 📩 Telegram
// -------------------------
async function sendTelegram(message) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.log("⚠️ Telegram error:", err.message);
  }
}

// -------------------------
// 🧠 Имитация человека
// -------------------------
async function humanize(page) {
  try {
    // случайное движение мыши
    await page.mouse.move(
      100 + Math.random() * 500,
      100 + Math.random() * 400,
      { steps: 5 },
    );

    await page.waitForTimeout(300 + Math.random() * 700);

    // иногда скролл
    if (Math.random() > 0.5) {
      await page.mouse.wheel(0, 200 + Math.random() * 400);
    }

    await page.waitForTimeout(300 + Math.random() * 1000);
  } catch {}
}

// -------------------------
// 🌐 Safe goto
// -------------------------
async function safeGoto(url) {
  for (let i = 0; i < 5; i++) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      return true;
    } catch (e) {
      console.log(
        `⚠️ goto retry ${i + 1}:`,
        e.message,
        new Date().toLocaleString(),
      );
      await sendTelegram(`⚠️ goto retry ${i + 1}:`, JSON.stringify(e.message));
      await page.waitForTimeout(2000 + Math.random() * 2000);
    }
  }
  return false;
}

// -------------------------
// 🔐 Login
// -------------------------
async function login() {
  await sendTelegram("🔐 Запуск новой сессии");

  await page.goto("https://ais.usvisa-info.com/en-it/niv/users/sign_in", {
    waitUntil: "domcontentloaded",
  });

  await humanize(page);

  await page.fill("#user_email", EMAIL);
  await page.waitForTimeout(500 + Math.random() * 500);

  await page.fill("#user_password", PASSWORD);
  await page.waitForTimeout(500 + Math.random() * 500);

  await page.click(".icheckbox");

  await Promise.all([
    page.waitForNavigation(),
    page.click('input[name="commit"]'),
  ]);

  await context.storageState({ path: "session.json" });
}

// -------------------------
// 🔍 Проверка слотов
// -------------------------
async function checkSlots() {
  const ok = await safeGoto(URL);
  if (!ok) return;

  // если разлогинился
  if (page.url().includes("sign_in")) {
    await login();
    if(!page.url().includes('appointment'))
      await safeGoto(URL);
  }

  await humanize(page);

  try {
    // открыть календарь
    await page.waitForSelector("#appointments_consulate_appointment_date", {
      timeout: 15000,
    });

    await page.click("#appointments_consulate_appointment_date");
    await page.waitForSelector(".ui-datepicker-group");

    // получить оба месяца сразу
    const months = await page.$$eval(".ui-datepicker-group", (groups) =>
      groups.map((group) => {
        const month = group.querySelector(".ui-datepicker-month")?.textContent;
        const year = group.querySelector(".ui-datepicker-year")?.textContent;

        const days = Array.from(group.querySelectorAll("td a")).map((el) =>
          el.textContent.trim(),
        );

        return { month, year, days };
      }),
    );
    console.log(months, "month");
    const validMonths = ["April", "May"];

    const validSlot = months.find(
      (m) => validMonths.includes(m.month) && m.days.length > 0,
    );

    // -------------------------
    // 🔔 Anti-spam логика
    // -------------------------
    if (validSlot && lastState !== "slots") {
      lastState = "slots";

      const day = validSlot.days[0];

      console.log(`🚨 SLOT FOUND: ${validSlot.month} ${day}`);

      callToMain();

      await sendTelegram(
        `🚨 <b>ЕСТЬ СЛОТ!</b>\n${validSlot.month} ${day}, ${validSlot.year}`,
      );
    }

    if (!validSlot && lastState !== "no_slots") {
      lastState = "no_slots";
      console.log("❌ нет подходящих дат");
    }
  } catch (e) {
    console.log("⚠️ ошибка календаря:", e.message);
  }
}

// -------------------------
// 🚀 Init (один раз)
// -------------------------
async function init() {
  browser = await chromium.launch({
    headless: false,
  });

  context = await browser.newContext({
    storageState: fs.existsSync("session.json") ? "session.json" : undefined,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });

  page = await context.newPage();
}

// -------------------------
// 🔁 Loop
// -------------------------
async function loop() {
  try {
    await checkSlots();
  } catch (e) {
    console.log("⚠️ loop error:", e.message);
  }

  // 🔥 более "человеческий" интервал
  let delay;

  delay = (6 + Math.random() * 6) * 60 * 1000; // 6–12 мин

  console.log(`⏳ ${new Date(new Date().getTime() - 4*60*60*1000).toLocaleTimeString()} следующий чек через ${Math.round(delay / 60000)} мин`);

  setTimeout(loop, delay);
}

// -------------------------
// 🛑 Graceful shutdown (PM2)
// -------------------------
async function shutdown() {
  console.log("🛑 shutting down...");

  try {
    if (browser) await browser.close();
  } catch {}

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// -------------------------
// ▶️ Start
// -------------------------
await sendTelegram("🚀 <b>Бот запущен</b>");

await init();
loop();
