# Windows EXE 打包说明

## 已完成的桌面版目标

这个项目现在可以打包成 Windows 桌面软件。用户双击 exe 后会直接打开桌面窗口，不需要手动启动 `node server.js`，也不需要手动打开 `http://localhost:4173`。

桌面版仍然坚持原来的边界：

- 不自动买入；
- 不自动卖出；
- 不登录券商账户；
- 只做数据同步、候选 ETF 评分、提醒、信号记录和复盘验证；
- 交易动作仍由用户手动执行。

## 最终产物

当前已经生成：

```text
dist/小老板理财-0.1.0-portable.exe
```

这个文件是 portable 单文件版本，可以复制给别人试用。

## 构建命令

在项目目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-windows-exe.ps1
```

脚本会自动完成：

1. 检查 Node.js 和 npm；
2. 安装 Electron/Electron Builder 依赖；
3. 下载便携 Python 运行时；
4. 打包桌面窗口、后台服务、前端页面、Python 脚本；
5. 输出 Windows portable exe。

## 数据保存位置

桌面版不会把你的真实持仓数据打包进 exe。每个使用者第一次打开时，会在自己的 Windows 用户目录下生成独立数据：

```text
%APPDATA%\investment-console\data\state.json
```

所以把 exe 发给别人时，对方看到的是空白初始状态，需要自己填写邮箱、资金、持仓和设置。

## 验证结果

本次已经完成这些检查：

- `node --check server.js` 通过；
- `node --check desktop/main.js` 通过；
- Python 脚本语法检查通过；
- `scripts/verify_step9_10_gate.py` 通过；
- `scripts/verify_runtime_console.py` 通过；
- 便携 Python 调用后台脚本通过；
- `dist/win-unpacked/小老板理财.exe` 启动后 `/api/health` 返回 `ok: true`；
- `dist/小老板理财-0.1.0-portable.exe` 启动后 `/api/health` 返回 `ok: true`。

## 分发注意

这个 exe 没有购买代码签名证书，所以别人第一次打开时，Windows Defender SmartScreen 可能提示“未知发布者”。这是未签名软件的正常现象，不代表软件一定有病毒。

如果要给更多人使用，后续应该补：

- 应用图标；
- 版本更新说明；
- 首次启动引导；
- 导入/导出个人数据；
- 代码签名证书；
- 更明确的风险提示和免责声明。
