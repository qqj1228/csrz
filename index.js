const ipc = require('electron').ipcRenderer;
const {logger} = require('./logConfig');
const {ImportXlsx} = require('./import-xlsx');
const {ImportProdID} = require('./import-prodID');
const {UDPServer} = require('./UDP');
const {TCPServer, TCPClient} = require('./TCP');
const {PrintCSV} = require('./printCSV');
// 获取package.json里的版本号
const {version} = require('./package.json');

const WHOLEROWS = 36; // 一张指示票完整记录数量
const ROWS = 12; // 每页显示记录数量
// const PERIOD = 85; // 一辆车生产周期，秒
// const STOCKTIME = 128; // 备货时间，分钟
// const TRANSTIME = 40; // 运输时间，分钟
let gCurrentPage = 1; // 当前显示页
const xlsxDir = './excel'; // xlsx文件夹路径
const prodIDFile = './prodID/prodID.xlsx'; // 品番-TPMSID对照表

const logging = logger('index.js');
const gXlsx = new ImportXlsx(xlsxDir, WHOLEROWS);
gXlsx.walk();
const gProd = new ImportProdID(prodIDFile);
let gShowData = [];
let gUdp = {};
let gTCP = {};
let gTCPVIN = {};
let gUsingTCP = true; // 是否使用TCP接受轮胎数据
let gCurrentRow = 0; // 正在检测行，显示后即为下一个将要检测行
let gTotalQty = 0; // 一张指示票总记录数量
let gIsEnd = false; // 到达指示票末尾
let gCanRun = false; // 是否可以运行

/**
 * 计算出货时间和到货时间, 返回值格式[出货时间, 到货时间], 包含日期的完整字符串
 * @param {string} firstTime 首台车时间，包含日期的完整字符串
 */
// function CalTime(firstTime) {
//     const time = [];
//     const t = new Date(firstTime);
//     t.setMinutes(t.getMinutes() + STOCKTIME, WHOLEROWS * PERIOD);
//     time[0] = t.toLocaleString('zh-CN', {hour12: false});
//     t.setMinutes(t.getMinutes() + TRANSTIME);
//     time[1] = t.toLocaleString('zh-CN', {hour12: false});
//     return time;
// }

function printCSV(sheetName) {
    const csv = new PrintCSV(gProd.resultFile, gProd.printDir, sheetName);
    csv.go();
}

/**
 * 填充页面表格数据
 * @param {number} page 当前页数，从1开始
 */
function fillTable(page) {
    const start = (page - 1) * ROWS;
    let end = page * ROWS;
    if (end > gTotalQty) {
        end = gTotalQty;
    }
    if (gUsingTCP) {
        if (gTCP.sheet.length > 0) {
            if ($('#sheetMain').text() !== gTCP.sheet[0][2]) {
                printCSV($('#sheetMain').text());
            }
            $('#sheetMain').text(gTCP.sheet[0][2]);
            $('#sheetSpare').text(gTCP.sheet[0][6]);
            // const time = CalTime(`${gTCP.sheet[0][10]} ${gTCP.sheet[0][11]}`);
            // $('#shippingTime').text(time[0]);
            // $('#arrivalTime').text(time[1]);
        }
    } else {
        if ($('#sheetMain').text() !== gXlsx.tireData.main[0][2]) {
            printCSV($('#sheetMain').text());
        }
        $('#sheetMain').text(gXlsx.tireData.main[0][2]);
        $('#sheetSpare').text(gXlsx.tireData.spare[0][2]);
        // const time = CalTime(`${gXlsx.tireData.main[0][3]} ${gXlsx.tireData.main[0][4]}`);
        // $('#shippingTime').text(time[0]);
        // $('#arrivalTime').text(time[1]);
    }
    $('tbody').children().remove();
    if (!gUsingTCP) {
        if (gXlsx.tireData.uncomplete.length > 0 && gTotalQty !== WHOLEROWS) {
            $('#error-title').removeClass('hidden');
            $('#error-text').text(`当前文件不完整，缺 ${WHOLEROWS - gTotalQty} 台车`);
        } else if (gXlsx.tireData.uncomplete.length > 0 && gXlsx.tireData.continue) {
            const row = gXlsx.tireData.uncomplete;
            $('#error-title').removeClass('hidden');
            $('#error-text').text(`接上一个不完整文件记录 NO: ${row[0]}, 顺序号: ${row[1]}, 主胎品番: ${row[3]}`);
            if (gCurrentRow === WHOLEROWS) {
                // 完成处理上一车不完整数据的衔接后，删除不完整记录
                gXlsx.tireData.uncomplete = [];
                console.info('Deleted uncomplete');
                logging.info('Deleted uncomplete');
            }
        }
    }
    for (let i = start; i < end; i++) {
        let tr = '';
        if (gShowData[i][7] === 2) {
            // 正在检测
            tr = '<tr class="green-row';
        } else if (gShowData[i][7] === 3) {
            // 完成检测
            tr = '<tr class="gray-row';
        } else {
            tr = '<tr class="';
        }
        // 处理只有主胎没备胎记录
        if (gShowData[i][8] < 0) {
            tr += ' error-row">';
        } else {
            tr += '">';
        }
        tr += `
            <td>${gShowData[i][0]}</td>
            <td>${gShowData[i][1]}</td>
            <td>${gShowData[i][2]}</td>
            <td>${gShowData[i][3]}</td>
            <td>${gShowData[i][4]}</td>
            <td>${gShowData[i][5]}</td>
            <td>${gShowData[i][6]}</td></tr>
            `;
        $('tbody').append(tr);
    }
}

