module.exports = {
    type: 'object',
    description: 'Target for task',
    properties: {
        name: {
            type: 'string',
            description: 'Name of the function to extract'
        },
        type: {
            type: 'string',
            description: 'Type of the target to extract'
        },
        internal: {
            type: 'boolean',
            description: 'Whether the target is internal or not',
            default_value: false
        },
        method: {
            type: 'string',
            description: 'Method of the target',
            optional: true
        },
        variable: {
            type: 'string',
            description: 'Variable of the target',
            optional: true
        }
    }
}