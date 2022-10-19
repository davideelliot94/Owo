import express from 'express';
import * as handler from "./handler.js"
import * as sim_handler from "./sim_handler.js"
import multer from "multer";

const app = express();
app.use(express.json());
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

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
 * BASICS
 */

app.post("/api/v1/action/get", handler.getAction);

app.get("/api/v1/action/list", handler.listActions);

app.post("/api/v1/action/invoke", handler.invokeAction);

app.post("/api/v1/metrics/get", handler.getMetrics);

//17/10/2022 - to be continued
app.post("api/v1/action/create", upload.single("artifact"),handler.createActionTest)

/**
 * OPTIMIZATION
 */

app.post("/api/v1/sequence/merge", handler.mergeSequence);

app.post("/api/v1/sequence/optimize", handler.optimizeSequence);

//17102022
app.post("/api/v1/sequence/optimize/test/docker", handler.optimizeSequenceTest);

/** 
 * 
 * SIMULATION 
 * 
 * */

//( TO BE DELETED )
app.post("/api/v1/sequence/sim",sim_handler.simulateSequence);

//( TO BE DELETED )
app.post("/api/v1/sequence/optimize/compare",sim_handler.compareOptimization);

app.post("api/v1/sequence/optimize/sim",sim_handler.simulateOptimization)



export default app;