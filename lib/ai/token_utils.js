const { get_encoding, encoding_for_model } = require("@dqbd/tiktoken"),
    logger = require('../log'),
    config = require('../../config'),
    ai_config = config.llm_providers,
    moment = require('moment'),
    utils = require('../utils'),
    _ = require('lodash');

const ENCODINGS = {
    "cl100k_base": get_encoding("cl100k_base")
}

let session_token_counts = {};

let current_tracking = {};

function getModel(provider, model){
    if(!ai_config[provider]){
        throw new Error('Unknown provider: ' + provider);
    }else if(!ai_config[provider].models[model]){
        throw new Error('Unknown model: ' + model);
    }
    return ai_config[provider].models[model];
}

function getProviderFromModel(model){
    for(let provider in ai_config){
        if(ai_config[provider].models[model]){
            return provider;
        }
    }
    throw new Error('Unknown model: ' + model);
}

const self = {

    getModel: getModel,

    getEncoding: (provider = 'openai', model = 'gpt-3.5-turbo') => {
        return ENCODINGS[getModel(provider, model).encoding];
    },

    encodeStr: (str, provider = 'openai', model = 'gpt-3.5-turbo') => {
        const encoding = self.getEncoding(provider, model);
        return encoding.encode(str);
    },

    getStringListTokens: (str_list, provider = 'openai', model = 'gpt-3.5-turbo') => {
        let tokens = [];
        for(let str of str_list){
            let str_tokens = self.encodeStr(str, model, provider);
            for(let token of str_tokens){
                if(!tokens.includes(token)){
                    tokens.push(token);
                }
            }
        }
        return tokens;
    },

    getStringListTokensBiasMap: (str_list, options = {}) => {
        let tokens = self.getStringListTokens(str_list, options.provider, options.model),
            bias_map = {},
            bias_weight = options.bias_weight || 1;
        for(let token of tokens){
            bias_map[token] = bias_weight;
        }
        return bias_map;
    },

    getTokenCount: (prompt, provider = 'openai', model = 'gpt-3.5-turbo') => {
        const encoding = self.getEncoding(provider, model);
        return encoding.encode(prompt).length;
    },

    getMessagesTokenCount: (messages, provider = 'openai', model = 'gpt-3.5-turbo') => {
        let token_count = 0;
        messages = _.isArray(messages) ? messages : [messages];
        for (let i = 0; i < messages.length; i++) {
            token_count += self.getTokenCount(_.isString(messages[i]) ? messages[i] : JSON.stringify(messages[i]), provider, model);
        }
        return token_count;
    },

    computeMaxTokenCount: (provider, model, messages) => {
        let target_model = getModel(provider, model),
            max_total_tokens = target_model.max_total_tokens,
            max_output_tokens = target_model.max_output_tokens,
            messages_token_count = self.getMessagesTokenCount(messages, provider, model);
        return Math.min(max_total_tokens - messages_token_count, max_output_tokens);
    },

    getTokenCost: (provider, model, type) => {
        return getModel(provider, model).pricing[type] || 0;
    },

    getModelTokenCost: (provider, model, counts, decimals = 4) => {
        return _.round((self.getTokenCost(provider, model, 'input') * counts.input 
            + self.getTokenCost(provider, model, 'cached_input') * counts.cached_input
            + self.getTokenCost(provider, model, 'output') * counts.output) / 1000000, decimals);
    },

    getSessionCost: (session) => {
        let cost = 0;
        for (let model in session) {
            cost += self.getModelTokenCost(getProviderFromModel(model), model, session[model]);
        }
        return cost;
    },

    trackTokenUsage: (model, token_usage) => {
        if (config.LOG_LEVEL >= 6) {
            console.log('TokenTracking: Tracking token usage for model ' + model + ': ' + JSON.stringify(token_usage));
        }
        if (!session_token_counts[model]) {
            session_token_counts[model] = {
                input: 0,
                cached_input: 0,
                output: 0
            }
        }
        let cached_input = _.get(token_usage, 'prompt_tokens_details.cached_tokens', 0),
            input = token_usage.prompt_tokens - cached_input;
        session_token_counts[model].input += input;
        session_token_counts[model].cached_input += cached_input;
        session_token_counts[model].output += token_usage.completion_tokens;
        if (config.LOG_LEVEL >= 5) {
            self.printSessionTokenUsage();
        }
        self.updateTracking(model, token_usage);
    },

    startTracking: (key) => {
        current_tracking[key] = {
            start: moment(),
            session: {}
        }
    },

    getTrackingCost: (key) => {
        return self.getSessionCost(current_tracking[key].session);
    },

    stopTracking: (key) => {
        let tracking = current_tracking[key];
        if (tracking) {
            tracking.end = moment();
            let total_input_cost = 0, total_output_cost = 0;
            for(let model in tracking.session){
                let input_cost = self.getTokenCost(model, 'input') * tracking.session[model].input,
                    output_cost = self.getTokenCost(model, 'output') * tracking.session[model].output;
                total_input_cost += input_cost;
                total_output_cost += output_cost; 
                tracking.session[model].input_cost = _.round(input_cost / 1000000, 2);
                tracking.session[model].output_cost = _.round(output_cost / 1000000, 2);
            }
            tracking.cost = _.round((total_input_cost + total_output_cost) / 1000000, 2);
            tracking.input_cost = _.round(total_input_cost / 1000000, 2);
            tracking.output_cost = _.round(total_output_cost / 1000000, 2);
            delete current_tracking[key];
            return tracking;
        }
    },

    updateTracking: (model, token_usage) => {
        for (let key in current_tracking) {
            let tracking = current_tracking[key];
            if (!tracking.session[model]) {
                tracking.session[model] = {
                    input: 0,
                    output: 0
                }
            }
            tracking.session[model].input += token_usage.prompt_tokens;
            tracking.session[model].output += token_usage.completion_tokens;
        }
    },

    resetSessionTokenUsage: () => {
        session_token_counts = {};
    },

    formatTokenUsage: (token_usage, options = {}) => {
        let str = 'Token usage:\n' + 
            'Total cost: ' + token_usage.cost + '$\n' +
            'Input cost: ' + token_usage.input_cost + '$\n' +
            'Output cost: ' + token_usage.output_cost + '$\n';
        if(token_usage.start && token_usage.end){
            str += 'Start: ' + token_usage.start.format('YYYY-MM-DD_HH-mm-ss') + '\n' +
                'End: ' + token_usage.end.format('YYYY-MM-DD_HH-mm-ss') + '\n' + 
                'Duration: ' + utils.humanReadableTimeDiff(token_usage.start, token_usage.end) + '\n';
        }
        if(options.details){
            for(let model in token_usage.session){
                let usage = token_usage.session[model];
                str += model + ': input=' + usage.input + ' ,output=' +
                usage.output + ' (' + (usage.input_cost + usage.output_cost) + '$)\n';
            }
        }
        return str;
    },

    printSessionTokenUsage: () => {
        if(config.log.hide_token_usage) return;
        // logger.log(0, 'TokenTracking: Session token usage:');
        console.log('TokenTracking: Session token usage:')
        for (let model in session_token_counts) {
            // logger.log(0, model + ': input=' + session_token_counts[model].input + ' ,output=' +
            //     session_token_counts[model].output + ' (' + self.getModelTokenCost(getProviderFromModel(model), model, session_token_counts[model]) + '$)');
            console.log(
                model + ': input=' + session_token_counts[model].input + 
                ' ,cached_input=' + session_token_counts[model].cached_input +
                ' ,output=' + session_token_counts[model].output +
                 ' (' + self.getModelTokenCost(getProviderFromModel(model), model, session_token_counts[model]) + '$)');
        }
    },

    computeSessionTotalCost: (decimals = 4) => {
        let total_cost = 0;
        for (let model in session_token_counts) {
            total_cost += self.getModelTokenCost(getProviderFromModel(model), model, session_token_counts[model], 4);
        }
        return _.round(total_cost, decimals);
    }

}

module.exports = self;