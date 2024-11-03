const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const repoUrl = 'https://api.github.com/repos/Habiboullah0/PDF/contents/';

// دالة لجلب الملفات والمجلدات من مسار معين في المستودع
async function getRepoContents(path = '') {
    try {
        const url = `${repoUrl}${path}`;
        const headers = {
            Authorization: `token ${process.env.GITHUB_TOKEN}`
        };
        const { data } = await axios.get(url, { headers });
        return data.filter(item => item.name !== 'index.html');  // استثناء index.html من جميع المستويات
    } catch (error) {
        console.log('Error fetching contents:', error.response ? error.response.data : error.message);
        throw error;
    }
}

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const contents = await getRepoContents();
        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: contents.map(item => [
                    {
                        text: `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`,
                        callback_data: JSON.stringify({ path: item.path, type: item.type })
                    }
                ])
            }
        };
        bot.sendMessage(chatId, '*📂 المجلد الرئيسي*\nاختر مجلدًا أو ملفًا لاستعراضه:', options);
    } catch (error) {
        bot.sendMessage(chatId, 'حدث خطأ أثناء عرض المحتويات.');
    }
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = JSON.parse(callbackQuery.data);

    try {
        if (data.type === 'dir') {
            const contents = await getRepoContents(data.path);

            const options = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        ...contents.map(item => [
                            {
                                text: `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`,
                                callback_data: JSON.stringify({ path: item.path, type: item.type })
                            }
                        ]),
                        ...(data.path ? [[{ text: '⬅️ رجوع', callback_data: JSON.stringify({ path: data.path.split('/').slice(0, -1).join('/'), type: 'dir' }) }]] : [])
                    ]
                }
            };

            await bot.editMessageText(`*📂 المجلد:* \`${data.path || 'الرئيسي'}\`\n\nاختر مجلدًا أو ملفًا لاستعراضه:`, { chat_id: chatId, message_id: messageId, reply_markup: options.reply_markup, parse_mode: 'Markdown' });
        } else if (data.type === 'file') {
            const fileUrl = `https://raw.githubusercontent.com/Habiboullah0/PDF/main/${data.path}`;
            console.log('Sending file...');

            try {
                const fileBuffer = await axios.get(fileUrl, { responseType: 'arraybuffer' });
                await bot.sendDocument(chatId, fileBuffer.data, {}, { filename: data.path.split('/').pop() });
                await bot.deleteMessage(chatId, messageId);
            } catch (error) {
                console.log('Error sending file:', error.message);
                bot.sendMessage(chatId, 'تعذر تحميل الملف.');
                bot.deleteMessage(chatId, messageId);
            }
        }
    } catch (error) {
        bot.sendMessage(chatId, 'حدث خطأ أثناء معالجة الطلب.');
        bot.deleteMessage(chatId, messageId);
    }
});

console.log("Bot is running...");