const LLMProvider = require('../LLMProvider'),
    config = require('../../../config'),
    utils = require('../../../lib/utils'),
    moment = require('moment'),
    axios = require('axios');

let last_request_ts = moment().subtract(2, 'seconds');

class XAIProvider extends LLMProvider {

    constructor() {
        super('xai', {
            default_model: 'grok-beta',
            request_timeout: config.xai.request_timeout
        });
    }

    processCompletionRequest = async (params, context) => {

        while(moment().diff(last_request_ts, 'milliseconds') < 1000){
            await utils.wait(100);
        }

        let options = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.x.ai/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + config.xai.api_key
            },
            data: params
        };

        let result = await axios(options);
        last_request_ts = moment();
        return result;
    }

}

module.exports = new XAIProvider();