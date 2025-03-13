require('dotenv').config();
const { Telegraf } = require("telegraf");
const { OpenAI } = require("openai");
const express = require("express");

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 8080;
const WEBHOOK_URL = `https://questbot-production.up.railway.app/webhook/${BOT_TOKEN}`;

if (!BOT_TOKEN || !OPENAI_API_KEY || !CHANNEL_ID) {
	console.error("Ошибка: отсутствуют переменные окружения!");
	process.exit(1);
}

// Проверка формата ID канала
if (!CHANNEL_ID.startsWith('-100')) {
	console.warn(`⚠️ ID канала ${CHANNEL_ID} может быть некорректным. Обычно ID публичных каналов начинаются с '-100'.`);
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

// Функция для проверки прав бота в канале
async function checkBotPermissionsInChannel() {
	try {
		console.log('Проверяю права бота в канале:', CHANNEL_ID);

		// Сначала получаем информацию о боте, если её ещё нет
		if (!bot.telegram.botInfo) {
			console.log('Получаю информацию о боте...');
			const botInfo = await bot.telegram.getMe();
			console.log('Информация о боте получена:', botInfo.username);

			// Тестовое сообщение в канал без проверки прав
			try {
				await bot.telegram.sendMessage(CHANNEL_ID, 'Тестовое сообщение от бота. Если вы видите это, значит бот имеет доступ к каналу.', { parse_mode: 'Markdown' });
				console.log('✅ Тестовое сообщение успешно отправлено в канал');
				return true;
			} catch (msgError) {
				console.error('❌ Ошибка при отправке тестового сообщения:', msgError.message);
				return false;
			}
		}

		// Если информация о боте уже есть, проверяем права
		const chatMember = await bot.telegram.getChatMember(CHANNEL_ID, bot.telegram.botInfo.id);
		console.log('Статус бота в канале:', chatMember.status);
		console.log('Права бота:', JSON.stringify(chatMember, null, 2));

		// Проверяем, есть ли у бота права администратора
		if (chatMember.status !== 'administrator') {
			console.warn('⚠️ Бот не является администратором канала. Это может вызвать проблемы с отправкой сообщений.');
		}

		// Тестовое сообщение в канал
		await bot.telegram.sendMessage(CHANNEL_ID, 'Тестовое сообщение от бота. Если вы видите это, значит бот имеет доступ к каналу.', { parse_mode: 'Markdown' });
		console.log('✅ Тестовое сообщение успешно отправлено в канал');

		return true;
	} catch (error) {
		console.error('❌ Ошибка при проверке прав бота:', error.message);
		return false;
	}
}

// Обработка /start
bot.start((ctx) => {
	console.log('Получена команда /start от пользователя:', ctx.from.id);
	ctx.reply("Привет! Задай мне вопрос, и я отправлю ответ в канал.");
});

// Обработка команды /status
bot.command('status', async (ctx) => {
	console.log('Получена команда /status от пользователя:', ctx.from.id);
	ctx.reply("Проверяю статус бота и подключение к каналу...");

	try {
		// Проверяем информацию о webhook
		const webhookInfo = await bot.telegram.getWebhookInfo();

		// Проверяем права в канале
		const channelAccess = await checkBotPermissionsInChannel();

		const statusMessage = `
Статус бота:
- Webhook URL: ${webhookInfo.url || 'не установлен'}
- Webhook активен: ${webhookInfo.url ? 'да' : 'нет'}
- Доступ к каналу: ${channelAccess ? 'есть' : 'нет'}
- ID канала: ${CHANNEL_ID}
- Режим работы: ${process.env.NODE_ENV === 'production' ? 'Production (webhook)' : 'Development (polling)'}
`;

		ctx.reply(statusMessage);
	} catch (error) {
		console.error('Ошибка при проверке статуса:', error);
		ctx.reply(`Ошибка при проверке статуса: ${error.message}`);
	}
});

// Команда для проверки ID канала
bot.command('channel', async (ctx) => {
	console.log('Получена команда /channel от пользователя:', ctx.from.id);
	ctx.reply(`Текущий ID канала: ${CHANNEL_ID}`);

	// Проверяем, является ли пользователь администратором бота
	if (ctx.from.id.toString() === process.env.ADMIN_ID) {
		ctx.reply("Вы администратор бота. Чтобы обновить ID канала, отправьте команду /setchannel ID_КАНАЛА");
	}
});

// Команда для установки нового ID канала
bot.command('setchannel', async (ctx) => {
	console.log('Получена команда /setchannel от пользователя:', ctx.from.id);

	// Проверяем, является ли пользователь администратором бота
	if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
		ctx.reply("У вас нет прав для изменения ID канала.");
		return;
	}

	const args = ctx.message.text.split(' ');
	if (args.length < 2) {
		ctx.reply("Пожалуйста, укажите ID канала. Пример: /setchannel -1001234567890");
		return;
	}

	const newChannelId = args[1];
	ctx.reply(`Пытаюсь обновить ID канала на: ${newChannelId}`);

	try {
		// Проверяем доступ к новому каналу
		await bot.telegram.sendMessage(
			newChannelId,
			'Тестовое сообщение для проверки доступа к каналу.',
			{ parse_mode: 'Markdown' }
		);

		ctx.reply(`✅ Доступ к каналу ${newChannelId} подтвержден. Обновите переменную CHANNEL_ID в настройках Railway.`);
	} catch (error) {
		ctx.reply(`❌ Ошибка доступа к каналу ${newChannelId}: ${error.message}`);
	}
});

