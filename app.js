import { chromium } from "playwright";
import fs from "fs";
import { callToMain } from "./secondPhone.js";
import { env } from "process";

const hasSession = fs.existsSync("session.json");

const {URL, EMAIL, PASSWORD, SESSION_STRING} = env;

async function checkSlots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: hasSession ? "session.json" : {},
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  await safeGoto(page, URL);

  if (page.url().includes("sign_in")) {
    await login(page, context);
    if (page.url() !== URL) await safeGoto(page, URL);
  }

  console.log("✅ Сессия работает");

  const rows = await page
    .locator(".for-layout td.text-right")
    .allTextContents();

  const allUnavailable = rows.every((text) =>
    text.trim().includes("No Appointments Available"),
  );

  if (allUnavailable) {
    console.log("❌ слотов нет");
  } else {
    console.log("🚨 ЕСТЬ СЛОТЫ!");
    callToMain()
    await sendTelegram("🚨 <b>ЕСТЬ СЛОТЫ!</b>\nОткрывай сайт СРОЧНО!");
  }

  await browser.close();
}

async function login(page, context) {
  console.log("❌ Сессия умерла → перелогин");
  await sendTelegram("🔐 Сессия умерла → перелогин");
  console.log("🔐 Логинимся...");

  await page.goto("https://ais.usvisa-info.com/en-it/niv/users/sign_in", {
    waitUntil: "domcontentloaded",
  });

  await page.fill("#user_email", EMAIL);
  await page.fill("#user_password", PASSWORD);

  await page.locator(".icheckbox").click();

  await Promise.all([
    page.waitForURL((url) => !url.href.includes("sign_in")),
    page.click('input[name="commit"]'),
  ]);

  console.log("✅ Успешный логин:", page.url());

  // даём время на установку cookies
  await page.waitForTimeout(3000);

  // 🔥 обновляем сессию
  await context.storageState({ path: "session.json" });

  console.log("💾 session.json обновлён");

  return true;
}


async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return;
    } catch (e) {
      console.log(`⚠️ goto failed (${i + 1}/3):`, e.message);
      await sendTelegram(`⚠️ Ошибка goto (${i + 1}/3): ${e.message}`);
      await page.waitForTimeout(2000);
    }
  }

  await sendTelegram("❌ <b>Страница не загрузилась после 3 попыток</b>");
  throw new Error("❌ Страница не загрузилась после 3 попыток");
}

async function sendTelegram(message) {
  const TELEGRAM_TOKEN = "8206927494:AAF54280QC5j2OQSHiWiQZfpyZb7Wi8SbBk";
  const chat_id = 503692935;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.log("⚠️ Ошибка отправки в Telegram:", err.message);
  }
}

function startLoop() {
  const delay = (7 + Math.random() * 3) * 60 * 1000; // 7–10 минут

  checkSlots().then(() => {
    console.log(`⏳ следующий чек через ${Math.round(delay / 60000)}`);
    setTimeout(startLoop, delay);
  });
}
startLoop();
await sendTelegram("🚀 <b>Старт программы</b>");