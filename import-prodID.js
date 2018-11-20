const xlsx = require('node-xlsx');

class ImportProdID {
    constructor(prodIDFile) {
        this.prodIDFile = prodIDFile;
        // 各字段index值
        this.prodIDIndex = 0;
        this.sensorIDIndex = 0;
        this.qtyModIndex = 0;
        // 品番数据，{品番: [TPMS传感器编号, 轮胎数量调整]}
        this.prodIDData = {};
        // 打印设置index值
        this.resultIndex = 0;
        this.printIndex = 0;
        // 打印设置值
        this.resultFile = '';
        this.printDir = '';
    }

    load() {
        this.prodIDParse();
    }

    prodIDParse() {
        const tmp = xlsx.parse(this.prodIDFile);
        this.prodIDIndex = tmp[0].data[0].indexOf('品番');
        this.sensorIDIndex = tmp[0].data[0].indexOf('TPMS传感器编号');
        this.qtyIndex = tmp[0].data[0].indexOf('轮胎数量调整');
        this.resultIndex = tmp[2].data[0].indexOf('result_file');
        this.printIndex = tmp[2].data[0].indexOf('print_dir');
        this.prodIDData = {};
        let qtyMod = 0;
        for (let i = 1; i < tmp[0].data.length; i++) {
            qtyMod = Number.isNaN(+tmp[0].data[i][this.qtyIndex]) ? 0 : (+tmp[0].data[i][this.qtyIndex]);
            this.prodIDData[tmp[0].data[i][this.prodIDIndex]] = [+tmp[0].data[i][this.sensorIDIndex], qtyMod];
        }
        this.resultFile = tmp[2].data[1][this.resultIndex];
        this.printDir = tmp[2].data[1][this.printIndex];
    }
}

module.exports = {
    ImportProdID,
};