/**
 * 检测是否有sheetBuf，有返回true，没有返回false
 */
function testBuf() {
    const sheetBuf = JSON.parse(localStorage.getItem('sheetBuf'));
    if (sheetBuf && sheetBuf.length > 0) {
        return true;
    }
    return false;
}

/**
 * 向上翻页
 * @param {boolean} loop 是否循环显示
 */
function pageUp(loop) {
    gCurrentPage -= 1;
    if (gCurrentPage < 1) {
        if (loop) {
            gCurrentPage = Math.ceil(gTotalQty / ROWS);
        } else {
            gCurrentPage = 1;
        }
    }
}

/**
 * 向下翻页
 * @param {boolean} loop 是否循环显示
 */
function pageDown(loop) {
    gCurrentPage += 1;
    if (gCurrentPage > Math.ceil(gTotalQty / ROWS)) {
        if (loop) {
            gCurrentPage = 1;
        } else {
            gCurrentPage = Math.ceil(gTotalQty / ROWS);
        }
    }
}

function highLightShowData(index) {
    if (index < gTotalQty) {
        gShowData[index][7] = 2;
        for (let i = 0; i < index; i++) {
            gShowData[i][7] = 3;
        }
        for (let i = index + 1; i < gTotalQty; i++) {
            gShowData[i][7] = 1;
        }
    } else {
        for (let i = 0; i < gTotalQty; i++) {
            gShowData[i][7] = 3;
        }
        gCurrentRow = gTotalQty;
    }
}

function getOPCMessage() {
    if (gCurrentRow >= gTotalQty) {
        gIsEnd = true;
        return 'END';
    }
    // flag,恒为"C"
    let opcMessage = 'C,';
    let prodID = -1;
    let qtyMod = 0;
    if (gProd.prodIDData[gShowData[gCurrentRow][2]]) {
        [prodID, qtyMod] = gProd.prodIDData[gShowData[gCurrentRow][2]];
    }
    // TPMS传感器编号
    if (prodID >= 0) {
        opcMessage += prodID;
    } else {
        opcMessage += -1;
    }
    opcMessage += ',';
    // 轮胎数量
    if (gUsingTCP) {
        opcMessage += (+gTCP.sheet[gCurrentRow][4]) + (+gTCP.sheet[gCurrentRow][8]) + qtyMod;
    } else {
        opcMessage += gXlsx.tireData.main[gCurrentRow][6] + gXlsx.tireData.spare[gCurrentRow][6] + qtyMod;
    }
    // 轮胎计数清零
    opcMessage += ',0,';
    // NO号
    opcMessage += gShowData[gCurrentRow][0];
    return opcMessage;
}

function showMessage() {
    const tmp = +gUdp.recvMessage[3];
    $('#sensorID').text(tmp.toString(16).toUpperCase());
    $('#pressure').text(gUdp.recvMessage[4]);
    $('#cuQty').text(gUdp.recvMessage[2]);
}

/**
 * 手动回退上一步
 */
function preStep() {
    gCurrentRow -= 2;
    if (gCurrentRow < 0) {
        gCurrentRow = 0;
    }
    console.info(`Manual preStep: NO${gCurrentRow}`);
    logging.info(`Manual preStep: NO${gCurrentRow}`);
    highLightShowData(gCurrentRow);
    if (gCurrentRow % ROWS === 0) {
        pageUp(false);
    }
    fillTable(gCurrentPage);
    gCurrentRow += 1;
    if (gCurrentRow > gTotalQty) {
        gCurrentRow = gTotalQty;
    }
    localStorage.setItem('currentRow', gCurrentRow);
}

/**
 * 发送OPC消息
 * @param {boolean} force 是否强制发送OPC消息
 */
