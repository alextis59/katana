const _ = require('lodash'),
    utils = require('side-flip/utils'),
    config = require('../../config'),
    ai_config = config.llm_providers,
    moment = require('moment'),
    fse = require('fs-extra'),
    path = require('path'),
    token_utils = require('./token_utils');

let request_history_path = path.join(__dirname, 'request_history');

class RateLimiter {

    provider = '';

    ongoing_requests = {};

    finished_requests = {};

    last_granted_availability = moment();

    history_path = '';

    request_history = {};

    current_id = 1;

    processing = false;

    processing_availability = false;

    max_rate_reached = {};

    max_rate_reached_timeout = {};

    constructor(provider) {
        if (!ai_config[provider]) {
            throw new Error('Unknown provider: ' + provider);
        }
        this.provider = provider;
        this.history_path = path.join(request_history_path, provider + '_request_history.json');
        if (!fse.existsSync(this.history_path)) {
            fse.ensureFileSync(this.history_path);
            fse.writeJsonSync(this.history_path, {});
        }
        this.request_history = fse.existsSync(this.history_path) ? fse.readJsonSync(this.history_path) : {};
    }

    getModel = (model) => {
        if (!ai_config[this.provider].models[model]) {
            throw new Error('Unknown model: ', model);
        }
        return ai_config[this.provider].models[model];
    }

    getRateLimits = (model) => {
        return this.getModel(model).rate_limits;
    }

    computePotentialOutputTokenCount = (params, options) => {
        let output_token;
        if (params.max_tokens) {
            output_token = params.max_tokens;
        } else if (params.model) {
            output_token = this.getModel(params.model).max_output_tokens;
        } else {
            output_token = 2048;
        }
        return output_token * (params.n || 1);
    }

    maxRateReachedCount = 0;

    maxRateReached = (model) => {
        console.log('Max rate reached for provider ' + this.provider + ' model ' + model + ', waiting 60s...');
        this.max_rate_reached[model] = true;
        clearTimeout(this.max_rate_reached_timeout[model]);
        this.max_rate_reached_timeout[model] = setTimeout(() => {
            this.max_rate_reached[model] = false;
        }, 60000);
        this.maxRateReachedCount++;
        if(this.maxRateReachedCount > 50){
            console.log('Max rate reached too many times, exiting...');
            process.exit(0);
        }
    }

    waitEndOfProcessing = async () => {
        while (this.processing) {
            await utils.wait(100);
        }
        this.processing = true;
    }

    waitEndOfAvailabilityProcessing = async () => {
        while (this.processing_availability) {
            await utils.wait(100);
        }
        this.processing_availability = true;
    }

    onNewRequest = async (params, options = {}) => {
        let model = params.model,
            input_tokens = token_utils.getTokenCount(params.prompt ? params.prompt : JSON.stringify(params.messages), this.provider, params.model),
            output_tokens = this.computePotentialOutputTokenCount(params, options),
            id = this.current_id++,
            request = {
                id: id,
                model: model,
                ts: moment(),
                n: params.n || 1,
                input_tokens: input_tokens,
                output_tokens: output_tokens,
                prompt_name: options.prompt_name
            };
        await this.waitEndOfProcessing();
        this.ongoing_requests[model] = this.ongoing_requests[model] || [];
        this.ongoing_requests[model].push(request);
        this.processing = false;
        return id;
    }

    findRequest = (id) => {
        for (let model in this.ongoing_requests) {
            let request = _.find(this.ongoing_requests[model], { id: id });
            if (request) {
                return request;
            }
        }
        return null;
    }

    incrementeRequestHistory = (model) => {
        let today = getToday();
        this.request_history[today] = this.request_history[today] || {};
        this.request_history[today][model] = this.request_history[today][model] || 0;
        this.request_history[today][model]++;
        fse.writeJsonSync(this.history_path, this.request_history);
    }

    getTodayRequestCount = (model) => {
        return _.get(this.request_history, getToday() + '.' + model, 0);
    }

    onRequestEnd = async (id, token_usage) => {
        await this.waitEndOfProcessing();
        let request = this.findRequest(id);
        if (request) {
            let model = request.model;
            this.ongoing_requests[model] = _.without(this.ongoing_requests[model], request);
            request.ts = moment();
            if (token_usage) {
                request.input_tokens = token_usage.prompt_tokens;
                request.output_tokens = token_usage.completion_tokens;
            }
            this.finished_requests[model] = this.finished_requests[model] || [];
            this.finished_requests[model].push(request);
            this.incrementeRequestHistory(model);
        }
        this.processing = false;
    }

    computeCurrentTokenRate = (model) => {
        let total_tokens = 0, total_requests = 0;
        for (let request of (this.ongoing_requests[model] || [])) {
            total_tokens += request.input_tokens + request.output_tokens;
        }
        total_requests += (this.ongoing_requests[model] || []).length;
        let filtered_finished_requests = _.filter(this.finished_requests[model] || [], (r) => {
            return moment().diff(r.ts, 'seconds') <= 60;
        });
        for (let request of filtered_finished_requests) {
            total_tokens += request.input_tokens + request.output_tokens;
        }
        total_requests += filtered_finished_requests.length;
        let today_requests = this.getTodayRequestCount(model);
        return {
            tpm: total_tokens,
            rpm: total_requests,
            rpd: today_requests
        };
    }

    waitForAvailability = async (params, options) => {
        await this.waitEndOfAvailabilityProcessing();
        let model = params.model,
            input_tokens = token_utils.getTokenCount(params.prompt ? params.prompt : JSON.stringify(params.messages), this.provider, model),
            output_tokens = this.computePotentialOutputTokenCount(params, options);
        while (moment().diff(this.last_granted_availability, 'milliseconds') < 200) {
            await utils.wait(50);
        }
        let rate_limits = this.getRateLimits(model),
            need_wait = true;

        while (need_wait) {
            need_wait = false;
            if (this.max_rate_reached[params.model]) {
                need_wait = true;
            } else {
                let current_token_rate = this.computeCurrentTokenRate(model);
                if ((current_token_rate.tpm + input_tokens + output_tokens) >= rate_limits.tpm
                    || (current_token_rate.rpm + 1) >= rate_limits.rpm) {
                    need_wait = true;
                }
                if (rate_limits.rpd != null && (current_token_rate.rpd + 1) >= rate_limits.rpd) {
                    console.log('Max RPD reached for model ' + model + ', need to wait 24h...');
                    process.exit(0);
                }
            }
            if (need_wait) {
                await utils.wait(200);
            }
        }
        this.last_granted_availability = moment();
        this.processing_availability = false;
    }

}

function getToday() {
    return moment().format('YYYY-MM-DD');
}

module.exports = RateLimiter;