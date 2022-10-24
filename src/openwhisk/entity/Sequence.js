class Sequence {

    constructor(sname,
                sfuncs,
                smetrics,
                ) {
        this.sname = sname
        this.sfuncs = sfuncs
        this.smetrics = smetrics
    }


    /**
     * GETTERS AND SETTERS
     */
    
    get name() {
        return this.sname
    }
    
    set name(name) {
        this.sname = name
    }

    get funcs() {
        return this.sfuncs
    }

    set funcs(funcs) {
        this.sfuncs = funcs
    }

    get metrics() {
        return this.smetrics
    }

    set metrics(metrics) {
        this.smetrics = metrics
    }
  
}

  export default Sequence;