function sendOPCMessage(force) {
    gUdp.opcMessage = getOPCMessage();
    if (gUdp.opcMessage.indexOf('-1') > 0) {
        $('#error-title').removeClass('hidden');
        $('#error-text').text(`未知轮胎品番：${gShowData[gCurrentRow][2]}`);
    }
    gUdp.sendOPC(force);
}

/**
 * 发送VIN消息
 */
function sendVINMessage() {
    if (gCurrentRow >= gTotalQty) {
        return;
    }
    gTCPVIN.sendData = `VIN=${gTCP.sheet[gCurrentRow][0]},PROD=${gTCP.sheet[gCurrentRow][3]},`;
    gTCPVIN.send('');
}

/**
 * 进入下一个指示票，之前的指示票数据将会被舍弃
 */
function changeSheet() {
    gTCP.changeSheet();
    if (!gTCP.sheet || gTCP.sheet.length === 0) {
        return;
    }
    console.info(`change sheet to ${gTCP.sheet[0][2]}`);
    logging.info(`change sheet to ${gTCP.sheet[0][2]}`);
    gShowData = [];
    for (let i = 0; i < gTCP.sheet.length; i++) {
        gShowData[i] = [
            i + 1,
            gTCP.sheet[i][1],
            gTCP.sheet[i][3],
            gTCP.sheet[i][7],
            gTCP.sheet[i][10],
            gTCP.sheet[i][11],
            gTCP.sheet[i][12],
            1,
            gTCP.sheet[i][7] ? 0 : 1,
        ];
    }
    gCurrentPage = 1;
    gCurrentRow = 0;
    gTotalQty = gTCP.sheet.length;
    highLightShowData(gCurrentRow);
    sendOPCMessage(false);
    sendVINMessage();
    fillTable(gCurrentPage);
    gCurrentRow += 1;
    gIsEnd = false;
}

/**
 * 进入下一步
 * @param {boolean} isManual 是否用手动
 */
function nextStep(isManual) {
    showMessage();
    if (isManual) {
        console.info(`Manual nextStep: NO${gCurrentRow}`);
        logging.info(`Manual nextStep: NO${gCurrentRow}`);
        highLightShowData(gCurrentRow);
    } else {
        if (gUdp.lastMessage[1] !== '0' || gUdp.recvMessage[1] !== '1' || !gCanRun) {
            return;
        }
        $('#error-title').addClass('hidden');
        highLightShowData(gCurrentRow);
        sendOPCMessage(false);
        sendVINMessage();
    }
    if (gCurrentRow % ROWS === 0 && gCurrentRow !== 0) {
        pageDown(false);
    }
    fillTable(gCurrentPage);
    gCurrentRow += 1;
    if (!isManual) {
        if (gUsingTCP && gCurrentRow > WHOLEROWS) {
            if (testBuf()) {
                changeSheet();
            }
        }
        if (gUsingTCP && gCurrentRow > gTotalQty) {
            gCurrentRow = gTotalQty;
            if (testBuf()) {
                changeSheet();
            }
        }
    }
    localStorage.setItem('currentRow', gCurrentRow);
}

function jumpUncompleteRow() {
    if (gXlsx.tireData.uncomplete.length > 0 && gTotalQty === WHOLEROWS && gXlsx.tireData.continue) {
        for (let i = 0; i < gTotalQty - 1; i++) {
            if (gXlsx.tireData.uncomplete[1] === gXlsx.tireData.main[i][1]) {
                gCurrentRow = i + 1;
                gCurrentPage = Math.ceil(gCurrentRow / ROWS);
                break;
            }
        }
    }
}

function handleTCP(socket) {
    const NO = gTCP.sheet.length;
    gTotalQty = NO;
    gShowData.push([
        NO,
        gTCP.sheet[NO - 1][1],
        gTCP.sheet[NO - 1][3],
        gTCP.sheet[NO - 1][7],
        gTCP.sheet[NO - 1][10],
        gTCP.sheet[NO - 1][11],
        gTCP.sheet[NO - 1][12],
        1,
        gTCP.sheet[NO - 1][7] ? 0 : 1,
    ]);
    if (gIsEnd) {
        highLightShowData(gCurrentRow);
        sendOPCMessage(false);
        fillTable(gCurrentPage);
        gCurrentRow += 1;
        gIsEnd = false;
    } else {
        fillTable(gCurrentPage);
    }
    fillTable(gCurrentPage);
    socket.write('1');
}

/**
 * 恢复现场数据
 */
