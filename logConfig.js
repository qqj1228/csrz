const log4js = require('log4js');
const fs = require('fs');

function confirmDir(strDir) {
    if (!fs.existsSync(strDir)) {
        fs.mkdirSync(strDir);
        console.info(`createPath: ${strDir}`);
    }
    return strDir;
}

log4js.configure({
    appenders: {
        out: {
            type: 'dateFile',
            // 文件名为= filename + pattern, 设置为alwaysIncludePattern：true
            filename: confirmDir('./log/'),
            pattern: 'yyyy-MM-dd.log',
            // 包含模型
            alwaysIncludePattern: true,
            daysToKeep: 100,
        },
    },
    categories: {
        default: {
            appenders: ['out'],
            level: 'info',
        },
    },
});

function logger(name) {
    const log = log4js.getLogger(name);
    return log;
}

module.exports = {
    logger,
};
