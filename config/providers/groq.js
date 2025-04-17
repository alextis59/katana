module.exports = {
    models: {
        'deepseek-r1-distill-llama-70b': {
            target: 'deepseek-r1-distill-llama-70b',
            encoding: 'cl100k_base',
            pricing: {
                input: 3,
                output: 3
            },
            max_total_tokens: 32000,
            max_output_tokens: 16384,
            rate_limits: {
                tpm: 6000, rpm: 30, rpd: 1000
            }
        },
        'llama-3.3-70b-versatile': {
            target: 'llama-3.3-70b-versatile',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.59,
                output: 0.79
            },
            max_total_tokens: 8192,
            max_output_tokens: 2048,
            rate_limits: {
                tpm: 6000, rpm: 30, rpd: 14400
            }
        },
    }
}