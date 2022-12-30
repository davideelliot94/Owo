class Limit {

    constructor(
        fconcurrency,
        flogs,
        fmemory,
        ftimeout
    ) {

        this.fconcurrency = fconcurrency
        this.flogs = flogs
        this.fmemory = fmemory
        this.ftimeout = ftimeout

    }

    get concurrency() {
        return this.fconcurrency
    }

    set concurrency(concurrency) {
        this.fconcurrency = concurrency
    }

    get logs() {
        return this.flogs
    }

    set logs(logs) {
        this.flogs = logs
    }

    get memory() {
        return this.fmemory
    }

    set memory(memory) {
        this.fmemory = memory
    }

    get timeout() {
        return this.ftimeout
    }

    set timeout(timeout) {
        this.ftimeout = timeout
    }

    getJSON() {
        return {
            "concurrency": this.concurrency,
            "logs": this.logs,
            "memory": this.memory,
            "timeout": this.timeout
        }
    }


}

export default Limit;