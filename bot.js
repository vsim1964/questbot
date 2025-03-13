require('dotenv').config();
const { Telegraf } = require("telegraf");
const { OpenAI } = require("openai");
const express = require("express");
const fetch = require("node-fetch");

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
if (CHANNEL_ID.startsWith('-') && !CHANNEL_ID.startsWith('-100')) {
	console.warn(`⚠️ ID канала ${CHANNEL_ID} может быть некорректным. Обычно ID публичных каналов начинаются с '-100'.`);
} else if (CHANNEL_ID.startsWith('@')) {
	console.log(`ℹ️ Используется username канала: ${CHANNEL_ID}`);
}

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Добавляем обработчик ошибок для бота
bot.catch((err, ctx) => {
	console.error('Ошибка Telegraf:', err);
	console.error('Контекст ошибки:', JSON.stringify(ctx.update, null, 2));
});

// Функция для запроса к ChatGPT
async function askChatGPT(question) {
	try {
		console.log('Отправляю запрос к ChatGPT с вопросом:', question);

		const response = await openai.chat.completions.create({
			model: "gpt-4",
			messages: [{ role: "user", content: question }],
			max_tokens: 200,
		});

		console.log('Получен ответ от API OpenAI');

		if (!response.choices || response.choices.length === 0) {
			console.error('Ошибка: Пустой ответ от ChatGPT');
			return "Ошибка при обработке запроса. Получен пустой ответ от ChatGPT.";
		}

		const answer = response.choices[0].message.content.trim();
		console.log('Обработанный ответ от ChatGPT:', answer.substring(0, 50) + (answer.length > 50 ? '...' : ''));

		return answer;
	} catch (error) {
		console.error("Ошибка ChatGPT:", error);
		console.error("Детали ошибки:", JSON.stringify(error, null, 2));
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

// Простая тестовая команда
bot.command('test', (ctx) => {
	console.log('Получена тестовая команда от пользователя:', ctx.from.id);
	ctx.reply("Тест пройден! Бот работает.");
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
		ctx.reply("Чтобы узнать ID канала, добавьте бота @userinfobot в канал, отправьте сообщение и перешлите его боту @userinfobot.");
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

// Добавляем обработчик для отладки всех сообщений
bot.on('message', (ctx) => {
	console.log('Получено сообщение:', JSON.stringify(ctx.message));
	if (ctx.message.text && ctx.message.text.startsWith('/')) {
		console.log('Получена команда:', ctx.message.text);
	}
});

// Обработка пересланных сообщений для определения ID канала
bot.on('forward_date', (ctx) => {
	if (ctx.message.forward_from_chat) {
		const chatId = ctx.message.forward_from_chat.id;
		const chatType = ctx.message.forward_from_chat.type;
		const chatTitle = ctx.message.forward_from_chat.title || 'Неизвестно';

		console.log(`Получено пересланное сообщение из ${chatType} "${chatTitle}" с ID: ${chatId}`);

		ctx.reply(`Информация о чате:
- Тип: ${chatType}
- Название: ${chatTitle}
- ID: ${chatId}

Если это ваш канал, вы можете использовать этот ID с командой /setchannel ${chatId}`);
	} else {
		ctx.reply("Это сообщение не содержит информации о канале.");
	}
});

// Обработка текстовых сообщений (не команд)
// Важно: этот обработчик должен быть последним, чтобы не перехватывать другие типы сообщений
bot.on("text", async (ctx) => {
	// Проверяем, не является ли сообщение командой
	if (ctx.message.text.startsWith('/')) {
		console.log('Сообщение является командой, пропускаем в обработчике текстовых сообщений');
		return; // Пропускаем команды, они обрабатываются выше
	}

	// Проверяем, не завершается ли работа бота
	if (isShuttingDown) {
		console.log('Бот завершает работу, новые запросы не обрабатываются');
		await ctx.reply("Извините, бот в данный момент перезагружается. Пожалуйста, повторите запрос через минуту.");
		return;
	}

	console.log('Обрабатываю текстовое сообщение от пользователя:', ctx.from.id, 'Текст:', ctx.message.text);
	const question = ctx.message.text;

	try {
		await ctx.reply("Обрабатываю ваш запрос...");
		console.log('Отправляю запрос к ChatGPT...');

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
			await ctx.reply("Ответ опубликован в канале!");
		} catch (error) {
			console.error("Ошибка отправки в канал:", error);
			await ctx.reply("Ошибка при публикации ответа: " + error.message);
		}
	} catch (error) {
		console.error("Ошибка при обработке сообщения:", error);
		await ctx.reply("Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.");
	}
});

// Создание Express-сервера (держит процесс Railway активным)
const app = express();
app.use(express.json());

// Webhook обработчик
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
	console.log('Получен POST запрос к webhook:', req.method, req.url);

	// Проверяем, не завершается ли работа бота
	if (isShuttingDown) {
		console.log('Бот завершает работу, новые webhook запросы не обрабатываются');
		return res.sendStatus(503); // Service Unavailable
	}

	// Проверяем, что тело запроса не пустое
	if (!req.body || Object.keys(req.body).length === 0) {
		console.log('Получен пустой POST запрос, возможно проверка доступности');
		return res.sendStatus(200);
	}

	console.log('Тело запроса:', JSON.stringify(req.body, null, 2));

	try {
		// Проверяем наличие сообщения в запросе
		if (req.body.message && req.body.message.text) {
			console.log('Обнаружено текстовое сообщение в запросе:', req.body.message.text);

			// Если это не команда, логируем это отдельно и обрабатываем напрямую
			if (!req.body.message.text.startsWith('/')) {
				console.log('Это обычное текстовое сообщение, не команда. Обрабатываю напрямую...');

				// Создаем контекст для обработки
				const ctx = {
					message: req.body.message,
					from: req.body.message.from,
					chat: req.body.message.chat,
					reply: async (text) => {
						console.log('Отправляю ответ пользователю:', text);
						return bot.telegram.sendMessage(req.body.message.chat.id, text);
					}
				};

				// Обрабатываем сообщение напрямую
				const question = req.body.message.text;

				try {
					await ctx.reply("Обрабатываю ваш запрос...");
					console.log('Отправляю запрос к ChatGPT...');

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
						await ctx.reply("Ответ опубликован в канале!");
					} catch (error) {
						console.error("Ошибка отправки в канал:", error);
						await ctx.reply("Ошибка при публикации ответа: " + error.message);
					}
				} catch (error) {
					console.error("Ошибка при обработке сообщения:", error);
					await ctx.reply("Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.");
				}

				res.sendStatus(200);
				console.log('Webhook запрос с текстовым сообщением обработан напрямую');
				return;
			}
		}

		// Устанавливаем таймаут для обработки запроса
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Timeout')), 25000)
		);

		// Обрабатываем запрос с таймаутом
		await Promise.race([
			bot.handleUpdate(req.body),
			timeoutPromise
		]);

		res.sendStatus(200);
		console.log('Webhook запрос успешно обработан');
	} catch (error) {
		console.error('Ошибка при обработке webhook запроса:', error);
		res.sendStatus(500);
	}
});

