const net = require('net');

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
        // 指示票数据，sheet[0]-当前显示指示票，sheet[1]-缓存指示票
        // sheet[0]格式：{name, data}, name-主胎指示票代码，data-轮胎数据
        this.sheet = [];
        this.sheet[0] = {};
        this.sheet[0].name = '';
        this.sheet[0].data = [];
        this.sheet[1] = {};
        this.sheet[1].name = '';
        this.sheet[1].data = [];
        this.server = net.createServer();
        this.server.listen(this.port, this.host);

        this.server.on('listening', () => {
            console.log(`TCPServer listening on ${this.server.address().address}:${this.server.address().port}`);
        });

        this.server.on('connection', (socket) => {
            console.log(`TCP CONNECTED: ${socket.remoteAddress}:${socket.remotePort}`);

            // 为这个socket实例添加一个"data"事件处理函数
            socket.on('data', (data) => {
                console.log(`DATA ${socket.remoteAddress}: ${data}`);
                this.data = data.toString().split(',');
                if (this.data[5] !== '轮胎主' || this.data[9] !== '轮胎备') {
                    socket.write('0');
                    return;
                }
                const len = [0, 0];
                len[0] = this.sheet[0].data.length;
                len[1] = this.sheet[1].data.length;
                if (this.sheet[0].name === '') {
                    [, , this.sheet[0].name] = this.data;
                    this.sheet[0].data = [];
                } else if (this.sheet[1].name === '' && len[0] >= this.wholeQty) {
                    [, , this.sheet[1].name] = this.data;
                    this.sheet[1].data = [];
                }
                if (this.sheet[0].name === this.data[2] && len[0] < this.wholeQty) {
                    this.sheet[0].data.push(this.data);
                } else if (this.sheet[1].name === this.data[2] && len[1] < this.wholeQty) {
                    this.sheet[1].data.push(this.data);
                }
                callback(socket);
            });

            // 为这个socket实例添加一个"close"事件处理函数
            socket.on('close', () => {
                console.log(`TCP CLOSED: ${socket.remoteAddress}:${socket.remotePort}`);
            });
        });

        this.server.on('error', (err) => {
            console.error(err.message);
        });

        this.server.on('close', () => {
            console.log(`TCPServer CLOSED: ${this.server.remoteAddress}:${this.server.remotePort}`);
        });
    }

    close() {
        this.server.close();
    }

    changeSheet() {
        // 需要对this.sheet[0]进行深拷贝
        this.sheet[0].name = this.sheet[1].name;
        this.sheet[0].data = this.sheet[1].data;
        this.sheet[1].name = '';
        this.sheet[1].data = [];
    }
}

module.exports = {
    TCPServer,
};
