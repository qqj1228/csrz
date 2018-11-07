const net = require('net');
const {logger} = require('./logConfig');

const logging = logger('TCP.js');

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
        // 接受到的数据格式
        // [VIN码,顺序号,主胎指示票代码,主胎品番,主胎数量,'轮胎主',备胎指示票代码,备胎品番,备胎数量,'轮胎备',日期,时间,备注]
        this.data = [];
        // 指示票数据，sheet-当前显示指示票
        this.sheet = [];
        this.server = net.createServer();
        this.server.listen(this.port, this.host);

        this.server.on('listening', () => {
            console.log(`TCPServer listening on ${this.server.address().address}:${this.server.address().port}`);
            logging.info(`TCPServer listening on ${this.server.address().address}:${this.server.address().port}`);
        });

        this.server.on('connection', (socket) => {
            console.log(`TCP CONNECTED: ${socket.remoteAddress}:${socket.remotePort}`);
            logging.info(`TCP CONNECTED: ${socket.remoteAddress}:${socket.remotePort}`);

            // 为这个socket实例添加一个"data"事件处理函数
            socket.on('data', (data) => {
                console.log(`DATA from ${socket.remoteAddress}: "${data}"`);
                logging.info(`DATA from ${socket.remoteAddress}: "${data}"`);
                this.data = data.toString().split(',');
                if (this.data[5] !== '轮胎主' || this.data[9] !== '轮胎备') {
                    socket.write('0');
                    console.info('TCP response "0"');
                    logging.info('TCP response "0"');
                    return;
                }
                const result = this.sheet.length === 0 || this.sheet[0][2] === this.data[2];
                if (result && this.sheet.length < this.wholeQty) {
                    this.sheet.push(this.data);
                } else {
                    try {
                        let sheetBuf = JSON.parse(localStorage.getItem('sheetBuf'));
                        if (!sheetBuf) {
                            sheetBuf = [];
                        }
                        sheetBuf.push(this.data);
                        localStorage.setItem('sheetBuf', JSON.stringify(sheetBuf));
                    } catch (error) {
                        console.error(error.message);
                        logging.error(error.message);
                    }
                }
                callback(socket);
            });

            // 为这个socket实例添加一个"close"事件处理函数
            socket.on('close', () => {
                console.log(`TCP CLOSED: ${socket.remoteAddress}:${socket.remotePort}`);
                logging.info(`TCP CLOSED: ${socket.remoteAddress}:${socket.remotePort}`);
            });
        });

        this.server.on('error', (err) => {
            console.error(err.message);
            logging.error(err.message);
        });

        this.server.on('close', () => {
            console.log(`TCPServer CLOSED: ${this.server.remoteAddress}:${this.server.remotePort}`);
            logging.info(`TCPServer CLOSED: ${this.server.remoteAddress}:${this.server.remotePort}`);
        });
    }

    close() {
        this.server.close();
    }

    changeSheet() {
        try {
            const sheetBuf = JSON.parse(localStorage.getItem('sheetBuf'));
            if (!sheetBuf) {
                return;
            }
            this.sheet = [];
            const name = sheetBuf[0][2];
            let pos = 0;
            for (let i = 0; i < sheetBuf.length; i++) {
                if (name === sheetBuf[i][2] && i < this.wholeQty) {
                    this.sheet.push(sheetBuf[i]);
                    pos = i;
                } else {
                    break;
                }
            }
            localStorage.setItem('sheetBuf', JSON.stringify(sheetBuf.slice(pos + 1)));
        } catch (error) {
            console.error(error.message);
            logging.error(error.message);
        }
    }
}

module.exports = {
    TCPServer,
};
