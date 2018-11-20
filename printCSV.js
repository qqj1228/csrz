const fs = require('fs');
const iconv = require('iconv-lite');
const {logger} = require('./logConfig');

const logging = logger('printCSV.js');

class PrintCSV {
    constructor(resultFile, printDir, sheetName) {
        this.resultFile = resultFile;
        this.printDir = printDir;
        this.sheetName = sheetName;
        if (this.sheetName === '') {
            this.sheetName = 'test';
        }
        this.csvData = '';
        this.yearMonth = '';
        this.yearMonthDay = '';
        this.fileDir = '';
    }

    getDir() {
        const now = new Date();
        const date = now.toLocaleDateString().split('/');
        this.yearMonthDay = date.join('-');
        date.splice(2);
        this.yearMonth = date.join('-');
        const tmp = `${this.printDir}/${this.yearMonth}/${this.yearMonthDay}`;
        if (this.fileDir !== tmp) {
            this.mkDirAll();
            this.fileDir = tmp;
        }
    }

    mkDirAll() {
        if (!fs.existsSync(this.printDir)) {
            fs.mkdirSync(this.printDir);
        }
        if (!fs.existsSync(`${this.printDir}/${this.yearMonth}`)) {
            fs.mkdirSync(`${this.printDir}/${this.yearMonth}`);
        }
        if (!fs.existsSync(`${this.printDir}/${this.yearMonth}/${this.yearMonthDay}`)) {
            fs.mkdirSync(`${this.printDir}/${this.yearMonth}/${this.yearMonthDay}`);
        }
    }

    go() {
        fs.readFile(this.resultFile, (err, data) => {
            if (err) {
                console.error(err.message);
                logging.error(err.message);
            } else {
                fs.unlink(this.resultFile, (err1) => {
                    if (err1) {
                        console.error(err1.message);
                        logging.error(err1.message);
                    }
                });
                this.getDir();
                let out = `主胎指示票代码：,${this.sheetName}\r\n`;
                out += '时间,传感器,ID,压力,温度,电池电量,功能位,检测时长,通过\r\n';
                out += iconv.decode(data, 'gbk');
                fs.writeFile(`${this.fileDir}\\${this.sheetName}.csv`, iconv.encode(out, 'gbk'), (err2) => {
                    if (err2) {
                        console.error(err2.message);
                        logging.error(err2.message);
                    }
                });
            }
        });
    }
}

module.exports = {
    PrintCSV,
};
