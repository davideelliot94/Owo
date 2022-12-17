class Action {

    constructor(fname,
                fcode,
                finvocation,
                fparam,
                fbinary,
                fdependencies,
                fkind,
                fasynch,
                flimits,
                fmetrics,
                fcode_size,
                ffile_list
                ) {
        this.fname = fname
        this.fcode = fcode
        this.finvocation = finvocation
        this.fparam = fparam
        this.fbinary = fbinary
        this.fdependencies = fdependencies
        this.fkind = fkind
        this.fasynch = fasynch
        this.flimits = flimits
        this.fmetrics = fmetrics
        this.fto_merge = false
        this.fcode_size = fcode_size
        this.ffile_list = ffile_list
    }


    /**
     * GETTERS AND SETTERS
     */
    
    get name() {
        return this.fname
    }
    
    set name(name) {
        this.fname = name
    }

    get code() {
        return this.fcode
    }

    set code(code) {
        this.fcode = code
    }

    get invocation() {
        return this.finvocation
    }

    set invocation(invocation) {
        this.finvocation = invocation
    }

    get param() {
        return this.fparam
    }

    set param(param) {
        this.fparam = param
    }

    get binary() {
        return this.fbinary
    }

    set binary(binary) {
        this.fbinary = binary
    }

    get dependencies() {
        return this.fdependencies
    }

    set dependencies(dependencies) {
        this.fdependencies = dependencies
    }

    get kind() {
        return this.fkind
    }

    set kind(kind) {
        this.fkind = kind
    }


    get asynch() {
        return this.fasynch
    }

    set asynch(asynch) {
        this.fasynch = asynch
    }

    get limits() {
        return this.flimits
    }

    set limits(limits) {
        this.flimits = limits
    }

    get metrics() {
        return this.fmetrics
    }

    set metrics(metrics) {
        this.fmetrics = metrics
    }

    get code_size() {
        return this.fcode_size
    }

    set code_size(code_size){
        this.fcode_size = code_size
    }

    get to_merge(){
        return this.fto_merge
    }

    set to_merge(to_merge){
        this.fto_merge = to_merge
    }

    get file_list(){
        return this.ffile_list
    }
}

  export default Action;