// Обработка сообщений
bot.on("text", async (ctx) => {
	console.log('Получено текстовое сообщение от пользователя:', ctx.from.id, 'Текст:', ctx.message.text);
	const question = ctx.message.text;
	ctx.reply("Обрабатываю ваш запрос...");

	const answer = await askChatGPT(question);
	console.log('Получен ответ от ChatGPT:', answer.substring(0, 50) + '...');

	try {
		console.log('Пытаюсь отправить сообщение в канал:', CHANNEL_ID);
		await bot.telegram.sendMessage(
			CHANNEL_ID,
			`❓ *Вопрос:* ${question}\n\n💡 *Ответ:* ${answer}`,
			{ parse_mode: "Markdown" }
		);
		console.log('Сообщение успешно отправлено в канал');
		ctx.reply("Ответ опубликован в канале!");
	} catch (error) {
		console.error("Ошибка отправки в канал:", error);
		ctx.reply("Ошибка при публикации ответа: " + error.message);
	}
});

// Создание Express-сервера (держит процесс Railway активным)
const app = express();
app.use(express.json());

// Webhook обработчик
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
	console.log('Получен webhook запрос:', req.method, req.url);
	bot.handleUpdate(req.body);
	res.sendStatus(200);
});

// Добавляем обработчик для проверки webhook
app.get(`/webhook/${BOT_TOKEN}`, (req, res) => {
	console.log('Получен GET запрос к webhook:', req.method, req.url);
	res.send('Webhook работает!');
});

// Корневой маршрут (Railway теперь не будет останавливать контейнер)
app.get("/", (req, res) => {
	res.send("Бот работает! 🚀");
});

// Запуск сервера Express
app.listen(PORT, async () => {
	console.log(`🚀 Сервер запущен на порту ${PORT}`);

	// Определяем, в какой среде запущен бот
	const isProduction = process.env.NODE_ENV === 'production';
	console.log(`Режим работы: ${isProduction ? 'Production (webhook)' : 'Development (polling)'}`);

	if (isProduction) {
		// Очищаем старый Webhook перед установкой нового
		try {
			await bot.telegram.deleteWebhook();
			console.log("✅ Старый Webhook удалён");
		} catch (error) {
			console.warn("⚠️ Ошибка при удалении webhook:", error.message);
		}

		// Устанавливаем новый Webhook
		try {
			await bot.telegram.setWebhook(WEBHOOK_URL);
			console.log(`✅ Новый Webhook установлен: ${WEBHOOK_URL}`);

			// Проверяем информацию о webhook
			const webhookInfo = await bot.telegram.getWebhookInfo();
			console.log("ℹ️ Информация о webhook:", JSON.stringify(webhookInfo, null, 2));

			// Проверяем права бота в канале
			await checkBotPermissionsInChannel();
		} catch (error) {
			console.error("❌ Ошибка при установке Webhook:", error.message);
		}
	} else {
		// В режиме разработки используем long polling
		try {
			await bot.telegram.deleteWebhook();
			console.log("✅ Webhook удалён для режима polling");

			// Запускаем бота в режиме polling
			bot.launch();
			console.log("✅ Бот запущен в режиме polling");

			// Ждем немного, чтобы бот успел инициализироваться
			setTimeout(async () => {
				// Проверяем права бота в канале
				await checkBotPermissionsInChannel();
			}, 3000);
		} catch (error) {
			console.error("❌ Ошибка при запуске в режиме polling:", error.message);
		}
	}
});

// Поддержка активности Railway (Лог в консоли каждые 5 минут)
setInterval(() => {
	console.log("✅ Сервер Railway работает и не останавливается");
}, 1000 * 60 * 5);

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
	console.error('❌ Необработанное исключение:', error);
});

// Обработка необработанных отклонений промисов
process.on('unhandledRejection', (reason, promise) => {
	console.error('❌ Необработанное отклонение промиса:', reason);
});
