const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const botConfig = require('./botconfig.json'); // Токен бота и ID каналов из botconfig.json

// Создаем клиента Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Для доступа к тексту сообщений
    ]
});

// Инициализация модели TensorFlow.js
let model;
const trainingData = [];

// Указываем модель бота, теперь из конфигурационного файла
const botModelName = botConfig.modelName || "AnonimBot v1.0";  // Название модели

// Загрузка данных для обучения (если есть сохраненные)
try {
    const rawData = fs.readFileSync('trainingData.json', 'utf-8');
    const savedData = JSON.parse(rawData);
    trainingData.push(...savedData);
    console.log('Данные для обучения загружены.');
} catch (err) {
    console.log('Файл с обучающими данными не найден. Начинаем с нуля.');
}

// Подготовка строки к фиксированной длине
const prepareInput = (input) => {
    const maxLength = 50;

    if (typeof input !== 'string') {
        console.error(`Некорректные входные данные: ${input}`);
        input = '';
    }

    const charCodes = Array.from(input).map((ch) => ch.charCodeAt(0));
    const paddedArray = new Array(maxLength).fill(0);

    charCodes.slice(0, maxLength).forEach((code, index) => {
        paddedArray[index] = code;
    });

    return paddedArray;
};

// Валидация данных перед обучением
const validateTrainingData = () => {
    return trainingData.filter((data) => {
        if (typeof data.input !== 'string' || typeof data.output !== 'string') {
            console.error(`Пропуск некорректной записи: ${JSON.stringify(data)}`);
            return false;
        }
        return true;
    });
};

// Подготовка данных для TensorFlow.js
const prepareData = () => {
    const validData = validateTrainingData();
    if (validData.length === 0) {
        console.error('Недостаточно данных для обучения.');
        return { inputTensor: null, outputTensor: null };
    }

    const inputs = validData.map((d) => prepareInput(d.input));
    const outputs = validData.map((d) => prepareInput(d.output));

    const inputTensor = tf.tensor2d(inputs, [inputs.length, 50]);
    const outputTensor = tf.tensor2d(outputs, [outputs.length, 50]);

    return { inputTensor, outputTensor };
};

// Обучение модели
const trainModel = async () => {
    model = tf.sequential();

    model.add(tf.layers.dense({ inputShape: [50], units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 50, activation: 'softmax' }));

    model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

    const { inputTensor, outputTensor } = prepareData();

    if (inputTensor && outputTensor) {
        await model.fit(inputTensor, outputTensor, { epochs: 50 });
        console.log('Модель обучена.');
    } else {
        console.log('Модель не обучена из-за отсутствия данных.');
    }
};

// Генерация ответа с использованием модели
const generateResponse = async (input) => {
    if (!model) return 'Я пока не знаю, как ответить. Но я учусь!';
    try {
        const inputTensor = tf.tensor2d([prepareInput(input)]);
        const prediction = model.predict(inputTensor);
        const output = Array.from((await prediction.data())).map((value) => Math.round(value));
        return `\`\`\`console\n${String.fromCharCode(...output).replace(/\0/g, '').trim()} (Модель: ${botModelName})\n\`\`\``;
    } catch (error) {
        console.error('Ошибка генерации ответа:', error);
        return 'Извините, произошла ошибка при генерации ответа.';
    }
};

// Сохранение сообщения в данных для обучения
const saveMessage = (input, output) => {
    const newTrainingData = { input, output };
    trainingData.push(newTrainingData);

    fs.writeFileSync('trainingData.json', JSON.stringify(trainingData, null, 2));
    console.log('Новое сообщение добавлено в обучение.');
};

// Поиск наиболее похожего запроса
const findSimilarResponse = (input) => {
    if (trainingData.length === 0) return null;

    const similarity = (a, b) => {
        const length = Math.min(a.length, b.length);
        let match = 0;
        for (let i = 0; i < length; i++) {
            if (a[i] === b[i]) match++;
        }
        return match / length;
    };

    let bestMatch = { similarity: 0, response: null };
    for (const data of trainingData) {
        const sim = similarity(input, data.input);
        if (sim > bestMatch.similarity) {
            bestMatch = { similarity: sim, response: data.output };
        }
    }

    return bestMatch.similarity > 0.7 ? bestMatch.response : null;
};

// Обработчик события при новом сообщении
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Проверка, находится ли сообщение в одном из разрешённых каналов
    if (!botConfig.allowedChannelIds.includes(message.channel.id)) {
        return;
    }

    const userMessage = message.content.toLowerCase();

    // Команда для получения информации о модели
    if (userMessage === '!модель') {
        message.reply(`\`\`\`console\nЯ бот на основе модели ${botModelName}. Могу помочь с обучением и генерацией ответов!\n\`\`\``);
        return;
    }

    const similarResponse = findSimilarResponse(userMessage);

    if (similarResponse) {
        message.reply(`\`\`\`console\n${similarResponse}\n\`\`\``);
        return;
    }

    const botReply = await generateResponse(userMessage);
    message.reply(botReply);

    saveMessage(userMessage, botReply);
});

// Запуск клиента
client.once('ready', async () => {
    console.log(`Бот запущен как ${client.user.tag}`);
    await trainModel();
});

client.login(botConfig.token);
