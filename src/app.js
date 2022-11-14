import express from 'express';
import * as handler from "./handler.js"
import * as sim_handler from "./sim_handler.js"

const app = express();
app.use(express.json());

/**
 * ------------------------------------------------------
 *  
 *                       ROUTES 
 * 
 * ------------------------------------------------------
 *  */

app.get("/", (req, res) => {
    res.json({ "response": "Service up and running!" });
});

/**
 * METRICS
 */

app.post("/api/v1/metrics/get", handler.getMetrics);


/**
 * OPTIMIZATION
 */

app.post("/api/v1/sequence/merge", handler.mergeSequence);

app.post("/api/v1/sequence/optimize", handler.optimizeSequence);

app.post("/api/v1/sequence/optimize2", handler.optimizeSequenceTest);

/** 
 * 
 * SIMULATION 
 * 
 * */

app.post("api/v1/sequence/sim/opt",sim_handler.simulateOptimization)



export default app;