module.exports = {
    models: {
        'grok-beta': {
            target: 'grok-beta',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.005,
                output: 0.015
            },
            max_total_tokens: 128000,
            max_output_tokens: 4096,
            rate_limits: {
                tpm: 1000000, rps: 1, rpm: 60, rph: 1200
            }
        },
        'grok-2-1212': {
            target: 'grok-2-1212',
            encoding: 'cl100k_base',
            pricing: {
                input: 0.002,
                output: 0.01
            },
            max_total_tokens: 128000,
            max_output_tokens: 4096,
            rate_limits: {
                tpm: 1000000, rps: 1, rpm: 60, rph: 1200
            }
        }
    }
}