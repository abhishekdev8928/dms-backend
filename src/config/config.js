import { config as conf } from "dotenv";
conf({
  path:
    process.env.NODE_ENV === "production"
      ? "./.env.production"
      : "./.env.development",
});

const _config = {
  port: process.env.PORT || 3200,
  env: process.env.NODE_ENV,
  databaseUrl: process.env.MONGO_DB_URL,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRES_IN,

  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '12d',

  frontendUrl: process.env.FRONTEND_URL,

  maxFileSize: process.env.MAX_FILE_SIZE,

  
  chunkedUpload: {
    threshold: parseInt(process.env.CHUNK_SIZE_THRESHOLD) || 100 * 1024 * 1024, // 100MB default
    minChunkSize: parseInt(process.env.MIN_CHUNK_SIZE) || 41943040, // 40 MB
maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE) || 100 * 1024 * 1024, // 100MB default

  },

  aws: {
    accessKeyId: process.env.USER_ACCESS_KEY,
    secretAccessKey: process.env.USER_SECRET_KEY,
    bucketName: process.env.BUCKET_NAME,
    region: process.env.BUCKET_REGION,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

export const config = Object.freeze(_config);