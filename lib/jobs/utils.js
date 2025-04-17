const _ = require('lodash'),
    log = require('../log'),
    Project = require('../../parsing/project'),
    File = require('../../parsing/file');

const self = {

    checkValue: (value, expect) => {
        let type = expect.type;
        if (!self.checkVariableType(value, type)) {
            log.error('Invalid type: ' + type + ' expected' + ' (got ' + typeof value + ')');
            return false;
        }
        if (type === 'object' && expect.properties) {
            let {check, key} = self.checkObject(value, expect.properties);
            if (!check) {
                log.error('Invalid properties in object');
                // console.log('Invalid properties in object', key, value, expect.properties);
                return false;
            }
        }
        if (type === 'array' && expect.items) {
            for (let item of value) {
                if (!self.checkValue(item, expect.items)) {
                    log.error('Invalid item in array : ' + JSON.stringify(item));
                    return false;
                }
            }
        }
        return true;
    },

    checkObject: (obj, expect, logger) => {
        for (let key in expect) {
            let is_optional = false;
            if (expect[key].optional === true || expect[key].default_value !== undefined) {
                is_optional = true;
            } else if (typeof expect[key].optional === 'function') {
                is_optional = expect[key].optional(obj);
            }
            if (!is_optional && !obj.hasOwnProperty(key)) {
                (logger || log).error('Missing key ' + key + ' in object');
                return {check: false, key: key};
            }
            if (obj.hasOwnProperty(key) && !self.checkValue(obj[key], expect[key])) {
                (logger || log).error('Invalid value for key ' + key + ' in object');
                return {check: false, key: key};
            }
        }
        return {check: true};
    },

    checkVariableType: (variable, type) => {
        if (type === "integer" && !Number.isInteger(variable))
            return false;
        else if ((type === "number" || type === "string" || type === "function" || type === "boolean") && typeof variable != type)
            return false;
        else if (type === "array" && (typeof variable != "object" || variable.constructor !== Array))
            return false;
        else if (type === "object" && (typeof variable != "object" || variable.constructor !== Object))
            return false;
        else if (type === "hex-string" && (typeof variable != "string" || !utils.isHexString(variable)))
            return false;
        else if (type === "db_id" && (typeof variable != "string" || variable.length !== 24 || !utils.isHexString(variable)))
            return false;
        else if (type === 'Project' && !(variable instanceof Project))
            return false;
        else if (type === 'File' && !(variable instanceof File))
            return false;
        return true;
    },

}

module.exports = self;