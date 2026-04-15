import { TelegramClient, Api, sessions } from "telegram";
import input from "input";
import crypto from "crypto";
import { env } from "node:process";

const { StringSession } = sessions;
// Данные с сайта https://telegram.org

const { API_ID, API_HASH, SESSION_STRING, TG_TARGET } = env;

export async function callToMain() {
  const client = new TelegramClient(
    new StringSession(SESSION_STRING),
    API_ID,
    API_HASH,
    {
      connectionRetries: 5,
    },
  );

  // Логин (потребуется номер телефона и код из Telegram)
  await client.start({
    phoneNumber: async () => await input.text("Введите номер телефона: "),
    password: async () => await input.text("Введите пароль (2FA): "),
    phoneCode: async () => await input.text("Введите код из сообщения: "),
    onError: (err) => console.log(err),
  });

  console.log("Вы успешно вошли!");
  console.log("Ваша сессия (сохраните её):", client.session.save());

  // Функция для звонка
  async function makeCall(username) {
    try {
      // 1. Получаем конфигурацию Диффи-Хеллмана от Telegram
      const dhConfig = await client.invoke(
        new Api.messages.GetDhConfig({
          version: 0,
          randomLength: 256,
        }),
      );

      const { p, g } = dhConfig;

      // 2. Генерируем случайное число 'a' (приватный ключ)
      const a = crypto.randomBytes(256);

      // 3. Вычисляем g_a = (g^a) mod p
      // В GramJS/Node.js для больших чисел используем BigInt
      const pBI = BigInt("0x" + p.toString("hex"));
      const gBI = BigInt(g);
      const aBI = BigInt("0x" + a.toString("hex"));

      // Функция для модульного возведения в степень (быстрое возведение)
      function power(base, exp, mod) {
        let res = BigInt(1);
        base = base % mod;
        while (exp > 0n) {
          if (exp % 2n === 1n) res = (res * base) % mod;
          base = (base * base) % mod;
          exp = exp / 2n;
        }
        return res;
      }

      const gA = power(gBI, aBI, pBI);

      // Преобразуем gA обратно в Buffer
      let gABuffer = Buffer.from(gA.toString(16), "hex");

      // 4. Создаем SHA256 хэш от gA
      const gAHash = crypto.createHash("sha256").update(gABuffer).digest();

      // 5. Выполняем запрос на звонок
      const result = await client.invoke(
        new Api.phone.RequestCall({
          userId: username,
          randomId: Math.floor(Math.random() * 1000000),
          gAHash: gAHash, // Теперь это валидный хэш
          protocol: new Api.PhoneCallProtocol({
            udpP2p: true,
            udpReflector: true,
            minLayer: 65,
            maxLayer: 65,
            libraryVersions: ["1.16.0"],
          }),
        }),
      );

      console.log("Звонок инициирован! ID звонка:", result.phoneCall.id);
    } catch (error) {
      console.error("Ошибка при звонке:", error);
    }
  }
  // Запуск звонка
  await makeCall(TG_TARGET);
}
