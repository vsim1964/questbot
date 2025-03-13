const { Telegraf } = require("telegraf");
const { OpenAI } = require("openai");
const express = require("express");

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
	console.error("Ошибка: отсутствуют переменные окружения!");
	process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ChatGPT API
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

// Настройка Webhook
const app = express();
app.use(express.json());

app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
	bot.handleUpdate(req.body);
	res.sendStatus(200);
});

app.listen(PORT, async () => {
	const webhookUrl = `https://your-railway-app-url/webhook/${BOT_TOKEN}`;
	await bot.telegram.setWebhook(webhookUrl);
	console.log(`🚀 Бот работает через Webhook: ${webhookUrl}`);
});
