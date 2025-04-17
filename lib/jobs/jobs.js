const _ = require('lodash'),
    utils = require('./utils'),
    log = require('../log');

const DEBUG = false;

const ENABLE_TIME_LOG = false;

function debugLog(msg) {
    if (DEBUG) {
        console.log(msg);
    }
}

const self = {

    jobs: {},

    job_list: [],

    initialize: () => {
        for (let job of self.job_list) {
            if (job.initialize) {
                job.initialize();
            }
        }
    },

    register: (job) => {
        job.log(5, 'Registering Job');
        job.jobs = self.jobs;

        let execute = async (context, options) => {
            context = _.cloneDeep(context);
            context = _.merge(context, options.additional_context);
            await self.fillJobContext(context, job.inputs);
            self.checkInputs(context, job);
            job.log(5, 'Executing Job');
            try {
                let result = await job.execute(context, options);
                self.checkOutputs(context, result, job);
                if (options.set_output_map) {
                    for (let origin in options.set_output_map) {
                        if (result[origin] !== undefined) {
                            _.set(result, options.set_output_map[origin], _.get(result, origin));
                            _.unset(result, origin);
                        }
                    }
                }
                job.log(5, 'Job Executed');
                return result;
            } catch (err) {
                if (options.retry_count > 0) {
                    job.log(5, 'Job Failed. Retrying');
                    options.retry_count--;
                    return await execute(context, options);
                } else if (options.continue_on_failure) {
                    job.log(5, 'Job Failed. Continuing');
                    return {};
                } else {
                    job.log(5, 'Job Failed');
                    throw err;
                }
            }
        }

        let fn = async (context, options = {}) => {
            return await execute(context, Object.assign({
                retry_count: 0,
                additional_context: {}
            }, options));
        };

        addContextUtils(fn, job);

        self.jobs[job.name] = fn;

        self.job_list.push(job);
    },

    checkInputs: (context, job) => {
        let {check, key} = utils.checkObject(context, job.inputs, job.log);
        if (!check) {
            let cause = new Error('Invalid Job Inputs: ' + job.name + ' => ' + key);
            throw new Error('Invalid Job Inputs: ' + job.name + ' => ' + key, { cause });
        }
    },

    checkOutputs: (context, result, job) => {
        if(context.get_prompt && result.prompt){
            return;
        }
        let {check, key} = utils.checkObject(result, job.outputs, job.log);
        if (!check) {
            let cause = new Error('Invalid Job Outputs: ' + job.name + ' => ' + key);
            throw new Error('Invalid Job Outputs: ' + job.name + ' => ' + key, { cause });
        }
    },

    pipe: (...jobs) => {

        let execute = async (context, options = {}) => {
            context = _.cloneDeep(context);
            context = _.merge(context, options.additional_context);
            debugLog('EXECUTE PIPELINE');
            debugLog(options);
            try {
                if (jobs.length === 1 && _.isArray(jobs[0])) {
                    jobs = jobs[0];
                }
                for (let job of jobs) {
                    let result = await job(context);
                    context = _.merge(context, result);
                }
                if (options.set_output_map) {
                    for (let origin in options.set_output_map) {
                        if (result[origin] !== undefined) {
                            _.set(context, options.set_output_map[origin], _.get(context, origin));
                            _.unset(context, origin);
                        }
                    }
                }
                return context;
            } catch (err) {
                if (options.retry_count > 0) {
                    log.log(5, 'Job Pipeline Failed. Retrying');
                    options.retry_count--;
                    return await execute(context, options);
                } else if (options.continue_on_failure) {
                    log.log(5, 'Job Pipeline Failed. Continuing');
                    return context;
                } else {
                    log.log(5, 'Job Pipeline Failed');
                    throw err;
                }
            }
        };

        let pipeline = async (context, options = {}) => {
            return await execute(context, Object.assign({
                retry_count: 0,
                additional_context: {}
            }, options));
        };

        addContextUtils(pipeline);

        return pipeline;
    },

    fillJobContext: async (context, job_inputs) => {
        for (let key in job_inputs) {
            let input = job_inputs[key];
            if (context[key] === undefined) {
                if (input.default_value !== undefined) {
                    context[key] = input.default_value;
                } 
            }
        }
        for (let key in context) {
            if (context[key] === undefined) {
                delete context[key];
            }
        }
    }

}

