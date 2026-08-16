# 小老板理财（Xiaolaoban Finance Agent）

一个本地优先、证据可追溯的个人投资研究 Agent。它把行情、基金净值、新闻事件、持仓穿透和个人交易记录组织成可核验的研究结论，并提供网页版和 Windows 桌面版。

> 本项目用于研究、记录和软件工程演示，不构成投资建议，也不会自动连接券商或代替用户下单。

## 主要能力

- **投研 Agent**：将问题拆成数据获取、证据核验、风险分析和结论生成步骤；没有 API Key 时可运行本地演示模式。
- **专业行情图**：K 线、成交量、均线、缩放和十字光标。
- **个人基金曲线**：保存导入的基金及交易记录，按净值历史更新曲线和盈亏。
- **持仓穿透**：展示基金披露的重仓股及占比，并明确披露日期，避免把滞后数据当实时仓位。
- **图片识别导入**：使用 Tesseract.js 在本机识别基金持仓截图，识别结果需由用户确认后保存。
- **来源与时效记录**：保留数据来源、更新时间、失败原因和降级状态。
- **模拟投资实验**：按固定预算记录模拟订单、持仓、收益和复盘，不执行真实交易。

## 快速开始

要求：Node.js 20 或更高版本。

```bash
npm install
npm start
```

浏览器打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。程序第一次运行会在 `data/state.json` 创建一份空白本地状态。

## 可选：启用模型 API

复制 `.env.example` 的配置到本机环境变量并填写自己的密钥：

```text
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5.6-terra
OPENAI_BASE_URL=https://api.openai.com/v1
```

密钥只从环境变量读取，不应写入源码、截图或 `state.json`。不配置密钥时，研究工作台仍可使用确定性规则和本地工具进行演示。

## Windows 桌面版

开发模式：

```bash
npm run desktop
```

构建便携版 EXE：

```powershell
npm run dist:win
```

构建脚本会准备随包运行的 Python 环境，产物位于 `dist/`。桌面版把每位用户的数据保存在其 Windows 应用数据目录，不会把维护者的持仓打包进安装文件。详见 [Windows EXE打包说明.md](Windows%20EXE打包说明.md)。

## 测试

```bash
npm run test:agent
```

测试覆盖 Agent 编排、外部研究降级、错误处理、行情和基金曲线、自动同步、持仓导入、穿透分析及图片 OCR。

## 数据与可靠性边界

- 场内证券通常只在交易日产生新 K 线；周末和法定休市日沿用最近交易日数据。
- 场外基金使用每日净值曲线，不应把它解释为分时 K 线。
- 基金持仓来自定期报告或公开披露，天然存在滞后；界面应同时显示报告期和抓取时间。
- 外部站点不可访问时，系统会保留旧数据并显示失败状态，不会伪造新数据。
- OCR 只是录入辅助，金额、代码和基金名称必须由用户确认。

## 隐私与安全

默认状态为空，不包含作者或其他用户的邮箱、持仓、交易历史、API Key。具体说明见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 项目结构

```text
desktop/   Electron 桌面入口
lib/       Agent、研究、图表、导入与持仓穿透模块
public/    Web 界面
scripts/   数据同步、验证、复盘与打包脚本
tests/     Node.js 测试
config/    数据来源和规则配置
data/      本地运行状态（默认不提交）
```

## 开源协议

项目代码采用 [MIT License](LICENSE)。第三方依赖及其协议见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
