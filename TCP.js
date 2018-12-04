const ipc = require('electron').ipcRenderer;
const net = require('net');
const fs = require('fs');
const {logger} = require('./logConfig');

const logging = logger('TCP.js');

const MAXSHEETQTY = 100;

// 默认发送VIN码配置
let VINConfig = {
    server: '127.0.0.1',
    port: 2501,
};

/**
 * 比较函数，升序
 * @param {Array} a tempData里的前一条的数据
 * @param {Array} b tempData里的后一条的数据
 */
function compare(a, b) {
    let result = 0;
    if (a[10] > b[10]) {
        result = 1;
    } else if (a[10] < b[10]) {
        result = -1;
    } else if (a[11] > b[11]) {
        result = 1;
    } else if (a[11] < b[11]) {
        result = -1;
    } else {
        result = 0;
    }
    return result;
}

/**
 * 数组排序并去重
 * @param {Array} array 要处理的数组
 */
function dedupe(array) {
    array.sort(compare);
    const re = [array[0]];
    for (let i = 1; i < array.length; i++) {
        const result1 = array[i][10] !== re[re.length - 1][10];
        const result2 = array[i][11] !== re[re.length - 1][11];
        if (result1 || result2) {
            re.push(array[i]);
        }
    }
    return re;
}

class TCPServer {
    /**
     * TCP服务器功能类
     * @callback callback 回调函数，当某个客户端socket接收到数据时，调用这个函数
     * @param {number} port 监听端口
     * @param {string} host 监听地址
     */
    constructor(callback, wholeQty, port = 9876, host = '0.0.0.0') {
        this.callback = callback;
        this.wholeQty = wholeQty;
        this.port = port;
        this.host = host;
        // 接收到的数据格式
        // [VIN码,顺序号,主胎指示票代码,主胎品番,主胎数量,'轮胎主',备胎指示票代码,备胎品番,备胎数量,'轮胎备',日期,时间,备注]
        this.data = [];
        // 上一次接收的数据
        this.lastData = ['', '-1', '', '', '', '', '', '', '', '', '', '', '', ''];
        // 指示票数据，sheet-当前显示指示票
        this.sheet = [];
        this.server = net.createServer();
        this.server.listen(this.port, this.host);
        // 缓存数据，用来处理乱序数据
        this.tempData = [];
        // 接收数据状态已正常
        this.isNormal = false;

        this.server.on('listening', () => {
            console.log(`TCPServer listening on ${this.server.address().address}:${this.server.address().port}`);
            logging.info(`TCPServer listening on ${this.server.address().address}:${this.server.address().port}`);
        });

        this.server.on('connection', (socket) => {
            console.log(`TCP CONNECTED: ${socket.remoteAddress}:${socket.remotePort}`);
            logging.info(`TCP CONNECTED: ${socket.remoteAddress}:${socket.remotePort}`);
            ipc.send('TCP-connected');

            // 为这个socket实例添加一个"data"事件处理函数
            socket.on('data', (data) => {
                console.log(`TCP DATA from ${socket.remoteAddress}: "${data}"`);
                logging.info(`TCP DATA from ${socket.remoteAddress}: "${data}"`);
                this.data = data.toString().split(',');
                // 处理非法数据
                if (this.data[0] !== 'TEMPDATA') {
                    if (this.data[5] !== '轮胎主' || this.data[9] !== '轮胎备') {
                        socket.write('0');
                        console.info('TCP response "0": wrong data');
                        logging.info('TCP response "0": wrong data');
                        return;
                    }
                }
                // 处理重复数据
                if (this.lastData[10] === this.data[10] && this.lastData[11] === this.data[11]) {
                    socket.write('1');
                    console.info('TCP response "1": repeated data');
                    logging.info('TCP response "1": repeated data');
                    this.lastData = this.data;
                    return;
                }
                // 处理乱序数据
                if (!this.isNormal && this.data[0] !== 'TEMPDATA') {
                    socket.write('1');
                    console.info('TCP response "1": unnormal data');
                    logging.info('TCP response "1": unnormal data');
                    this.tempData.push(this.data);
                    this.lastData = this.data;
                    return;
                }
                // 从乱序数据变为正常数据时
                if (!this.isNormal && this.data[0] === 'TEMPDATA') {
                    this.isNormal = true;
                    this.tempData = dedupe(this.tempData);
                    for (let i = 0; i < this.tempData.length; i++) {
                        this.handleData(this.tempData[i]);
                        this.lastData = this.tempData[i];
                        callback(socket);
                    }
                    return;
                }
                // 接收正常后收到TEMPDATA数据
                if (this.isNormal && this.data[0] === 'TEMPDATA') {
                    socket.write('1');
                    console.info('TCP response "1": TEMPDATA');
                    logging.info('TCP response "1": TEMPDATA');
                    return;
                }
                // 处理接收到的正常的一条数据
                this.handleData(this.data);
                this.lastData = this.data;
                callback(socket);
            });

            socket.on('error', (err) => {
                console.error(`TCP ERROR: ${err.message}`);
                logging.error(`TCP ERROR: ${err.message}`);
            });

            // 为这个socket实例添加一个"close"事件处理函数
            socket.on('close', () => {
                console.log(`TCP CLOSED: ${socket.remoteAddress}:${socket.remotePort}`);
                logging.info(`TCP CLOSED: ${socket.remoteAddress}:${socket.remotePort}`);
                ipc.send('TCP-closed');
            });
        });

        this.server.on('error', (err) => {
            console.error(`TCPServer ERROR: ${err.message}`);
            logging.error(`TCPServer ERROR: ${err.message}`);
            ipc.send('restart-TCPServer');
        });

        this.server.on('close', () => {
            console.log(`TCPServer CLOSED: ${this.host}:${this.port}`);
            logging.info(`TCPServer CLOSED: ${this.host}:${this.port}`);
        });
    }

