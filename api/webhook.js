// /api/webhook.js  —  提取正文 + DeepSeek 重要性判定 + 英文翻译
//---------------------------------------------------------------

import { Telegraf } from 'telegraf';
import OpenAI       from 'openai';

/* ===== DeepSeek 客户端 ===== */
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey:  process.env.DEEPSEEK_KEY          // 置于 Vercel 环境变量
});

/* DeepSeek 判定重要 */
async function isImportant(text) {
  try {
    const r = await deepseek.chat.completions.create({
      model: 'deepseek-reasoner',
      messages: [
        { role: 'system', content: '你是消息分类器，只回答 1(重要) 或 0(不重要)。' },
        { role: 'user',   content: text }
      ],
      max_tokens: 1,
      temperature: 0
    });
    return r.choices[0].message.content.trim() === '1';
  } catch (e) {
    console.error('DeepSeek error', e);
    return false;                             // 调用失败时默认“不重要”
  }
}

/* 英文片段翻译 */
async function translateEn2Zh(en) {
  const url = 'https://translate.googleapis.com/translate_a/single' +
              '?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(en);
  const res  = await fetch(url);
  const data = await res.json();
  return data[0].map(r => r[0]).join('');
}

/* ===== Telegram Bot ===== */
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on('text', async ctx => {
  const raw = ctx.message.text;

  /* 0. 跳过自己 */
  if (ctx.from.id === ctx.botInfo.id) return;

  /* 1. 抽取正文：首个空行后的块，直到再次空行/关键字 */
  const bodyMatch = raw.match(/\n\s*\n([\s\S]+?)(?:\n\s*\n|点击查看|时间|🎉|$)/);
  const body = bodyMatch ? bodyMatch[1].trim() : '';

  if (!body) return;                          // 未抓到正文就忽略

  /* 2. 判定重要性 */
  const important = await isImportant(body);
  const prefix    = important ? '⚠️ 重要信息' : 'ℹ️ 信息';

  /* 3. 翻译正文中英文片段（长度≥4 的连续英文/符号） */
  let reply = body;
  const enRegex = /[A-Za-z0-9#@\$%\^&\*\-_\+=\[\]\(\)\.,"'\/\\:;?!\s]{4,}/g;
  const pieces  = body.match(enRegex);

  if (pieces) {
    for (const en of pieces) {
      if (!/[A-Za-z]/.test(en)) continue;     // 纯符号/空白跳过
      try {
        const zh = await translateEn2Zh(en);
        if (zh && zh !== en) {
          reply = reply.replace(en, zh);
        }
      } catch (e) {
        console.error('Translate piece failed', e);
      }
    }
  }

  /* 4. 发送提醒 + 结果（即使译文与原文相同也发送） */
  await ctx.reply(`${prefix}：\n${reply}`);
});

/* ===== Vercel Webhook 入口 ===== */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK'); // 健康检查
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    res.status(500).send('bot error');
  }
}

// ⚠️ 无需 bot.launch() —— Webhook 场景下禁止使用长轮询
