const Job = require('../../lib/jobs/Job');

class JobTemplate extends Job {

    name = 'job_template';

    description = 'Job template';

    inputs = {
        foo: {
            type: 'string',
            description: 'Foo'
        },
    };

    outputs = {
        bar: {
            type: 'string',
            description: 'Bar'
        }
    };

    execute = async (context) => {
        // Your code here
    }

}

module.exports = JobTemplate;