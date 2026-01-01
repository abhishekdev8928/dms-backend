import app from "./src/app.js";
import { config } from "./src/config/config.js";
import { connectDb } from "./src/config/db.js";
import FolderModel from "./src/models/folderModel.js";

const startServer = async () => {
  try {
   
    await connectDb();

    

   
    app.listen(config?.port, () => {
      console.log(`🚀 Server is up & running on port ${config?.port}`);
    });

  } catch (error) {
    console.error("❌ Failed to connect to the database:", error.message);
    process.exit(1);
  }
};

startServer();
