class Metric {
    constructor(fduration,
                fwaitTime,
                finitTime,
                factivations,
                fcoldStarts,
                farrivalRate,
                fcoldStartDuration
              ) {
       this.fduration = fduration;
       this.fwaitTime = fwaitTime;
       this.finitTime = finitTime;
       this.factivations = factivations;
       this.fcoldStarts = fcoldStarts;
       this.farrivalRate = farrivalRate
       this.fcoldStartDuration = fcoldStartDuration
    }

    get duration(){
      return this.fduration;
    }

    set duration(duration){
      this.fduration = duration;
    }

    get waitTime(){
      return this.fwaitTime;
    }

    set waitTime(waitTime){
      this.fwaitTime = waitTime;
    }

    get initTime(){
      return this.finitTime;
    }

    set initTime(initTime){
      this.finitTime = initTime;
    }

    get activations(){
      return this.factivations;
    }

    set activations(activations){
      this.factivations = activations;
    }

    get coldStarts(){
      return this.fcoldStarts;
    }

    set coldStarts(coldStarts){
      this.fcoldStarts = coldStarts;
    }

    get coldStartsRate(){
      return this.fcoldStarts / this.factivations
    }

    get arrivalRate(){
      return this.farrivalRate
    }

    set arrivalRate(arrivalRate){
      this.farrivalRate = arrivalRate
    }

    get coldStartDuration(){
      return this.fcoldStartDuration
    }

    set coldStartDuration(coldStartDuration){
      this.fcoldStartDuration = coldStartDuration
    }
}

export default Metric