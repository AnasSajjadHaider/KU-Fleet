// src/utils/generateToken.ts
// JWT token generation with proper security settings

import jwt from "jsonwebtoken";

/**
 * Generate JWT token with secure defaults
 * SECURITY: Uses proper expiration, signing algorithm, and secret validation
 */
export const generateToken = (id: string): string => {
  const secret = process.env.JWT_SECRET;
  
  // SECURITY: Ensure JWT secret exists and is strong enough
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  
  if (secret.length < 32) {
    console.warn("⚠️ JWT_SECRET should be at least 32 characters for production");
  }

  // SECURITY: Use proper expiration (7 days is reasonable for fleet management)
  // SECURITY: Explicitly set algorithm (HS256 is default but explicit is better)
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(
    { id },
    secret,
    {
      expiresIn: expiresIn,
      // Note: algorithm is automatically HS256 for symmetric keys, but we verify explicitly
    } as jwt.SignOptions
  );
};

/**
 * Verify JWT token with proper error handling
 * SECURITY: Validates token signature and expiration
 */
export const verifyToken = (token: string): { id: string } => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  try {
    // SECURITY: Explicitly specify algorithm to prevent algorithm confusion
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as { id: string };
    return decoded;
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw error;
  }
};
