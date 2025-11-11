import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { sanitizeAndValidateId, sanitizeObjectXSS } from "./utils/helper.js";
import createHttpError from "http-errors";

const app = express();

// Import routes
import authRoutes from "../src/routes/userRoutes.js";
import departmentRoutes from "../src/routes/departmentRoutes.js";
import treeRoutes from "./routes/treeRoutes.js"
import folderRoutes from "./routes/folderRoutes.js";
import documentRoutes from "./routes/documentRoutes.js"
import globalErrorHandler from "./middleware/globalErrorHandler.js";
import searchRoutes from "./routes/searchRoutes.js";
import restoreRoutes from "./routes/restoreRoutes.js"

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. CORS configuration
app.use(cors({
  origin: "http://localhost:5173",
  credentials:true
}));

// 3. Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 4. Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ===== RATE LIMITING =====


const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes"
  },
  standardHeaders: true, 
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests",
      message: "You have exceeded the request limit. Please try again later.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, 
  skipSuccessfulRequests: true, 
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: "15 minutes"
  },
  handler: (req, res) => {
    const now = Date.now();
  const resetTime = req.rateLimit.resetTime?.getTime?.() || now; // convert to ms safely
  const secondsLeft = Math.ceil((resetTime - now) / 1000); // remaining seconds
  const minutesLeft = Math.ceil(secondsLeft / 60); // convert to minutes

  res.status(429).json({
    error: "Too many authentication attempts",
    message: `Account temporarily locked due to too many failed attempts. Please try again in ${minutesLeft} minute(s).`,
    retryAfter: `${minutesLeft} minute(s)`
  });
  }
});

// Moderate rate limiter for document upload/creation
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    error: "Upload limit exceeded, please try again later.",
    retryAfter: "1 hour"
  },
  handler: (req, res) => {
    res.status(429).json({
      error: "Upload limit exceeded",
      message: "You have reached the maximum number of uploads per hour. Please try again later.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Lenient rate limiter for read operations
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 read requests per windowMs
  message: {
    error: "Too many requests, please try again later.",
    retryAfter: "15 minutes"
  }
});


app.use("/api/auth",  authRoutes);

app.use("/api/departments",  departmentRoutes);

app.use("/api/folders" , folderRoutes);

app.use("/api/documents" , documentRoutes);

app.use("/api/children",treeRoutes);

app.use("/api/trash" , restoreRoutes)



app.use("/api/search",searchRoutes)







// Document routes with upload limiter for POST/PUT, read limiter for GET
app.use("/api/documents", (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    uploadLimiter(req, res, next);
  } else {
    readLimiter(req, res, next);
  }
}, documentRoutes);

// ===== ERROR HANDLING =====
app.use(globalErrorHandler);

// ===== TEST ROUTES =====
app.get("/", (req, res) => {
  res.json({ 
    message: "Server running",
    rateLimit: {
      general: "100 requests per 15 minutes",
      auth: "5 attempts per 15 minutes",
      uploads: "20 uploads per hour",
      reads: "300 requests per 15 minutes"
    }
  });
});

export default app;