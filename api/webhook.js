// /api/webhook.js  —— 由 Vercel 以 Serverless Function 方式执行
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

// 收到文字就翻译成中文（示例逻辑）
bot.on('text', async ctx => {
  const text = ctx.message.text;
  const res  = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + encodeURIComponent(text));
  const data = await res.json();
  const zh   = data[0].map(r => r[0]).join('');
  if (zh !== text) await ctx.reply(zh);
});

// -------- Vercel 入口 --------
export default async function handler(req, res) {
  // Telegram 只会发 POST
  if (req.method !== 'POST') return res.status(200).send('OK');
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    res.status(500).send('bot error');
  }
}

// 关闭 Telegraf 的长轮询——Webhook 环境不需要 launch()
