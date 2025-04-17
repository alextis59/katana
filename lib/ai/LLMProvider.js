const { Configuration, OpenAIApi } = require("openai"),
    _ = require('lodash'),
    log = require('../log'),
    token_utils = require('./token_utils'),
    RateLimiter = require('./RateLimiter'),
    utils = require('side-flip/utils');

const default_request_timeout = 60000;

const o1_params = ['model', 'messages'];

function filterParams(params){
    if(params.model === 'o1-mini' || params.model === 'o1-preview'){
        let new_params = {};
        for(let key of o1_params){
            new_params[key] = params[key];
        }
        return new_params;
    }
    return params;
}

class LLMProvider {

    name = 'LLMProvider';

    options = {};

    rate_limiter = null;

    max_retry_count = 2;

    multiple_response_support = false;

    constructor(name, options = {}) {
        this.name = name;
        this.options = options;
        this.rate_limiter = new RateLimiter(name);
        if(options.multiple_response_support){
            this.multiple_response_support = true;
        }
    }

    buildParams = (context) => {
        let messages = context.messages,
            functions = context.functions,
            options = context.options || {};
        let params = {
            model: options.model || this.options.default_model,
            n: options.n || 1,
            temperature: 0.5
        };
        if (options.completion) {
            params.prompt = messages;
        } else {
            params.messages = messages;
        }
        if(options.system_prompt && !_.find(params.messages, {role: 'system', content: options.system_prompt})){
            params.messages.unshift({
                role: 'system',
                content: options.system_prompt
            });
        }
        if (options.temperature !== undefined) {
            params.temperature = options.temperature;
        }
        if (options.top_p !== undefined) {
            params.top_p = options.top_p;
            if (options.temperature === undefined) {
                delete params.temperature;
            }
        }
        if (options.presence_penalty !== undefined) {
            params.presence_penalty = options.presence_penalty;
        }
        if (options.frequency_penalty !== undefined) {
            params.frequency_penalty = options.frequency_penalty;
        }
        if (options.stop) {
            params.stop = options.stop;
        }
        if (options.best_of) {
            params.best_of = options.best_of;
        }
        if (options.suffix) {
            params.suffix = options.suffix;
        }
        if (options.logit_bias) {
            params.logit_bias = options.logit_bias;
        }

        if (options.max_tokens) {
            params.max_tokens = options.max_tokens;
        } else {
            let messages_token_count = token_utils.getMessagesTokenCount(messages, this.name, params.model);
            let max_token_count = token_utils.computeMaxTokenCount(this.name, params.model, messages);
            this.log(6, 'Messages token count: ' + messages_token_count);
            this.log(6, 'Max token count: ' + max_token_count);
            if (max_token_count <= 0) {
                this.log(0, 'Max token count exceeded');
                throw new Error(this.name + ': Max token count exceeded');
            }
            params.max_tokens = max_token_count;
        }
        if (functions && functions.length > 0) {
            params.functions = functions;
            params.function_call = options.function_call || 'auto';
        }
        if(options.expect_json){
            params.response_format = {type: 'json_object'};
        }
        return filterParams(params);
    }

    getChatCompletion = async (context, retry_count = 0) => {
        this.log(3, 'Generating chat completion');
        let messages = context.messages,
            options = context.options || {},
            n = options.n || 1;
        if (n > 1 && !this.multiple_response_support) {
            let results = [];
            for (let i = 0; i < n; i++) {
                results.push(await this.getChatCompletion(_.merge({}, context, { options: { n: 1 } })));
            }
            return results;
        }
        if (typeof messages === 'string' && !options.completion) {
            context.messages = [{ role: 'user', content: messages }];
        }
        let params = this.buildParams(context);
        await this.rate_limiter.waitForAvailability(params, options);
        let request_id = await this.rate_limiter.onNewRequest(params, options);
        this.logInputs(request_id, params, context);

        try {
            const response = await Promise.race([
                this.processCompletionRequest(params, context),
                utils.timeout(_.get(this.options, 'request_timeout', default_request_timeout))
            ]);
            if (response.data.error) {
                throw new Error(response.data.error);
            }
            let token_usage = this.getTokenUsage(response),
                results = await this.processResults(response, context);

            token_utils.trackTokenUsage(params.model, token_usage);
            await this.rate_limiter.onRequestEnd(request_id, token_usage);

            this.logOutputs(request_id, results, token_usage, options.prompt_name);
            
            return results;
        } catch (error) {
            // console.log(error);
            // console.log(JSON.stringify(error));
            if(error.toString().includes('429')){
                this.rate_limiter.maxRateReached(params.model);
            }
            await this.rate_limiter.onRequestEnd(request_id);
            this.log(0, `Error generating chat completion`);
            this.logFile(0, request_id + '_error', (error && error.toString && error.toString()) || JSON.stringify(error));
            if (retry_count < this.max_retry_count) {
                return await this.getChatCompletion(context, retry_count + 1);
            }
            return { error: true };
        }
    }

