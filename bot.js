const { Telegraf } = require("telegraf");
const { Configuration, OpenAIApi } = require("openai");

// Читаем переменные окружения напрямую (Railway подставит их)
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID; // ID канала, куда бот отправляет ответы

// Проверка на наличие всех переменных (чтобы не было ошибок на сервере)
if (!BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
	console.error("Ошибка: Отсутствуют переменные окружения!");
	process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const openai = new OpenAIApi(
	new Configuration({ apiKey: OPENAI_API_KEY })
);

// Функция для запроса в ChatGPT
async function askChatGPT(question) {
	try {
		const response = await openai.createChatCompletion({
			model: "gpt-4", // Можно использовать "gpt-3.5-turbo"
			messages: [{ role: "user", content: question }],
			max_tokens: 200,
		});

		return response.data.choices[0].message.content.trim();
	} catch (error) {
		console.error("Ошибка ChatGPT:", error);
		return "Ошибка при обработке запроса. Попробуйте позже.";
	}
}

// Команда /start
bot.start((ctx) => {
	ctx.reply("Привет! Задай мне вопрос, и я отправлю ответ в канал.");
});

// Обработка сообщений от пользователей
bot.on("text", async (ctx) => {
	const question = ctx.message.text;

	ctx.reply("Обрабатываю ваш запрос...");

	const answer = await askChatGPT(question);

	// Отправка ответа в канал
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

// Запуск бота
bot.launch();
console.log("Бот запущен на Railway!");