function addContextUtils(fn, job) {

    fn.remote = () => {
        debugLog('REMOTE');
        let new_fn = async (context, options = {}) => {
            options.remote_execution = true;
            return await fn(context, options);
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.self = () => {
        return fn;
    }

    fn.set = (target, value) => {
        debugLog('SET: ' + target + ' ' + value);
        let new_fn = async (context, options = {}) => {
            options.additional_context = options.additional_context || {};
            if (typeof target === 'object') {
                Object.assign(options.additional_context, target);
            } else if (typeof target === 'string') {
                options.additional_context[target] = value;
            }
            return await fn(context, options);
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.setFrom = (source, target) => {
        debugLog('SET FROM: ' + source + ' ' + target);
        let new_fn = async (context, options = {}) => {
            options.additional_context = options.additional_context || {};
            options.additional_context[target] = _.get(context, source);
            return await fn(context, options);
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.setOutput = (origin, target) => {
        debugLog('SET OUTPUT: ' + origin + ' ' + target);
        let new_fn = async (context, options = {}) => {
            options.set_output_map = options.set_output_map || {};
            if (typeof origin === 'object') {
                Object.assign(options.set_output_map, origin);
            } else {
                options.set_output_map[origin] = target;
            }
            return await fn(context, options);
        }
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.reset = (target) => {
        debugLog('RESET: ' + target);
        let new_fn = async (context, options = {}) => {
            delete context[target];
            if (options.additional_context) {
                delete options.additional_context[target];
            }
            return await fn(context, options);
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.copy = (source, target) => {
        debugLog('COPY: ' + source + ' ' + target);
        let new_fn = async (context, options = {}) => {
            if (context[source]) {
                options.additional_context = options.additional_context || {};
                options.additional_context[target] = context[source];
            }
            return await fn(context, options);
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.retry = (count) => {
        debugLog('RETRY: ' + count);
        let new_fn = async (context, options = {}) => {
            options.retry_count = count;
            return await fn(context, options);
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.loop = (count) => {
        debugLog('LOOP: ' + count);
        let job_loop = [];
        for (let i = 0; i < count; i++) {
            job_loop.push(fn);
        }
        return self.pipe(job_loop);
    };

    fn.skipIf = (condition_fn) => {
        debugLog('SKIP IF');
        let new_fn = async (context, options = {}) => {
            if (await condition_fn(context)) {
                return context;
            } else {
                return await fn(context, options);
            }
        }
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.executeIf = (condition_fn) => {
        debugLog('EXECUTE IF');
        let new_fn = async (context, options = {}) => {
            if (await condition_fn(context)) {
                return await fn(context, options);
            } else {
                return context;
            }
        }
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.mapOutput = (map_job, map_targets, map_options = {}) => {
        debugLog('MAP OUTPUT: ' + map_job.name + ' ' + map_targets.input.source + ' ' + map_targets.input.target + ' ' + map_targets.output.source + ' ' + map_targets.output.target);
        let new_fn = async (context, options = {}) => {
            let result = await fn(context, options);
            try {
                let map_context = _.cloneDeep(context),
                    input_list_target = map_targets.input.source,
                    input_target = map_targets.input.target,
                    output_list_target = map_targets.output.target,
                    output_target = map_targets.output.source,
                    input_list = _.get(result, input_list_target),
                    output_list = [];
                debugLog('MAP INPUT LIST: ' + input_list.length)
                for (let input of input_list) {
                    map_context[input_target] = input;
                    let map_result = await map_job(map_context, map_options);
                    let output = _.get(map_result, output_target);
                    output_list.push(output);
                    if (map_options.break_check_fn && map_options.break_check_fn(output, map_result)) {
                        break;
                    }
                }
                _.set(result, output_list_target, output_list);
            } catch (err) {
                console.log(err);
                throw err;
            }
            return result;
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };

    fn.continueOnFailure = () => {
        debugLog('CONTINUE ON FAILURE');
        let new_fn = async (context, options = {}) => {
            options.continue_on_failure = true;
            return await fn(context, options);
        }
        addContextUtils(new_fn, job);
        return new_fn;
    };

    // Compute and display the time taken by the job
    fn.time = () => {
        let new_fn = async (context, options = {}) => {
            let start = Date.now();
            let result = await fn(context, options);
            let end = Date.now();
            if(ENABLE_TIME_LOG){
                console.log('Time taken by job ' + job.name + ': ' + (end - start) + 'ms');
            }
            return result;
        };
        addContextUtils(new_fn, job);
        return new_fn;
    };


    if (job) {

        fn._job = job;

        fn.name = job.name;

        fn.benchmark = job.benchmark;

        fn.getPromptTemplate = () => {
            return job.getPromptTemplate();
        };

        fn.printPrompt = () => {
            job.printPrompt();
        };

        fn.getPrompt = () => {
            return job.prompt;
        };

        fn.getPromptModel = () => {
            return job.prompt_model;
        };

        fn.getPromptMessages = () => {
            return job.messages || [];
        };

        fn.getJobInputs = () => {
            return job.inputs;
        };

        fn.overrideMessages = (messages_or_target) => {
            let original_messages = job.messages;
            console.log('OVERRING MESSAGES: ')
            console.log(messages_or_target);
            let new_fn = async (context, options = {}) => {
                try {
                    job.messages = _.isArray(messages_or_target) ? messages_or_target : _.get(context, messages_or_target);
                    let result = await fn(context, options);
                    job.messages = original_messages;
                    return result;
                } catch (err) {
                    job.messages = original_messages;
                    throw err;
                }
            };
            addContextUtils(new_fn, job);
            return new_fn;
        };

        fn.overrideChatOptions = (override_options) => {
            let original_chat_options = job.chat_options;
            let new_fn = async (context, options = {}) => {
                try {
                    job.chat_options = Object.assign(_.cloneDeep(original_chat_options), override_options);
                    let result = await fn(context, options);
                    job.chat_options = original_chat_options;
                    return result;
                } catch (err) {
                    job.chat_options = original_chat_options;
                    throw err;
                }
            };
            addContextUtils(new_fn, job);
            return new_fn;
        };

        fn.promptModelOverride = (model) => {
            let new_fn = async (context, options = {}) => {
                options.prompt_model_override = model;
                return await fn(context, options);
            };
            addContextUtils(new_fn, job);
            return new_fn;
        };

        fn.promptVariant = (variant_options = {}) => {
            let original_messages = job.messages;
            let new_fn = async (context, options = {}) => {
                try {
                    if (!fn.prompt_variant_messages) {
                        let improve_job_context = {
                            job: self.jobs[job.name]
                        };
                        if (variant_options.include_resource_values) {
                            improve_job_context.include_resource_values = true;
                            Object.assign(improve_job_context, context);
                        }
                        fn.prompt_variant_messages = (await self.improve_prompt.retry(5)(improve_job_context)).prompt_messages;
                    }
                    job.messages = fn.prompt_variant_messages;
                    let result = await fn(context, options);
                    job.messages = original_messages;
                    return result;
                } catch (err) {
                    job.messages = original_messages;
                    throw err;
                }
            };
            addContextUtils(new_fn, job);
            return new_fn;
        };

        fn.override = (options = {}) => {
            let new_fn = fn;
            if (options.context) {
                new_fn = new_fn.set(options.context);
            }
            if (options.messages) {
                new_fn = new_fn.overrideMessages(options.messages);
            } else if (options.prompt_variant) {
                new_fn = new_fn.promptVariant(options.prompt_variant_options);
            }
            if (options.chat_options) {
                new_fn = new_fn.overrideChatOptions(options.chat_options);
            }
            return new_fn;
        }

    }

}

global.jobs = self;

module.exports = self;