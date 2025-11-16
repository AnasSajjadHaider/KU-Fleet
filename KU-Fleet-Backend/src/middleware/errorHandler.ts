// src/middleware/errorHandler.ts
// Centralized error handling middleware - prevents stack trace leaks in production

import { Request, Response, NextFunction } from "express";
import { Error } from "mongoose";

/**
 * Custom error class for application errors
 * Allows structured error handling with status codes
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle MongoDB validation errors
 * Converts Mongoose validation errors to user-friendly messages
 */
const handleValidationError = (err: Error.ValidationError): AppError => {
  const errors = Object.values(err.errors).map(e => e.message);
  const message = `Validation Error: ${errors.join(", ")}`;
  return new AppError(message, 400);
};

/**
 * Handle MongoDB duplicate key errors
 * Converts unique constraint violations to user-friendly messages
 */
const handleDuplicateKeyError = (err: any): AppError => {
  const field = Object.keys(err.keyPattern || {})[0] || "field";
  const message = `${field} already exists`;
  return new AppError(message, 409);
};

/**
 * Handle MongoDB cast errors (invalid ObjectId, etc.)
 * Converts cast errors to user-friendly messages
 */
const handleCastError = (err: Error.CastError): AppError => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

/**
 * Handle JWT errors
 * Provides secure error messages without exposing token details
 */
const handleJWTError = (): AppError => {
  return new AppError("Invalid token. Please log in again.", 401);
};

/**
 * Handle JWT expired errors
 */
const handleJWTExpiredError = (): AppError => {
  return new AppError("Your token has expired. Please log in again.", 401);
};

/**
 * Main error handling middleware
 * NEVER leaks stack traces or sensitive info in production
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err } as AppError;
  error.message = err.message;

  // Log error for debugging (but don't expose to client)
  console.error("Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Handle specific error types
  if (err.name === "ValidationError") {
    error = handleValidationError(err as Error.ValidationError);
  } else if ((err as any).code === 11000) {
    error = handleDuplicateKeyError(err as any);
  } else if (err.name === "CastError") {
    error = handleCastError(err as Error.CastError);
  } else if (err.name === "JsonWebTokenError") {
    error = handleJWTError();
  } else if (err.name === "TokenExpiredError") {
    error = handleJWTExpiredError();
  }

  // Ensure status code exists
  const statusCode = error.statusCode || 500;
  
  // NEVER expose stack traces or internal errors in production
  const response: any = {
    success: false,
    message: error.message || "Internal server error",
  };

  // Only include error details in development
  if (process.env.NODE_ENV === "development") {
    response.error = err.message;
    if (err.stack) {
      response.stack = err.stack;
    }
  }

  res.status(statusCode).json(response);
};

/**
 * Async error wrapper
 * Catches async errors and passes them to error handler
 * Usage: wrapAsync(async (req, res) => { ... })
 */
export const wrapAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 * Must be after all routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};

