const { createWorker, OEM, PSM } = require("tesseract.js");
const chineseData = require("@tesseract.js-data/chi_sim");
const { inferFundType } = require("./portfolio-import");

let activeRecognition = null;

function normalizeLine(value) {
  return String(value || "").replace(/[｜丨]/g, "|").replace(/\s+/g, " ").trim();
}

function looksLikeFundName(line) {
  const text = normalizeLine(line).replace(/\s+/g, "");
  if (text.length < 5 || text.length > 42) return false;
  if (/全部持有|收益明细|交易记录|名称.?金额|日收益|持有收益|累计收益|持有收益排序|以上按照|^(基金|券商理财).*(理财|定投|收益)/.test(text)) return false;
  return /(ETF|联接|QDII|基金|债券|混合|指数|滚动持有|数字经济|纳斯达克|标普|纯债|短债|黄金)/i.test(text) && /[\u4e00-\u9fff]{3}/.test(text);
}

function cleanFundName(line) {
  return normalizeLine(line).replace(/\s+/g, "")
    .replace(/^[^\u4e00-\u9fffA-Za-z0-9]+/, "")
    .replace(/\s+(基金|稳健理财|进阶理财|定投|金选).*$/i, "")
    .replace(/[|]+.*$/, "")
    .trim();
}

function numericTokens(text) {
  return [...String(text || "").matchAll(/([+-]?\d{1,8}(?:\.\d{1,6})?)(%?)/g)].map((match) => ({
    raw: match[1],
    value: Number(match[1]),
    signed: /^[+-]/.test(match[1]),
    percent: match[2] === "%"
  })).filter((item) => Number.isFinite(item.value));
}

function parseRecognizedPortfolio(rawText, overallConfidence = 0) {
  const lines = String(rawText || "").split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const candidates = [];
  lines.forEach((line, index) => { if (looksLikeFundName(line)) candidates.push({ index, name: cleanFundName(line) }); });
  const items = candidates.map((candidate, candidateIndex) => {
    const end = candidates[candidateIndex + 1]?.index ?? Math.min(lines.length, candidate.index + 8);
    const block = lines.slice(candidate.index + 1, end).join(" ");
    const tokens = numericTokens(block);
    const values = tokens.filter((item) => !item.percent);
    const amountToken = values.find((item) => !item.signed && item.value > 0 && /\.\d{2}$/.test(item.raw))
      || values.find((item) => !item.signed && item.value > 0);
    const signed = values.filter((item) => item.signed);
    const pnlToken = signed.length >= 2 ? signed[1] : signed.at(-1);
    return {
      code: "",
      name: candidate.name,
      type: inferFundType(candidate.name),
      marketValue: amountToken ? amountToken.value : null,
      pnl: pnlToken ? pnlToken.value : null,
      confidence: Math.round(overallConfidence),
      importSource: "本地图片OCR识别",
      needsReview: !amountToken || !pnlToken
    };
  }).filter((item, index, array) => item.name && array.findIndex((other) => other.name === item.name) === index);
  return {
    items,
    warnings: [
      ...(items.length ? [] : ["没有识别到基金名称，请尝试使用更清晰、未经压缩的截图。"]),
      ...items.filter((item) => item.needsReview).map((item) => `${item.name} 的金额或收益没有完整识别，请手动补充。`),
      "支付宝持仓截图通常不显示基金代码，代码需要用户核对或补充后才能导入。"
    ]
  };
}

async function recognizeOnce(imageBuffer, onProgress = () => {}) {
  const worker = await createWorker("chi_sim", OEM.LSTM_ONLY, {
    langPath: chineseData.langPath,
    gzip: chineseData.gzip,
    cacheMethod: "none",
    logger(message) {
      if (message.status === "recognizing text") onProgress(Math.round(Number(message.progress || 0) * 100));
    }
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const result = await worker.recognize(imageBuffer);
    const parsed = parseRecognizedPortfolio(result.data.text, result.data.confidence);
    return { ok: true, text: result.data.text, confidence: Math.round(result.data.confidence || 0), ...parsed };
  } finally {
    await worker.terminate();
  }
}

function recognizePortfolioImage(imageBuffer, onProgress) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 100) throw new Error("图片内容为空或格式无效。");
  if (imageBuffer.length > 9_000_000) throw new Error("图片不能超过 9MB。");
  if (activeRecognition) throw new Error("已有图片正在识别，请等待完成后再试。");
  activeRecognition = recognizeOnce(imageBuffer, onProgress).finally(() => { activeRecognition = null; });
  return activeRecognition;
}

module.exports = { recognizePortfolioImage, parseRecognizedPortfolio, looksLikeFundName };
