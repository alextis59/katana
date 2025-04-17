const log = require('../log'),
    _ = require('lodash');

class Job {

    name = 'Unnamed Job';

    description = 'No description provided';

    inputs = {};

    outputs = {};

    constructor() {
        this.log.error = (...args) => {
            log.error(this.name + ': ', ...args);
        }
    }

    execute = async (context, options) => {
        this.throw('execute method not implemented');
    }

    restart = async (context, options) => {
        return await this.execute(context, options);
    }

    throw = (reason, ...args) => {
        log.error('Job Error: ' + this.name + ': ' + reason);
        let err;
        if(args.length === 1){
            err = args[0];
        }
        log.logFileJobError(this.name, reason, err);
        throw new Error('Job Error: ' + this.name + ': ' + reason);
    }

    throwWithoutLog = (reason, ...args) => {
        throw new Error('Job Error: ' + this.name + ': ' + reason);
    }

    log = (level, ...args) => {
        log.log(level, this.name + ': ', ...args);
    }

    getDefault = (target) => {
        return _.get(this.inputs, target + '.default_value');
    }
    
}

module.exports = Job;