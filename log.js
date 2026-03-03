const { createLogger, format, transports } = require("winston");
const moment = require("moment");
require("moment-timezone");
const { combine, printf } = format;

moment.tz.setDefault("Asia/Seoul");
const timestamp_format = () => moment().format("YYYY-MM-DD HH:mm:ss");

const loggingFormat = printf(({ level, message }) => {
    return `${timestamp_format()} ${level}: ${message}`;
});

const infoTransport = new transports.Console({
    level: "info",
});

const errorTransport = new transports.Console({
    level: "error",
});

const logger = createLogger({
    format: combine(loggingFormat),
    transports: [infoTransport, errorTransport],
});

const stream = {
    write: (message) => {
        logger.info(message);
    },
};

module.exports = { logger, stream };