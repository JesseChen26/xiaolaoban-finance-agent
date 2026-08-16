const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");

let serverHandle = null;
let serverUrl = "";

function appRoot() {
  return app.getAppPath();
}

function dataRoot() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "data");
  }
  return path.join(appRoot(), "data");
}

function bundledPythonTool() {
  if (!app.isPackaged) {
    return "";
  }
  return path.join(process.resourcesPath, "python", "python.exe");
}

function seedStateIfEmpty(dataDir) {
  if (!app.isPackaged) return;
  const seedPath = path.join(process.resourcesPath, "seed", "state.json");
  const targetPath = path.join(dataDir, "state.json");
  if (!fs.existsSync(seedPath)) return;
  let current = null;
  let seed = null;
  try {
    current = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, "utf8")) : null;
    seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  } catch {
    return;
  }
  const currentHasPortfolio = Array.isArray(current?.portfolio) && current.portfolio.length > 0;
  const seedHasPortfolio = Array.isArray(seed?.portfolio) && seed.portfolio.length > 0;
  if (currentHasPortfolio) {
    const currentExposureCount = Object.keys(current?.fundExposure?.items || {}).length;
    const seedExposureCount = Object.keys(seed?.fundExposure?.items || {}).length;
    if (!currentExposureCount && seedExposureCount) {
      const backupPath = path.join(dataDir, "state.before-exposure-migration.json");
      if (!fs.existsSync(backupPath)) fs.copyFileSync(targetPath, backupPath);
      current.fundExposure = seed.fundExposure;
      current.fundExposureUpdates = seed.fundExposureUpdates || [];
      const temporaryPath = `${targetPath}.exposure-migration.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(current, null, 2), "utf8");
      fs.renameSync(temporaryPath, targetPath);
    }
    return;
  }
  if (!seedHasPortfolio) return;
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, path.join(dataDir, "state.before-portfolio-migration.json"));
  }
  fs.copyFileSync(seedPath, targetPath);
}

function applyRuntimeEnvironment() {
  const root = appRoot();
  const dataDir = dataRoot();
  fs.mkdirSync(dataDir, { recursive: true });
  seedStateIfEmpty(dataDir);

  process.env.APP_ROOT_OVERRIDE = root;
  process.env.DATA_DIR_OVERRIDE = dataDir;
  process.env.STATE_PATH_OVERRIDE = path.join(dataDir, "state.json");
  process.env.PORT = "0";

  const pythonTool = bundledPythonTool();
  if (pythonTool && fs.existsSync(pythonTool)) {
    process.env.INVESTMENT_PYTHON_EXE = pythonTool;
  }
}

function isLocalAppUrl(url) {
  try {
    const parsed = new URL(url);
    const current = new URL(serverUrl);
    return parsed.protocol === current.protocol && parsed.host === current.host;
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "小老板理财",
    backgroundColor: "#f6f7fb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalAppUrl(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isLocalAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(serverUrl);
}

async function boot() {
  app.setName("小老板理财");
  applyRuntimeEnvironment();

  const { startServer } = require("../server");
  serverHandle = await startServer({ port: 0, host: "127.0.0.1" });
  serverUrl = serverHandle.url;
  createWindow();
}

app.whenReady().then(() => {
  boot().catch((error) => {
    dialog.showErrorBox(
      "启动失败",
      `本地投资实验服务没有启动成功。\n\n${error && error.stack ? error.stack : error}`
    );
    app.quit();
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverUrl) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverHandle && serverHandle.server) {
    serverHandle.server.close();
    serverHandle = null;
  }
});
