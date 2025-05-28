const puppeteer = require('puppeteer');
const { setTimeout } = require('node:timers/promises');
const fetch = require('node-fetch'); // Node.js v18未満なら必要

// ====== 設定 ======
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1377135324005666846/dFli8T1c_Mq7ifwlYh-No8rX0YnKHYrs-GzfbTkQs49okODNBos_DHDI5KoKO2ClhZb2'; // 自分のWebhook URLに置き換える
const MIN_RES_COUNT = 10; // 最低レス数
const BOT_NAME = 'エッヂ速報Bot';
const BOT_ICON_URL = 'https://i.imgur.com/YOUR_ICON.png'; // 任意のアイコンURL

// ====== メイン処理 ======
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    // エッヂ掲示板トップへアクセス
    await page.goto('https://bbs.eddibb.cc/liveedge/', { waitUntil: 'networkidle2', timeout: 60000 });
    await setTimeout(1000);

    const buttons = await page.$$('div.block > button');
    if (buttons.length === 0) {
      console.log('⚠️ スレッドが見つかりませんでした');
      return;
    }

    const button = buttons[0];
    await button.click();

    await page.waitForSelector('h1', { timeout: 10000 }); // スレッドタイトル表示待ち
    await setTimeout(1000); // 読み込み余裕

    const url = page.url();

    const spans = await page.$$eval('h1 span', spans => spans.map(span => span.innerText));
    const resCountTextRaw = spans.find(t => /^\s*\(\d+\)/.test(t)) || '(0)';
    const totalResCount = parseInt(resCountTextRaw.replace(/[^\d]/g, ''), 10) || 0;
    const timestamp = spans.find(t => /\d{4}\/\d{2}\/\d{2}/.test(t)) || '時刻不明';

    const spanTexts = await button.$$eval('div > span', spans =>
      spans.map(span => span.innerText.trim())
    );
    const threadTitle = spanTexts[0] || 'No title';

    console.log('🧪 span中身:', spanTexts);

    const resCountMatch = spanTexts.find(text => /\(\d+\)/.test(text));
    const visibleResCount = resCountMatch
      ? parseInt(resCountMatch.replace(/[^\d]/g, ''), 10)
      : 0;

    if (isNaN(visibleResCount) || visibleResCount < MIN_RES_COUNT) {
      console.log(`🛑 スキップ: レス数 ${visibleResCount} 件未満 (${threadTitle})`);
      return;
    }

    // 本文の取得
    const posts = await page.$$eval('div.border-b.border-gray-300.p-4', divs =>
      divs.map(div => {
        const info = div.querySelector('div.text-sm.text-gray-500')?.innerText.trim() || '';
        const content = div.querySelector('div.text-gray-800.mt-2')?.innerText.trim() || '';
        return { info, content };
      }).filter(post => post.content)
    );

    if (posts.length === 0) {
      console.log(`⚠️ 本文が取得できませんでした: ${threadTitle}`);
      return;
    }

    // Discordに送信するembed生成
    const embed = {
      title: threadTitle,
      url,
      description: posts.slice(0, 3).map(post => `**${post.info}**\n${post.content}`).join('\n\n'),
      color: 0x5865F2,
      footer: {
        text: `💬 ${totalResCount} ｜ 🕒 ${timestamp}`,
      },
    };

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
        username: BOT_NAME,
        avatar_url: BOT_ICON_URL,
      }),
    });

    if (response.ok) {
      console.log(`✅ Discordへ送信成功: ${threadTitle}`);
    } else {
      console.error(`❌ Discord送信失敗: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error('❌ 処理中にエラー:', err);
  } finally {
    await browser.close();
  }
})();