const dgram = require('dgram');
const {logger} = require('./logConfig');

const logging = logger('UDP.js');

class UDPServer {
    /**
     * UDP功能类
     * @param {number} portLocal 本地端口
     * @param {number} portRemote 远程端口
     * @callback callback 回调函数，当接收到符合要求的数据时，执行该函数
     */
    constructor(portLocal, portRemote, callback) {
        this.portLocal = portLocal;
        this.portRemote = portRemote;
        this.server = dgram.createSocket('udp4');
        this.server.bind(+this.portLocal);
        this.opcMessage = '';
        this.recvMessage = []; // 需要显示的数组，字符串格式，[flag, ItemIDComplete, ItemIDClear, SensorID, Press]
        this.lastMessage = []; // 上一次接收的数据，格式同上
        this.callback = callback; // 接收ItemIDComplete消息后的回调函数

        // 监听端口
        this.server.on('listening', () => {
            console.info(`UDP linstening on UDP port: ${this.portLocal}`);
            logging.info(`UDP linstening on UDP port: ${this.portLocal}`);
        });

        // 接收消息
        this.server.on('message', (msg, rinfo) => {
            const strmsg = msg.toString();
            console.info(`UDP received data: "${strmsg}" from ${rinfo.address}:${rinfo.port}`);
            logging.info(`UDP received data: "${strmsg}" from ${rinfo.address}:${rinfo.port}`);
            if (strmsg.indexOf('C,') === 0) {
                this.recvMessage = strmsg.split(',');
                callback(false);
                this.lastMessage = this.recvMessage;
            }
        });

        // 错误处理
        this.server.on('error', (err) => {
            console.error(`${err.message}`);
            logging.error(`${err.message}`);
        });
    }

    /**
     * 发送消息，必须为文本格式
     * @param {string} message 要发送的消息
     */
    sendMessage(message) {
        this.server.send(message, this.portRemote, '127.0.0.1');
        console.info(`UDP sended data: "${this.opcMessage}" to 127.0.0.1:${this.portRemote}`);
        logging.info(`UDP sended data: "${this.opcMessage}" to 127.0.0.1:${this.portRemote}`);
    }

    /**
     * 发送数据给OPC程序
     * 发送数据文本格式'flag,ItemIDSensorID,ItemIDQty,ItemIDClear'，flag恒为“C”
     * @param {boolean} force 是否要强制发送OPC消息
     */
    sendOPC(force) {
        if ((this.lastMessage[1] === '0' && this.recvMessage[1] === '1') || force) {
            this.sendMessage(this.opcMessage);
        }
    }
}

module.exports = {
    UDPServer,
};
