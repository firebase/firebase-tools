var winston = require('winston');

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      level: 'info',
      showLevel: true
    }),
    new (winston.transports.File)({
      level: 'debug',
      filename: process.cwd() + "/firebase-debug.log",
      json: false
    })
  ]
});

logger.cli();

module.exports = logger;
