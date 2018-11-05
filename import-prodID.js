const xlsx = require('node-xlsx');

class ImportProdID {
    constructor(prodIDFile) {
        this.prodIDFile = prodIDFile;
        // 各字段index值
        this.prodIDIndex = 0;
        this.sensorIDIndex = 0;
        // 品番数据
        this.prodIDData = {};
    }

    load() {
        this.prodIDParse();
    }

    prodIDParse() {
        const tmp = xlsx.parse(this.prodIDFile);
        this.prodIDIndex = tmp[0].data[0].indexOf('品番');
        this.sensorIDIndex = tmp[0].data[0].indexOf('TPMS传感器编号');
        this.prodIDData = {};
        for (let i = 1; i < tmp[0].data.length; i++) {
            this.prodIDData[tmp[0].data[i][this.prodIDIndex]] = +tmp[0].data[i][this.sensorIDIndex];
        }
    }
}

module.exports = {
    ImportProdID,
};
