require("dotenv").config();
const { Telegraf } = require("telegraf");
const { Configuration, OpenAIApi } = require("openai");

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAIApi(
	new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

const CHANNEL_ID = process.env.CHANNEL_ID; // ID канала (формат -100xxxxxxxxxx)

// Функция для запроса к ChatGPT
async function askChatGPT(question) {
	try {
		const response = await openai.createChatCompletion({
			model: "gpt-4", // Можно заменить на gpt-3.5-turbo для экономии
			messages: [{ role: "user", content: question }],
			max_tokens: 200, // Длина ответа
		});

		return response.data.choices[0].message.content.trim();
	} catch (error) {
		console.error("Ошибка ChatGPT:", error);
		return "Ошибка при обработке запроса. Попробуйте позже.";
	}
}

// Обработка команды /start
bot.start((ctx) => {
	ctx.reply("Привет! Задай мне вопрос, и я отправлю ответ в канал.");
});

// Обработка текстовых сообщений от пользователей
bot.on("text", async (ctx) => {
	const question = ctx.message.text;
	const chatId = ctx.chat.id;

	ctx.reply("Обрабатываю ваш запрос...");

	const answer = await askChatGPT(question);

	// Отправка ответа в канал
	try {
		await bot.telegram.sendMessage(CHANNEL_ID, `❓ *Вопрос:* ${question}\n\n💡 *Ответ:* ${answer}`, { parse_mode: "Markdown" });
		ctx.reply("Ответ опубликован в канале!");
	} catch (error) {
		console.error("Ошибка отправки в канал:", error);
		ctx.reply("Ошибка при публикации ответа.");
	}
});

// Запуск бота
bot.launch();
console.log("Бот запущен!");
