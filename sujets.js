const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();
const PORT = process.env.PORT || 3000;

const express = require('express');
const crypto = require('crypto');
const app = express();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const repoUrl = 'https://api.github.com/repos/Habiboullah0/PDF/contents/';
const adminUserId = '2124127983'; // معرف المستخدم الذي يمكنه إضافة البوت هنا
const groupInviteLink = 'https://t.me/MrSujets'; // رابط المجموعة هنا
const allowedGroupId = '-1002335584015'; // معرف المجموعة المسموح بها هنا

// خريطة لتخزين المسارات بناءً على hash
const pathMap = new Map();

// دالة لتوليد hash فريد لمسار الملف أو المجلد
function generateHash(path) {
    const hash = crypto.createHash('md5').update(path).digest('hex');
    pathMap.set(hash, path);
    return hash;
}

// دالة لفك ترميز callback_data باستخدام hash
function getPathFromHash(hash) {
    return pathMap.get(hash);
}

// دالة لجلب الملفات والمجلدات من مسار معين في المستودع
async function getRepoContents(path = '') {
    try {
        const url = `${repoUrl}${encodeURIComponent(path)}`;
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

// التحقق من إذا كانت الرسالة من المجموعة المسموح بها فقط
function isAllowedGroup(chatId) {
    return chatId.toString() === allowedGroupId;
}

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // تجاهل الأوامر في المحادثات الخاصة
    if (msg.chat.type === 'private') {
        return bot.sendMessage(chatId, 'يرجى الانضمام إلى المجموعة للحصول على الملفات.\nرابط المجموعة: ' + groupInviteLink);
    }

    // تحقق مما إذا كانت الرسالة في المجموعة المسموح بها فقط
    if (!isAllowedGroup(chatId)) return;

    try {
        const contents = await getRepoContents();
        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: contents.map(item => [
                    {
                        text: `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`,
                        callback_data: generateHash(JSON.stringify({ path: item.path, type: item.type }))
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

    let data;
    try {
        const hash = callbackQuery.data;
        data = JSON.parse(getPathFromHash(hash));

        console.log('Decoded callback data:', data);
    } catch (error) {
        bot.sendMessage(chatId, 'حدث خطأ في معالجة البيانات.');
        return;
    }

    // تجاهل الاستجابات من المحادثات الخاصة
    if (callbackQuery.message.chat.type === 'private') {
        return bot.sendMessage(chatId, 'يرجى الانضمام إلى المجموعة للحصول على الملفات.\nرابط المجموعة: ' + groupInviteLink);
    }

    // تحقق مما إذا كانت الرسالة في المجموعة المسموح بها فقط
    if (!isAllowedGroup(chatId)) return;

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
                                callback_data: generateHash(JSON.stringify({ path: item.path, type: item.type }))
                            }
                        ]),
                        ...(data.path ? [[{ text: '⬅️ رجوع', callback_data: generateHash(JSON.stringify({ path: data.path.split('/').slice(0, -1).join('/'), type: 'dir' })) }]] : [])
                    ]
                }
            };

            await bot.editMessageText(`*📂 المجلد:* \`${data.path || 'الرئيسي'}\`\n\nاختر مجلدًا أو ملفًا لاستعراضه:`, { chat_id: chatId, message_id: messageId, reply_markup: options.reply_markup, parse_mode: 'Markdown' });
        } else if (data.type === 'file') {
            const fileUrl = `https://raw.githubusercontent.com/Habiboullah0/PDF/main/${encodeURIComponent(data.path)}`;
            const fileName = decodeURIComponent(data.path.split('/').pop());
            console.log('Sending file...');

            try {
                const fileBuffer = await axios.get(fileUrl, { responseType: 'arraybuffer' });
                await bot.sendDocument(chatId, Buffer.from(fileBuffer.data), {}, {
                    filename: fileName,
                    contentType: 'application/octet-stream'
                });
                await bot.deleteMessage(chatId, messageId);
            } catch (error) {
                console.log('Error sending file:', error.message);
                bot.sendMessage(chatId, 'تعذر تحميل الملف.');
                bot.deleteMessage(chatId, messageId);
            }
        }
    } catch (error) {
        console.log('Error during request processing:', error.message);
        bot.sendMessage(chatId, 'حدث خطأ أثناء معالجة الطلب.');
        bot.deleteMessage(chatId, messageId);
    }
});

console.log("Bot is running...");