// Добавляем обработчик для проверки webhook
app.get(`/webhook/${BOT_TOKEN}`, (req, res) => {
	console.log('Получен GET запрос к webhook:', req.method, req.url);
	// Просто отвечаем, что webhook работает, но не обрабатываем как обновление
	res.send('Webhook работает! Для обновлений используйте POST-запросы.');
});

// Корневой маршрут (Railway теперь не будет останавливать контейнер)
app.get("/", (req, res) => {
	console.log('Получен запрос к корневому маршруту');
	res.send("Бот работает! 🚀");
});

// Добавляем маршрут для проверки здоровья приложения
app.get("/health", (req, res) => {
	console.log('Получен запрос проверки здоровья');
	res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
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

			// Получаем информацию о боте
			const botInfo = await bot.telegram.getMe();
			console.log("ℹ️ Информация о боте:", JSON.stringify(botInfo, null, 2));

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

	// Дополнительная проверка для поддержания активности
	try {
		fetch("https://questbot-production.up.railway.app/health")
			.then(response => console.log("Health check успешен:", response.status))
			.catch(error => console.error("Ошибка health check:", error));
	} catch (error) {
		console.error("Ошибка при выполнении health check:", error);
	}
}, 1000 * 60 * 5); // Каждые 5 минут

// Добавляем еще один интервал для более частых проверок
setInterval(() => {
	// Простая проверка активности каждую минуту
	console.log("⏱️ Проверка активности");

	// Проверяем, что webhook настроен правильно
	bot.telegram.getWebhookInfo()
		.then(info => {
			if (!info.url || info.url !== WEBHOOK_URL) {
				console.log("⚠️ Webhook не настроен или настроен неправильно, переустанавливаем...");
				return bot.telegram.setWebhook(WEBHOOK_URL);
			}
			return Promise.resolve();
		})
		.then(() => console.log("✅ Webhook проверен"))
		.catch(error => console.error("❌ Ошибка при проверке webhook:", error));
}, 1000 * 60 * 10); // Каждые 10 минут

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
	console.error('❌ Необработанное исключение:', error);
});

// Обработка необработанных отклонений промисов
process.on('unhandledRejection', (reason, promise) => {
	console.error('❌ Необработанное отклонение промиса:', reason);
});

// Обработка сигналов завершения
let isShuttingDown = false;

process.on('SIGTERM', async () => {
	console.log('Получен сигнал SIGTERM, готовлюсь к завершению работы...');
	isShuttingDown = true;

	// Даем время на обработку текущих запросов (30 секунд)
	console.log('Ожидаю завершения текущих запросов (30 секунд)...');
	await new Promise(resolve => setTimeout(resolve, 30000));

	// Удаляем webhook перед завершением
	try {
		await bot.telegram.deleteWebhook();
		console.log('Webhook удален перед завершением');
	} catch (error) {
		console.error('Ошибка при удалении webhook:', error);
	}

	console.log('Завершаю работу...');
	process.exit(0);
});

process.on('SIGINT', async () => {
	console.log('Получен сигнал SIGINT, готовлюсь к завершению работы...');
	isShuttingDown = true;

	// Даем время на обработку текущих запросов (5 секунд)
	console.log('Ожидаю завершения текущих запросов (5 секунд)...');
	await new Promise(resolve => setTimeout(resolve, 5000));

	// Удаляем webhook перед завершением
	try {
		await bot.telegram.deleteWebhook();
		console.log('Webhook удален перед завершением');
	} catch (error) {
		console.error('Ошибка при удалении webhook:', error);
	}

	console.log('Завершаю работу...');
	process.exit(0);
});
