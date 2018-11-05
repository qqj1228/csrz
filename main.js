const electron = require('electron');

const {
    app,
    BrowserWindow,
    ipcMain,
    systemPreferences,
    Menu,
    globalShortcut,
} = electron;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

let isDev = false;
for (let i = 0; i < process.argv.length; i++) {
    isDev = process.argv[i].indexOf('inspect') > -1;
    if (isDev) {
        break;
    }
}

function createWindow(width, height) {
    // 创建浏览器窗口。
    win = new BrowserWindow({
        icon: `${__dirname}/asset/img/tool_256px.ico`,
        width: Math.round(width * 0.8),
        height: Math.round(height * 0.8),
        backgroundColor: systemPreferences.getColor('window'),
    });

    // 然后加载应用的 index.html。
    win.loadFile('index.html');

    // 打开开发者工具
    if (isDev) {
        win.webContents.openDevTools();
    }

    // 当 window 被关闭，这个事件会被触发。
    win.on('closed', () => {
        // 取消引用 window 对象，如果你的应用支持多窗口的话，
        // 通常会把多个 window 对象存放在一个数组里面，
        // 与此同时，你应该删除相应的元素。
        win = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    // 开始运行第二个实例
    console.error('You should running this application with one instance');
    app.quit();
} else {
    // 开始运行第一个实例
    app.on('second-instance', () => {
        // Someone tried to run a second instance, we should focus our window.
        if (win) {
            if (win.isMinimized()) {
                win.restore();
            }
            win.focus();
        }
    });
}

// Electron 会在初始化后并准备
// 创建浏览器窗口时，调用这个函数。
// 部分 API 在 ready 事件触发后才能使用。
app.on('ready', () => {
    if (!isDev) {
        Menu.setApplicationMenu(null);
    }
    // 获取主显示设备分辨率
    try {
        const {width, height} = electron.screen.getPrimaryDisplay().workAreaSize;
        createWindow(width, height);
    } catch (error) {
        console.error(error.message);
        app.quit();
    }
    globalShortcut.register('CmdOrCtrl+shift+i', () => {
        win.webContents.openDevTools();
    });
    globalShortcut.register('CmdOrCtrl+PageUp', () => {
        win.webContents.send('page-up');
    });
    globalShortcut.register('CmdOrCtrl+PageDown', () => {
        win.webContents.send('page-down');
    });
    globalShortcut.register('CmdOrCtrl+L', () => {
        win.webContents.send('load-xlsx');
    });
    globalShortcut.register('CmdOrCtrl+P', () => {
        win.webContents.send('manual-pre');
    });
    globalShortcut.register('CmdOrCtrl+N', () => {
        win.webContents.send('manual-next');
    });
});

// 当全部窗口关闭时退出。
app.on('window-all-closed', () => {
    // 在 macOS 上，除非用户用 Cmd + Q 确定地退出，
    // 否则绝大部分应用及其菜单栏会保持激活。
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // 在macOS上，当单击dock图标并且没有其他窗口打开时，
    // 通常在应用程序中重新创建一个窗口。
    if (win === null) {
        createWindow();
    }
});

// 在这个文件中，你可以续写应用剩下主进程代码。
// 也可以拆分成几个文件，然后用 require 导入。

ipcMain.on('get-background-color', () => {
    win.webContents.send('return-background-color', systemPreferences.getColor('window'));
});
