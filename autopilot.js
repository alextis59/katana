const job_list = require('./jobs/job_list'),
    jobs = require('./lib/jobs/jobs');

for(let job of job_list){
    jobs.register(job);
}

jobs.initialize();

module.exports = {
    jobs: jobs.jobs,
    pipe: jobs.pipe,
    registerJob: jobs.register
}