// /api/webhook.js —— DeepSeek 判重要 + 英文译中文（改良版差异判断）
// -------------------------------------------------------------------

import { Telegraf } from 'telegraf';
import OpenAI       from 'openai';

/* ===== DeepSeek 客户端 ===== */
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey:  process.env.DEEPSEEK_KEY          // 在 Vercel Env Vars 填 DEEPSEEK_KEY
});

/* 判断消息是否重要：true / false */
async function isImportant(text) {
  const resp = await deepseek.chat.completions.create({
    model: 'deepseek-reasoner',
    messages: [
      { role: 'system', content: '你是消息分类器，只回答 1(重要) 或 0(不重要)。' },
      { role: 'user',   content: text }
    ],
    max_tokens: 1,
    temperature: 0
  });
  return resp.choices[0].message.content.trim() === '1';
}

/* ===== Telegram Bot ===== */
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on('text', async ctx => {
  const text = ctx.message.text;

  // 跳过自己发的消息，避免死循环
  if (ctx.from.id === ctx.botInfo.id) return;

  // 先判定重要性（如调用失败就按不重要处理）
  let important = false;
  try {
    important = await isImportant(text);
  } catch (err) {
    console.error('DeepSeek error:', err);
  }

  // 若消息含英文字符则尝试翻译
  if (/[A-Za-z]/.test(text)) {
    try {
      const url = 'https://translate.googleapis.com/translate_a/single' +
                  '?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' +
                  encodeURIComponent(text);
      const res  = await fetch(url);
      const data = await res.json();
      const zh   = data[0].map(r => r[0]).join('');

      if (zh) {
        // -------- 最小修改：只要译文的中文字符数增加就发送 --------
        const origCn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const newCn  = (zh.match(/[\u4e00-\u9fa5]/g)   || []).length;
        if (newCn > origCn) {
          if (important) await ctx.reply('⚠️ 重要信息（已翻译如下）');
          await ctx.reply(zh);
        }
      }
    } catch (err) {
      console.error('Translate error:', err);
    }
  } else if (important) {
    // 原文无英文但被判为重要 → 直接提示原文
    await ctx.reply(`⚠️ 重要信息：\n${text}`);
  }
});

/* ===== Vercel Webhook 入口 ===== */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');  // 健康检查
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('ok');
  } catch (err) {
    console.error(err);
    res.status(500).send('bot error');
  }
}

// ⚠️ 不要调用 bot.launch() —— Webhook 环境无需长轮询
