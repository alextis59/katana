module.exports = {
    models: {
        'gpt-4o': {
            target: 'gpt-4o',
            encoding: 'cl100k_base',
            pricing: {
                input: 2.5,
                cached_input: 1.25,
                output: 10
            },
            max_total_tokens: 128000,
            max_output_tokens: 4096,
            rate_limits: {
                tpm: 100000, rpm: 500, rpd: 10000
            }
        },
        'gpt-4o-mini': {
            target: 'gpt-4o-mini',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.15,
                cached_input: 0.075,
                output: 0.6
            },
            max_total_tokens: 128000,
            max_output_tokens: 4096,
            rate_limits: {
                tpm: 1000000, rpm: 10000, rpd: 10000
            }
        },
        'o3-mini': {
            target: 'o3-mini',
            encoding: 'cl100k_base',
            pricing: {
                input: 1.1,
                cached_input: 0.55,
                output: 4.4
            },
            max_total_tokens: 128000,
            max_output_tokens: 4096,
            rate_limits: {
                tpm: 1000000, rpm: 10000, rpd: 10000
            }
        }
    }
}