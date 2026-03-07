import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type CardType = 'quiz' | 'tips' | 'summary';

export interface QuizData {
  cardType: 'quiz';
  badge: string;
  question: string;
  choices: string[];
  tags: string;
  hint: string;
}

export interface TipsData {
  cardType: 'tips';
  badge: string;
  title: string;
  boxes: { title: string; items: string[] }[];
  memo: string;
  tags: string;
}

export interface SummaryData {
  cardType: 'summary';
  badge: string;
  title: string;
  items: { text: string; strong: string }[];
  tags: string;
  hint: string;
}

export type CardData = QuizData | TipsData | SummaryData;

function buildQuizHtml(d: QuizData): string {
  const choices = d.choices
    .map((c, i) => {
      const label = String.fromCharCode(65 + i);
      return `<div class="choice"><span>${label}</span>${c}</div>`;
    })
    .join('');

  return `
    <div class="card-quiz">
      <div class="badge">${d.badge}</div>
      <div class="question">${d.question}</div>
      <div class="choices">${choices}</div>
      <div class="footer">
        <div class="tag">${d.tags}</div>
        <div class="hint">${d.hint}</div>
      </div>
    </div>`;
}

function buildTipsHtml(d: TipsData): string {
  const boxes = d.boxes
    .map(
      (b) => `
      <div class="box">
        <div class="box-title">${b.title}</div>
        <ul>${b.items.map((i) => `<li>${i}</li>`).join('')}</ul>
      </div>`
    )
    .join('');

  return `
    <div class="card-tips">
      <div class="badge">${d.badge}</div>
      <div class="title">${d.title}</div>
      <div class="compare">${boxes}</div>
      <div class="memo">${d.memo}</div>
      <div class="footer">
        <div class="tag">${d.tags}</div>
      </div>
    </div>`;
}

function buildSummaryHtml(d: SummaryData): string {
  const items = d.items
    .map(
      (item, i) => `
      <div class="item">
        <div class="num">${i + 1}</div>
        <div class="text"><strong>${item.strong}</strong>　${item.text}</div>
      </div>`
    )
    .join('');

  return `
    <div class="card-summary">
      <div class="badge">${d.badge}</div>
      <div class="title">${d.title}</div>
      <div class="items">${items}</div>
      <div class="footer">
        <div class="tag">${d.tags}</div>
        <div class="hint">${d.hint}</div>
      </div>
    </div>`;
}

function buildHtml(data: CardData): string {
  let cardHtml = '';
  if (data.cardType === 'quiz') cardHtml = buildQuizHtml(data);
  else if (data.cardType === 'tips') cardHtml = buildTipsHtml(data);
  else cardHtml = buildSummaryHtml(data);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #ffffff;
    font-family: 'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif;
    width: 600px;
  }
  .card-quiz, .card-tips, .card-summary {
    background: #ffffff;
    padding: 36px 40px 32px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .card-quiz  { border-top: 6px solid #0096c7; }
  .card-tips  { border-top: 6px solid #27ae60; }
  .card-summary { border-top: 6px solid #8e44ad; }

  .badge {
    display: inline-block;
    font-size: 12px;
    font-weight: bold;
    padding: 4px 12px;
    border-radius: 20px;
    width: fit-content;
    letter-spacing: 1px;
  }
  .card-quiz .badge   { background: #e0f4fb; color: #0096c7; }
  .card-tips .badge   { background: #e8f8f0; color: #27ae60; }
  .card-summary .badge { background: #f3e8fb; color: #8e44ad; }

  .question {
    color: #1a1a2e;
    font-size: 20px;
    font-weight: bold;
    line-height: 1.6;
    border-left: 4px solid #0096c7;
    padding-left: 16px;
  }
  .choices { display: flex; flex-direction: column; gap: 10px; }
  .choice {
    background: #f7fbff;
    border: 1px solid #c8e6f5;
    color: #333;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 15px;
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .choice span {
    background: #0096c7;
    color: white;
    width: 24px; height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .title {
    color: #1a1a2e;
    font-size: 21px;
    font-weight: bold;
    line-height: 1.5;
  }
  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .box {
    border-radius: 12px;
    padding: 16px;
  }
  .card-tips .box { background: #f7fdf9; border: 1px solid #b7e4c7; }
  .box-title {
    font-size: 13px;
    font-weight: bold;
    margin-bottom: 8px;
  }
  .card-tips .box-title { color: #27ae60; }
  .box ul { color: #444; font-size: 13px; line-height: 1.8; padding-left: 16px; }
  .memo {
    border-radius: 0 8px 8px 0;
    padding: 10px 16px;
    font-size: 13px;
    line-height: 1.6;
  }
  .card-tips .memo {
    background: #f0faf4;
    border-left: 3px solid #27ae60;
    color: #2d6a4f;
  }

  .items { display: flex; flex-direction: column; gap: 10px; }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    border-radius: 10px;
    padding: 12px 16px;
  }
  .card-summary .item { background: #faf5ff; border: 1px solid #d7b8f3; }
  .num {
    background: #8e44ad;
    color: white;
    width: 26px; height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: bold;
    flex-shrink: 0;
  }
  .text { color: #333; font-size: 14px; line-height: 1.6; }
  .text strong { color: #6c3483; }

  .footer {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #e8e8e8;
    padding-top: 14px;
    align-items: center;
  }
  .tag  { font-size: 13px; }
  .hint { color: #999; font-size: 12px; }
  .card-quiz .tag   { color: #0096c7; }
  .card-tips .tag   { color: #27ae60; }
  .card-summary .tag { color: #8e44ad; }
</style>
</head>
<body>${cardHtml}</body>
</html>`;
}

export async function generateImage(data: CardData, outputPath: string): Promise<string> {
  mkdirSync(dirname(outputPath), { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 400, deviceScaleFactor: 2 });
    await page.setContent(buildHtml(data), { waitUntil: 'networkidle0' });

    const body = await page.$('body');
    const box = await body!.boundingBox();
    await page.setViewport({
      width: 600,
      height: Math.ceil(box!.height),
      deviceScaleFactor: 2,
    });

    const screenshot = await page.screenshot({ type: 'png', fullPage: true });
    writeFileSync(outputPath, screenshot);
    return outputPath;
  } finally {
    await browser.close();
  }
}

// --- CLI standalone test ---
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const testData: QuizData = {
    cardType: 'quiz',
    badge: '📝 ITパスポート 頻出問題',
    question: 'RAIDの種類で「1台壊れても復元できるが\n容量が半分になる」のはどれ？',
    choices: ['RAID 0（ストライピング）', 'RAID 1（ミラーリング）', 'RAID 5（パリティ分散）', 'RAID 6（二重パリティ）'],
    tags: '#ITパスポート #IT勉強',
    hint: '正解はリプ欄 ↓',
  };

  const out = join(__dirname, '..', 'media', 'test-card.png');
  generateImage(testData, out).then(() => {
    console.log(`✅ 画像生成完了: ${out}`);
  });
}
