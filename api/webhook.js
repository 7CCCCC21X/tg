import { Telegraf } from 'telegraf';
import OpenAI       from 'openai';

/* ===== DeepSeek 客户端：判定重要 ===== */
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey:  process.env.DEEPSEEK_KEY
});
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
    return false;
  }
}

/* ===== 把一段英文翻成中文 ===== */
async function translateEn2Zh(enText) {
  const url = 'https://translate.googleapis.com/translate_a/single' +
              '?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(enText);
  const res  = await fetch(url);
  const data = await res.json();
  return data[0].map(r => r[0]).join('');
}

/* ===== Telegram Bot ===== */
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (ctx.from.id === ctx.botInfo.id) return;              // 过滤自己

  // ① 判定重要性（失败就按不重要）
  const important = await isImportant(text);

  // ② 若整句不含英文，只有“重要”时才提示
  if (!/[A-Za-z]/.test(text)) {
    if (important) await ctx.reply(`⚠️ 重要信息：\n${text}`);
    return;
  }

  /* ③ 提取所有英文片段并逐段翻译 */
  const enRegex = /[A-Za-z0-9#@\$%\^&\*\-_\+=\[\]\(\)\.,"'\/\\:;?!\s]{4,}/g; // 长度≥4 的连续英文
  const pieces  = text.match(enRegex);
  if (!pieces) return;                                     // 理论不会发生

  let translated = text;
  for (const en of pieces) {
    try {
      const zh = await translateEn2Zh(en);
      // 若 Google 真的给了中文，就替换；否则保持英文
      if (zh && zh !== en) {
        translated = translated.replace(en, zh);
      }
    } catch (e) {
      console.error('translate piece failed', e);
    }
  }

  // ④ 只要译文和原文有区别就发送
  if (translated !== text) {
    if (important) await ctx.reply('⚠️ 重要信息（已翻译如下）');
    await ctx.reply(translated);
  }
});

/* ===== Vercel Webhook 入口 ===== */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    res.status(500).send('bot error');
  }
}
