const _ = require('lodash'),
    config = require('../config'),
    moment = require('moment'),
    path = require('path'),
    fse = require('fs-extra');

const current_session_key = moment().format('YYYY-MM-DD_HH-mm-ss');

function getLogPath(){
    return path.join(__dirname, '..', config.log.path);
}

const log = {

    current_session_key: current_session_key,

    log: (level, ...args) => {
        if (config.log.enabled && level <= config.log.level) {
            console.log(...args);
            try{
                if(config.log.log_file){
                    let log_path = getLogPath() + '/' + current_session_key + '.log';
                    if(!fse.existsSync(log_path)){
                        fse.ensureFileSync(log_path);
                    }
                    fse.appendFileSync(log_path, args.join(' ') + '\n');
                }
            }catch(e){
                console.log('Error writing to log file: ' + e);
            }
        }
    },

    error: (...args) => {
        log.log(0, "Error:", ...args);
    },

    logFile: (level, path, content) => {
        if(level <= config.log.level) {
            try{
                fse.outputFileSync(getLogPath() + '/' + current_session_key + '/' + path, content);
            }catch(e){
                console.log('Error writing to log file: ' + e);
            }
        }
    },

    logFileJobError: (job_name, reason, err) => {
        let ts = moment().format('HH_mm_ss'),
            target_file = 'job_errors/' + ts + '_' + job_name + '.error';
        let error = {reason: reason};
        if(err){
            error.err = err;
        }
        log.logFile(0, target_file, JSON.stringify(error, null, 4));
    }

};

module.exports = log;