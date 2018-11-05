const net = require('net');

class TCPServer {
    constructor(port = 9876, host = '0.0.0.0') {
        this.port = port;
        this.host = host;
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
                // 回发该数据，客户端将收到来自服务端的数据
                socket.write(`You said "${data}"`);
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
}

module.exports = {
    TCPServer,
};
