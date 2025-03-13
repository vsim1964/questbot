const { Telegraf } = require("telegraf");
const { OpenAI } = require("openai");
const express = require("express");

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = `https://questbot-production.up.railway.app/webhook/${BOT_TOKEN}`;

if (!BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
	console.error("Ошибка: отсутствуют переменные окружения!");
	process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Функция для запроса к ChatGPT
async function askChatGPT(question) {
	try {
		const response = await openai.chat.completions.create({
			model: "gpt-4",
			messages: [{ role: "user", content: question }],
			max_tokens: 200,
		});

		return response.choices[0].message.content.trim();
	} catch (error) {
		console.error("Ошибка ChatGPT:", error);
		return "Ошибка при обработке запроса. Попробуйте позже.";
	}
}

// Обработка /start
bot.start((ctx) => {
	ctx.reply("Привет! Задай мне вопрос, и я отправлю ответ в канал.");
});

// Обработка сообщений
bot.on("text", async (ctx) => {
	const question = ctx.message.text;
	ctx.reply("Обрабатываю ваш запрос...");

	const answer = await askChatGPT(question);

	try {
		await bot.telegram.sendMessage(
			CHANNEL_ID,
			`❓ *Вопрос:* ${question}\n\n💡 *Ответ:* ${answer}`,
			{ parse_mode: "Markdown" }
		);
		ctx.reply("Ответ опубликован в канале!");
	} catch (error) {
		console.error("Ошибка отправки в канал:", error);
		ctx.reply("Ошибка при публикации ответа.");
	}
});

// Создание Express-сервера (держит процесс Railway активным)
const app = express();
app.use(express.json());

// Webhook обработчик
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
	bot.handleUpdate(req.body);
	res.sendStatus(200);
});

// Корневой маршрут (Railway теперь не будет останавливать контейнер)
app.get("/", (req, res) => {
	res.send("Бот работает! 🚀");
});

// Запуск сервера Express
app.listen(PORT, async () => {
	console.log(`🚀 Сервер запущен на порту ${PORT}`);

	// Очищаем старый Webhook перед установкой нового
	try {
		await bot.telegram.deleteWebhook();
		console.log("✅ Старый Webhook удалён");
	} catch (error) {
		console.warn("⚠️ Webhook не был установлен ранее.");
	}

	// Устанавливаем новый Webhook
	try {
		await bot.telegram.setWebhook(WEBHOOK_URL);
		console.log(`✅ Новый Webhook установлен: ${WEBHOOK_URL}`);
	} catch (error) {
		console.error("❌ Ошибка при установке Webhook:", error);
	}
});

// Поддержка активности Railway (Лог в консоли каждые 5 минут)
setInterval(() => {
	console.log("✅ Сервер Railway работает и не останавливается");
}, 1000 * 60 * 5);