    processCompletionRequest = async (params, context) => {
        throw new Error('Not implemented');
    }

    processResults = async (response, context) => {
        let results = [];
        this.log(6, `Completion responses: `);
        for (let res_choice of response.data.choices) {
            this.log(6, res_choice);
            let message, type, result;
            if (res_choice.text !== undefined) {
                message = { content: res_choice.text };
            } else {
                message = res_choice.message;
            }
            if (message.content) {
                type = 'message';
                result = message.content;
            } else if (message.function_call) {
                result = {
                    name: message.function_call.name,
                    arguments: JSON.parse(message.function_call.arguments)
                }
                type = 'function_call';
            }
            // choice.finish_reason = 'stop' | 'length' | 'function_call'
            results.push({
                type,
                result,
                complete: res_choice.finish_reason !== 'length'
            });
        }
        let options = context.options || {},
            n = options.n || 1;
        results = n === 1 ? results[0] : results;
        if (!_.isArray(results) && !results.complete && results.type === 'message' && !options.completion) {
            context = _.cloneDeep(context);
            context.messages.push({
                role: 'assistant',
                content: results.result
            });
            let next_results = await this.getChatCompletion(context);
            results.result += next_results.result;
            if (next_results.complete) {
                results.complete = true;
            }
            return results;
        } else {
            return results;
        }
    }

    getTokenUsage = (response) => {
        return response.data.usage;
    }

    log = (level, ...args) => {
        log.log(level, this.name + ': ', ...args);
    }

    logFile = (level, path, content) => {
        log.logFile(level, this.name + '/' + path, content);
    }

    logInputs = (id, params, context) => {
        let output = {
            params: params
        }, name = _.get(context, 'options.prompt_name', 'unknown');
        this.logFile(1, id + '_' + name + '_prompt.json', JSON.stringify(output, null, 2));
        this.logFile(1, id + '_' + name + '_prompt.txt', getMessagesDebugString(context.messages, params));
    }

    logOutputs = (id, chat_results, token_usage, name = 'unknown') => {
        this.logFile(1, id + '_' + name + '_results.json', JSON.stringify(Object.assign({token_usage}, chat_results), null, 2));
        let debug_results_file = "";
        let results = _.isArray(chat_results) ? chat_results : [chat_results];
        for(let result of results){
            if(result.type === 'message'){
                debug_results_file += result.result + '\n\n';
            }else if(result.type === 'function_call'){
                debug_results_file += result.result.name + '(' + JSON.stringify(result.result.arguments, null, 2) + ')\n\n';
            }
            debug_results_file += 'Complete: ' + result.complete + '\n\n';
        }
        this.logFile(1, id + '_' + name + '_results.txt', debug_results_file);
    }

}

function getMessagesDebugString(messages, params) {
    if (_.isString(messages)) {
        if (params.suffix) {
            return messages + '[COMPLETION]' + params.suffix;
        }
        return messages;
    }
    let debug_messages_file = "";
    for (let message of messages) {
        debug_messages_file += message.role + ':\n\n' + message.content + '\n\n';
    }
    return debug_messages_file;
}

module.exports = LLMProvider;