function restore() {
    gTCP.sheet = JSON.parse(localStorage.getItem('sheetShow'));
    if (!gTCP.sheet) {
        gTCP.sheet = [];
        changeSheet();
    }
    gCurrentRow = JSON.parse(localStorage.getItem('currentRow'));
    if (!gCurrentRow) {
        gCurrentRow = 1;
    }
    if (gTCP.sheet.length > 0) {
        const NO = gTCP.sheet.length;
        gTotalQty = NO;
        for (let i = 0; i < gTCP.sheet.length; i++) {
            gShowData.push([
                i + 1,
                gTCP.sheet[i][1],
                gTCP.sheet[i][3],
                gTCP.sheet[i][7],
                gTCP.sheet[i][10],
                gTCP.sheet[i][11],
                gTCP.sheet[i][12],
                1,
                gTCP.sheet[i][7] ? 0 : 1,
            ]);
        }
    }
    highLightShowData(gCurrentRow - 1);
    gCurrentPage = Math.ceil(gCurrentRow / ROWS);
    if (gCurrentPage === 0) {
        gCurrentPage = 1;
    }
    fillTable(gCurrentPage);
}

// 显示程序UDP端口5678，OPC程序UDP端口8765
gUdp = new UDPServer(5678, 8765, nextStep);

function initXlsx() {
    console.info('initXlsx...');
    logging.info('initXlsx...');
    gCurrentPage = 1;
    gCurrentRow = 0;
    gIsEnd = false;
    gXlsx.load();
    gProd.load();
    gUdp.recvMessage = [];
    gTotalQty = gXlsx.totalQty;
    gShowData = gXlsx.showData;
    jumpUncompleteRow();
    $('#error-title').addClass('hidden');
    fillTable(gCurrentPage);
    if (gUdp.recvMessage.length === 0) {
        gUdp.recvMessage = ['C', '1', '', '', ''];
        nextStep(false);
    }
}

function initTCP() {
    console.info('initTCP...');
    logging.info('initTCP...');
    gCurrentPage = 1;
    gCurrentRow = 0;
    gIsEnd = false;
    gProd.load();
    gTCP = new TCPServer(handleTCP, WHOLEROWS);
    gTCPVIN = new TCPClient();
    restore();
    $('#error-title').addClass('hidden');
}

$(() => {
    // 初始化页面背景色
    ipc.send('get-background-color');
    ipc.on('return-background-color', (event, arg) => {
        document.body.style.backgroundColor = arg;
    });
    // 设置页面标题版本号
    const {title} = document;
    document.title = `${title} v${version}`;

    if (gXlsx.fileList.length > 0) {
        gUsingTCP = false;
        initXlsx();
    } else {
        gUsingTCP = true;
        initTCP();
    }

    ipc.on('page-up', () => {
        pageUp(true);
        fillTable(gCurrentPage);
    });

    ipc.on('page-down', () => {
        pageDown(true);
        fillTable(gCurrentPage);
    });

    ipc.on('load-xlsx', () => {
        if (gUsingTCP) {
            gProd.load();
        } else {
            initXlsx();
        }
    });

    ipc.on('manual-pre', () => {
        preStep();
    });

    ipc.on('manual-next', () => {
        nextStep(true);
    });

    ipc.on('restart-TCPServer', () => {
        console.info('Restart TCPServer...');
        logging.info('Restart TCPServer...');
        if (gTCP.server) {
            gTCP.server.close();
        }
        gTCP = null;
        gTCP = new TCPServer(handleTCP, WHOLEROWS);
    });

    ipc.on('TCP-closed', () => {
        $('.big.label').removeClass('green').addClass('red');
        $('#statusIcon').prepend('<i class="large red dont icon"></i>');
    });

    ipc.on('TCP-connected', () => {
        $('.big.label').removeClass('red').addClass('green');
        $('.dont.icon').remove();
    });

    ipc.on('print-csv', () => {
        printCSV($('#sheetMain').text());
    });

    // 页面被刷新之前
    window.addEventListener('beforeunload', () => {
        gUdp.server.close();
        if (gTCP.server) {
            gTCP.server.close();
        }
    });

    $('#next-btn').on('click', () => {
        nextStep(true);
    });

    $('#pre-btn').on('click', () => {
        preStep();
    });

    $('#load-btn').on('click', () => {
        if (gUsingTCP) {
            gProd.load();
        } else {
            initXlsx();
        }
    });

    $('#next-sheet-btn').on('click', () => {
        if (gUsingTCP) {
            $('.ui.small.modal').modal({
                onApprove: () => { changeSheet(); },
            }).modal('show');
        }
    });

    $('#start-btn').on('click', () => {
        if (gCanRun) {
            gCanRun = false;
            $('#start-btn').removeClass('primary');
        } else {
            gCanRun = true;
            $('#start-btn').addClass('primary');
        }
    });
});
