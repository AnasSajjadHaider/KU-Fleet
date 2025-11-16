// src/core/app.ts
// Main Express application setup with security middleware

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Security middleware
import {
  securityHeaders,
  sanitizeInput,
  validateObjectId,
  restrictMethods,
  apiRateLimiter,
  authRateLimiter,
  strictRateLimiter,
} from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Routes
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import busRoutes from "./routes/busRoutes";
import driverRoutes from "./routes/driverRoutes";
import analyticRoutes from "./routes/analyticsRoutes";
import stationRoutes from "./routes/stationRoutes";
import routeRoutes from "./routes/routeRoutes";
import tripRoutes from "./routes/tripRoutes";
import feedbackRoutes from "./routes/feebackRoutes";
import alertRoutes from "./routes/alertRoutes";
import uploadRoutes from "./routes/uploadRoutes";

// Start workers/cron jobs
import "./workers/tripWorker";
import "./workers/analyticsWorker";
import "./workers/cleanupWorker";
import "./workers/cronJobs";

dotenv.config();

export const app = express();

// ============================================================================
// SECURITY MIDDLEWARE (Applied in order)
// ============================================================================

// SECURITY: Helmet for security headers (XSS, clickjacking, etc.)
app.use(securityHeaders);

// SECURITY: Restrict dangerous HTTP methods
app.use(restrictMethods);

// SECURITY: CORS configuration (restrict in production)
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*", // TODO: Set specific origins in production
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

// SECURITY: Body parsing with size limits (prevent large payload attacks)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// SECURITY: NoSQL injection protection - sanitize all inputs
app.use(sanitizeInput);

// SECURITY: Validate ObjectId format in params/body/query
app.use(validateObjectId);

// SECURITY: General API rate limiting
app.use("/api", apiRateLimiter);

// ============================================================================
// ROUTES
// ============================================================================

// SECURITY: Auth routes with strict rate limiting (prevent brute force)
app.use("/api/auth", authRateLimiter, authRoutes);

// Other routes with general rate limiting
app.use("/api/users", userRoutes);
app.use("/api/buses", busRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/analytics", analyticRoutes);
app.use("/api/stations", stationRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/tripLogs", tripRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/alerts", alertRoutes);

// SECURITY: Upload routes with strict rate limiting (prevent abuse)
app.use("/api/upload", strictRateLimiter, uploadRoutes);

// Health check endpoint (no auth required)
app.get("/", (_, res) => {
  res.json({
    success: true,
    message: "KU Fleet Backend is up",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ERROR HANDLING (Must be last)
// ============================================================================

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (catches all errors, prevents stack trace leaks)
app.use(errorHandler);
