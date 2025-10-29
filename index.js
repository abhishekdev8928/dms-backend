
import app from "./src/app.js";
import { config } from "./src/config/config.js"
import { connectDb } from "./src/config/db.js";




const startServer = async () =>{

  app.listen(config?.port,()=>{
    console.log(`Server is up & running on ${config?.port}`)
  })

}


connectDb()

startServer();