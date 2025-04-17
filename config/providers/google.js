module.exports = {
    models: {
        'gemini-2.0-flash-lite-preview-02-05': {
            target: 'gemini-2.0-flash-lite-preview-02-05',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.075,
                output: 0.3
            },
            max_total_tokens: 1000000,
            max_output_tokens: 8192,
            rate_limits: {
                tpm: 1000000, rpm: 30, rpd: 1500
            }
        },
        'gemini-2.0-flash': {
            target: 'gemini-2.0-flash',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.1,
                output: 0.4
            },
            max_total_tokens: 1000000,
            max_output_tokens: 8192,
            rate_limits: {
                tpm: 1000000, rpm: 15, rpd: 1500
            }
        },
        'gemini-2.0-flash-thinking-exp-01-21': {
            target: 'gemini-2.0-flash-thinking-exp-01-21',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.000075,
                output: 0.0003
            },
            max_total_tokens: 1000000,
            max_output_tokens: 8192,
            rate_limits: {
                tpm: 1000000, rpm: 10, rpd: 5000
            }
        },
        'gemini-2.0-pro-exp-02-05': {
            target: 'gemini-2.0-pro-exp-02-05',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.000075,
                output: 0.0003
            },
            max_total_tokens: 1000000,
            max_output_tokens: 8192,
            rate_limits: {
                tpm: 1000000, rpm: 2, rpd: 50
            }
        }
    }
}