const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const botConfig = require('./botconfig.json'); // Конфиг с токеном, моделью и другими настройками

// Создаем клиента Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Для доступа к тексту сообщений
    ]
});

// Генерация ответа с использованием Hugging Face API
const generateResponse = async (input) => {
    try {
        const response = await axios.post(
            `https://api-inference.huggingface.co/models/${botConfig.model}`, // Модель из конфига
            {
                inputs: input,
                parameters: {
                    temperature: 0.7,  // Меньше - более логичные ответы
                    max_length: 100,   // Ограничение на длину ответа
                    top_p: 0.9,        // 0.9 даёт модель более предсказуемой, но креативной
                    top_k: 50,         // Ограничение на количество вероятных слов
                    repetition_penalty: 1.2 // Штраф за повторяющиеся фразы
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${botConfig.huggingFaceApiKey}`, // Токен Hugging Face
                },
            }
        );

        if (response.data.error) {
            console.error('Ошибка Hugging Face API:', response.data.error);
            return 'Извините, я пока не могу ответить. Моя модель временно недоступна.';
        }

        const generatedText = response.data[0]?.generated_text?.trim();
        return generatedText || 'Я не смог сгенерировать ответ.';
    } catch (error) {
        console.error('Ошибка при запросе к Hugging Face API:', error.response?.data || error.message);
        return 'Произошла ошибка при обращении к модели. Попробуйте позже.';
    }
};

// Регистрация слэш-команд
client.on('ready', async () => {
    console.log(`Бот запущен как ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('model')
            .setDescription('Информация о текущей модели бота'),
        new SlashCommandBuilder()
            .setName('answer')
            .setDescription('Получить ответ на вопрос, используя модель')
            .addStringOption(option => 
                option.setName('question')
                    .setDescription('Ваш вопрос')
                    .setRequired(true)),
    ];

    try {
        // Регистрация команд в Discord
        await client.application.commands.set(commands);
    } catch (error) {
        console.error('Ошибка при регистрации команд:', error);
    }
});

// Обработчик слэш-команд
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        if (commandName === 'model') {
            await interaction.deferReply(); // Отложенный ответ
            await interaction.editReply(`Текущая модель бота: ${botConfig.model}`);
        } else if (commandName === 'answer') {
            const question = options.getString('question');
            await interaction.deferReply(); // Отложенный ответ
            const response = await generateResponse(question);
            await interaction.editReply(response); // Отвечаем после выполнения операции
        }
    } catch (error) {
        console.error('Ошибка при обработке взаимодействия:', error);
        await interaction.reply('Произошла ошибка. Попробуйте снова позже.');
    }
});

// Запуск клиента
client.login(botConfig.token);
