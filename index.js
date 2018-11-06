const ipc = require('electron').ipcRenderer;
const {ImportXlsx} = require('./import-xlsx');
const {ImportProdID} = require('./import-prodID');
const {UDPServer} = require('./UDP');
const {TCPServer} = require('./TCP');
// 获取package.json里的版本号
const {version} = require('./package.json');

const WHOLEROWS = 36; // 一个文件完整记录数量
const ROWS = 12; // 每页显示记录数量
let gCurrentPage = 1; // 当前显示页
const xlsxDir = './excel'; // xlsx文件夹路径
const prodIDFile = './prodID/prodID.xlsx'; // 品番-TPMSID对照表

const gXlsx = new ImportXlsx(xlsxDir, WHOLEROWS);
gXlsx.walk();
const gProd = new ImportProdID(prodIDFile);
let gShowData = [];
let gUdp = {};
let gTCP = {};
let gUsingTCP = true;
let gCurrentRow = 0; // 正在检测行
let gTotalQty = 0; // 一个文件总记录数量

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
        $('#sheetMain').text(gTCP.sheet[0].data[0][2]);
        $('#sheetSpare').text(gTCP.sheet[0].data[0][6]);
    } else {
        $('#sheetMain').text(gXlsx.tireData.main[0][2]);
        $('#sheetSpare').text(gXlsx.tireData.spare[0][2]);
    }
    $('tbody').children().remove();
    if (!gUsingTCP) {
        if (gXlsx.tireData.uncomplete.length > 0 && gTotalQty !== WHOLEROWS) {
            $('#error-title').removeClass('hidden');
            $('#error-text').text(`当前文件不完整，缺 ${WHOLEROWS - gTotalQty} 台车`);
        } else if (gXlsx.tireData.uncomplete.length > 0 && gXlsx.tireData.continue) {
            const row = gXlsx.tireData.uncomplete;
            $('#error-title').removeClass('hidden');
            $('#error-text').text(`接上一台 NO: ${row[0]}, 顺序号: ${row[1]}, 主胎品番: ${row[3]}`);
            if (gCurrentRow === WHOLEROWS) {
                // 完成处理上一车不完整数据的衔接后，删除不完整记录
                gXlsx.tireData.uncomplete = [];
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
        return '';
    }
    let opcMessage = 'C,';
    const prodID = gProd.prodIDData[gShowData[gCurrentRow][2]];
    if (prodID) {
        opcMessage += prodID;
    } else {
        opcMessage += -1;
    }
    opcMessage += ',';
    if (gUsingTCP) {
        opcMessage += (+gTCP.sheet[0].data[gCurrentRow][4]) + (+gTCP.sheet[0].data[gCurrentRow][8]);
    } else {
        opcMessage += gXlsx.tireData.main[gCurrentRow][6] + gXlsx.tireData.spare[gCurrentRow][6];
    }
    opcMessage += ',0';
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
    console.info('manual pre step');
    gCurrentRow -= 2;
    if (gCurrentRow < 0) {
        gCurrentRow = 0;
    }
    highLightShowData(gCurrentRow);
    if (gCurrentRow % ROWS === 0) {
        pageUp(false);
    }
    fillTable(gCurrentPage);
    gCurrentRow += 1;
    if (gCurrentRow > gTotalQty) {
        gCurrentRow = gTotalQty;
    }
}

function sendOPCMessage() {
    gUdp.opcMessage = getOPCMessage();
    if (gUdp.opcMessage.indexOf('-1') > 0) {
        $('#error-title').removeClass('hidden');
        $('#error-text').text(`未知轮胎品番：${gShowData[gCurrentRow][2]}`);
    }
    gUdp.sendOPC();
}

function changeSheet() {
    gTCP.changeSheet();
    gShowData = [];
    for (let i = 0; i < gTCP.sheet[0].data.length; i++) {
        gShowData[i] = [
            i + 1,
            gTCP.sheet[0].data[i][1],
            gTCP.sheet[0].data[i][3],
            gTCP.sheet[0].data[i][7],
            gTCP.sheet[0].data[i][10],
            gTCP.sheet[0].data[i][11],
            gTCP.sheet[0].data[i][12],
            1,
            gTCP.sheet[0].data[i][7] ? 0 : 1,
        ];
    }
    gCurrentPage = 1;
    gCurrentRow = 0;
    gTotalQty = gTCP.sheet[0].data.length;
    highLightShowData(gCurrentRow);
    sendOPCMessage();
    fillTable(gCurrentPage);
    gCurrentRow += 1;
}

/**
 * 进入下一步
 * @param {boolean} isManual 是否用手动
 */
function nextStep(isManual) {
    showMessage();
    if (isManual) {
        console.info('manual next step');
        highLightShowData(gCurrentRow);
    } else {
        if (gUdp.recvMessage[1] !== '1') {
            return;
        }
        console.info('next step');
        $('#error-title').addClass('hidden');
        highLightShowData(gCurrentRow);
        sendOPCMessage();
    }
    if (gCurrentRow % ROWS === 0 && gCurrentRow !== 0) {
        pageDown(false);
    }
    fillTable(gCurrentPage);
    gCurrentRow += 1;
    if (gUsingTCP && gCurrentRow > WHOLEROWS) {
        changeSheet();
    }
    if (gUsingTCP && gCurrentRow > gTotalQty) {
        gCurrentRow = gTotalQty;
    }
}

function jumpUncompleteRow() {
    if (gXlsx.tireData.uncomplete.length > 0 && gTotalQty === WHOLEROWS && gXlsx.tireData.continue) {
        for (let i = 0; i < gTotalQty - 1; i++) {
            if (gXlsx.tireData.uncomplete[1] === gXlsx.tireData.main[i][1]) {
                gCurrentRow = i + 1;
                gCurrentPage = Math.ceil((gCurrentRow + 1) / ROWS);
                break;
            }
        }
        highLightShowData(gCurrentRow);
        sendOPCMessage();
        gCurrentRow += 1;
    }
}

function handleTCP(socket) {
    const NO = gTCP.sheet[0].data.length;
    gTotalQty = NO;
    gShowData.push([
        NO,
        gTCP.sheet[0].data[NO - 1][1],
        gTCP.sheet[0].data[NO - 1][3],
        gTCP.sheet[0].data[NO - 1][7],
        gTCP.sheet[0].data[NO - 1][10],
        gTCP.sheet[0].data[NO - 1][11],
        gTCP.sheet[0].data[NO - 1][12],
        1,
        gTCP.sheet[0].data[NO - 1][7] ? 0 : 1,
    ]);
    if (gCurrentRow > 0) {
        highLightShowData(gCurrentRow);
        sendOPCMessage();
    }
    fillTable(gCurrentPage);
    socket.write('1');
}

// 显示程序UDP端口5678，OPC程序UDP端口8765
gUdp = new UDPServer(5678, 8765, nextStep);

function initXlsx() {
    console.info('initXlsx...');
    gCurrentPage = 1;
    gCurrentRow = 0;
    gXlsx.load();
    gProd.load();
    gTotalQty = gXlsx.totalQty;
    gShowData = gXlsx.showData;
    jumpUncompleteRow();
    $('#error-title').addClass('hidden');
    fillTable(gCurrentPage);
}

function initTCP() {
    console.info('initTCP...');
    gCurrentPage = 1;
    gCurrentRow = 0;
    gProd.load();
    gTCP = new TCPServer(handleTCP, WHOLEROWS);
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

    window.addEventListener('beforeunload', () => {
        gUdp.server.close();
        gTCP.server.close();
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
});
