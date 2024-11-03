const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();
const PORT = process.env.PORT || 3000; // تعيين 3000 كمنفذ افتراضي

const express = require('express');
const app = express();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const repoUrl = 'https://api.github.com/repos/Habiboullah0/PDF/contents/';
const adminUserId = '2124127983'; // معرف المستخدم الذي يمكنه إضافة البوت هنا
const groupInviteLink = 'https://t.me/MrSujets'; // رابط المجموعة هنا
const allowedGroupId = '-1002335584015'; // معرف المجموعة المسموح بها هنا

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

    // تحقق مما إذا كان المستخدم في المجموعة المسموح بها
    if (chatId.toString() !== allowedGroupId) {
        return bot.sendMessage(chatId, 'يرجى الانضمام إلى المجموعة للحصول على الملفات.\nرابط المجموعة: ' + groupInviteLink);
    }

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

    // تحقق مما إذا كان المستخدم في المجموعة المسموح بها
    if (chatId.toString() !== allowedGroupId) {
        return bot.sendMessage(chatId, 'يرجى الانضمام إلى المجموعة للحصول على الملفات.\nرابط المجموعة: ' + groupInviteLink);
    }

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

// الاستجابة لرسائل المستخدمين
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    // إذا كانت الرسالة من مستخدم وليس من مجموعة
    if (msg.chat.type === 'private') {
        bot.sendMessage(chatId, 'يرجى الانضمام إلى المجموعة للحصول على الملفات.\nرابط المجموعة: ' + groupInviteLink);
    }
});

console.log("Bot is running...");