    handleData(inputData) {
        const data = inputData;
        // 处理备注
        if (this.lastData[3] !== '' && this.lastData[3] !== data[3]) {
            data[12] = '变化';
        }
        if (+data[1] === 1) {
            if (data[12] !== '') {
                data[12] += ', ';
            }
            data[12] += '不连号';
        }
        const result = this.sheet.length === 0 || this.sheet[0][2] === data[2];
        if (result && this.sheet.length < this.wholeQty) {
            this.sheet.push(data);
            let sheetShow = JSON.parse(localStorage.getItem('sheetShow'));
            if (!sheetShow) {
                sheetShow = [];
            }
            sheetShow.push(data);
            localStorage.setItem('sheetShow', JSON.stringify(sheetShow));
        } else {
            let sheetBuf = JSON.parse(localStorage.getItem('sheetBuf'));
            if (!sheetBuf) {
                sheetBuf = [];
            }
            if (sheetBuf.length >= this.wholeQty * MAXSHEETQTY) {
                sheetBuf = sheetBuf.slice(this.wholeQty);
            }
            sheetBuf.push(data);
            localStorage.setItem('sheetBuf', JSON.stringify(sheetBuf));
        }
    }

    changeSheet() {
        const sheetBuf = JSON.parse(localStorage.getItem('sheetBuf'));
        const sheetShow = [];
        if (!sheetBuf) {
            return;
        }
        this.sheet = [];
        let pos = 0;
        for (let i = 0; i < sheetBuf.length; i++) {
            if (sheetBuf[0][2] === sheetBuf[i][2] && i < this.wholeQty) {
                this.sheet.push(sheetBuf[i]);
                sheetShow.push(sheetBuf[i]);
                pos = i;
            } else {
                break;
            }
        }
        localStorage.setItem('sheetBuf', JSON.stringify(sheetBuf.slice(pos + 1)));
        localStorage.setItem('sheetShow', JSON.stringify(sheetShow));
    }
}

class TCPClient {
    /**
     * TCP客户端类，用于向TPMS检测客户端发送VIN码和主胎品番
     */
    constructor() {
        // 读取./config/VIN.json文件
        let path = './config/VIN.json';
        if (fs.existsSync(path)) {
            VINConfig = JSON.parse(fs.readFileSync(path, 'utf8'));
        } else {
            path = `${__dirname}/config/VIN.json`;
            if (fs.existsSync(path)) {
                console.info(`Using ${__dirname}/config/VIN.json`);
                logging.info(`Using ${__dirname}/config/VIN.json`);
                VINConfig = JSON.parse(fs.readFileSync(path, 'utf8'));
            } else {
                console.warn('Can not find "/config/VIN.json", using default VINConfig setting.');
                logging.warn('Can not find "/config/VIN.json", using default VINConfig setting.');
            }
        }

        this.server = VINConfig.server;
        this.port = VINConfig.port;
        // 发送的数据格式：'VIN=VIN码,PROD=主胎品番,'，例如：'VIN=LL66HAB09JB140779,PROD=4250C401,'
        // 服务端返回的数据格式：'OK'
        this.sendData = '';
        // 已连接标志
        this.connected = false;

        this.client = new net.Socket();
        this.client.connect(this.port, this.server);

        this.client.on('connect', () => {
            console.info(`TCPClient CONNECTED TO: ${this.server}:${this.port}`);
            logging.info(`TCPClient CONNECTED TO: ${this.server}:${this.port}`);
            this.connected = true;
        });

        // 为客户端添加“data”事件处理函数
        // data是服务器发回的数据
        this.client.on('data', (data) => {
            console.info(`TCPClient DATA: ${data}`);
            logging.info(`TCPClient DATA: ${data}`);
        });

        // 为客户端添加“close”事件处理函数
        this.client.on('close', () => {
            this.connected = false;
            console.info('TCPClient closed');
            logging.info('TCPClient closed');
        });

        this.client.on('error', (error) => {
            console.error(`TCPClient ERROR: ${error.message}`);
            logging.error(`TCPClient ERROR: ${error.message}`);
            this.client.destroy();
        });
    }

    /**
     * 发送数据
     * @param {string} data 需要发送的数据
     */
    send(data) {
        let rawData = '';
        if (data === '') {
            rawData = this.sendData;
        } else {
            rawData = data;
        }
        if (this.connected) {
            this.client.write(rawData, () => {
                console.info(`TCPClient SEND: ${rawData}`);
                logging.info(`TCPClient SEND: ${rawData}`);
            });
        } else {
            this.client.connect(this.port, this.server, () => {
                this.client.write(rawData, () => {
                    console.info(`TCPClient SEND: ${rawData}`);
                    logging.info(`TCPClient SEND: ${rawData}`);
                });
            });
        }
    }
}

module.exports = {
    TCPServer,
    TCPClient,
};
