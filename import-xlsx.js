const xlsx = require('node-xlsx');
const fs = require('fs');

class ImportXlsx {
    /**
     * 导入xlsx文件类
     * @param {string} xlsxDir xlsx文件夹路径
     * @param {number} wholeQty 一个文件完整记录数量
     */
    constructor(xlsxDir, wholeQty) {
        this.xlsxDir = xlsxDir;
        this.wholeQty = wholeQty;
        this.fileList = [];
        this.mainTire = {};
        this.spareTire = {};
        // 各字段index值
        this.no = 0;
        this.seq = 0;
        this.sheet = 0;
        this.date = 0;
        this.time = 0;
        this.prod = 0;
        this.note = 0;
        // 一条轮胎记录格式：
        // [NO，顺序号，指示票代码，指示日期，指示时间，品番, 数量，备注]
        this.tireData = {};
        this.tireData.main = [];
        this.tireData.spare = [];
        // 不完整导入文件数据中最后一车的数据[NO，顺序号，主胎指示票代码，主胎品番]
        this.tireData.uncomplete = [];
        // 是否接续上一车不完整文件数据
        this.tireData.continue = false;
        // 一个文件总记录数量
        this.totalQty = 0;
    }

    load() {
        this.walk(this.xlsxDir);
        this.xlsxParse();
    }

    walk(path) {
        const dirList = fs.readdirSync(path);
        this.fileList = [];

        dirList.forEach((item) => {
            if (fs.statSync(`${path}/${item}`).isFile()) {
                this.fileList.push(`${path}/${item}`);
            }
        });

        dirList.forEach((item) => {
            if (fs.statSync(`${path}/${item}`).isDirectory()) {
                this.walk(`${path}/${item}`);
            }
        });
    }

    xlsxParse() {
        const tmp = xlsx.parse(this.fileList[0]);
        // 加载主/备胎xlsx数据
        const index = tmp[0].data[0].indexOf('部品类型');
        const kind = (tmp[0].data[1])[index];
        if (this.fileList.length === 1) {
            if (kind === '轮胎主') {
                [this.mainTire] = tmp;
                [, this.spareTire] = tmp;
            } else {
                [, this.mainTire] = tmp;
                [this.spareTire] = tmp;
            }
        } else {
            const tmp1 = xlsx.parse(this.fileList[1]);
            if (kind === '轮胎主') {
                [this.mainTire] = tmp;
                [this.spareTire] = tmp1;
            } else {
                [this.mainTire] = tmp1;
                [this.spareTire] = tmp;
            }
        }
        this.totalQty = this.mainTire.data.length - 1;
        // 各字段index值
        this.no = this.mainTire.data[0].indexOf('NO');
        this.seq = this.mainTire.data[0].indexOf('顺序号');
        this.sheet = this.mainTire.data[0].indexOf('指示票代码');
        this.date = this.mainTire.data[0].indexOf('指示日期');
        this.time = this.mainTire.data[0].indexOf('指示时间');
        this.prod = this.mainTire.data[0].indexOf('品番');
        this.qty = this.mainTire.data[0].indexOf('数量');
        this.note = this.mainTire.data[0].indexOf('备注');
        // 填充主/备胎数据
        let rowData = [];
        this.tireData.main = [];
        this.tireData.spare = [];
        for (let i = 0; i < this.totalQty; i++) {
            rowData = this.mainTire.data[i + 1];
            let jsDateTime = new Date(1900, 0, rowData[this.date] + rowData[this.time] - 0.99999999);
            this.tireData.main.push([
                rowData[this.no],
                rowData[this.seq],
                rowData[this.sheet],
                jsDateTime.toLocaleDateString(),
                jsDateTime.toLocaleTimeString('zh-CN', {hour12: false}),
                rowData[this.prod],
                rowData[this.qty],
                rowData[this.note] ? rowData[this.note] : '',
            ]);
            rowData = this.spareTire.data[i + 1];
            jsDateTime = new Date(1900, 0, rowData[this.date] + rowData[this.time] - 0.99999999);
            this.tireData.spare.push([
                rowData[this.no],
                rowData[this.seq],
                rowData[this.sheet],
                jsDateTime.toLocaleDateString(),
                jsDateTime.toLocaleTimeString('zh-CN', {hour12: false}),
                rowData[this.prod],
                rowData[this.qty],
                rowData[this.note] ? rowData[this.note] : '',
            ]);
        }
        // 填充不完整导入文件数据
        if (this.totalQty !== this.wholeQty) {
            const row = this.tireData.main[this.totalQty - 1];
            this.tireData.uncomplete = [row[0], row[1], row[2], row[5]];
        } else {
            this.tireData.continue = this.tireData.uncomplete[2] === this.tireData.main[0][2];
        }
    }

    /**
     * 获取显示列表，格式为：[NO，顺序号，主胎品番，备胎品番，指示日期，指示时间，备注，状态，出错]
     * 状态：1-等待检测，2-正在检测，3-完成检测
     * 出错：0-无错误，1-有错误
     */
    get showData() {
        const showData = [];
        for (let i = 0; i < this.totalQty; i++) {
            // 查找与主胎对应的备胎索引
            const s = this.tireData.main[i][1];
            let k = -1; // 备胎索引
            for (let j = 0; j < this.tireData.spare.length; j++) {
                if (this.tireData.spare[j][1] === s) {
                    k = j;
                    break;
                }
            }
            const spareProdID = k >= 0 ? this.tireData.spare[k][5] : '';
            const err = spareProdID === '' ? -1 : 1;
            showData.push([
                this.tireData.main[i][0],
                this.tireData.main[i][1],
                this.tireData.main[i][5],
                spareProdID,
                this.tireData.main[i][3],
                this.tireData.main[i][4],
                this.tireData.main[i][7],
                1,
                err,
            ]);
        }
        return showData;
    }
}

module.exports = {
    ImportXlsx,
};
