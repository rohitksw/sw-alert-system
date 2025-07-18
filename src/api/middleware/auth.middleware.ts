import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../config/env';

// This is an Express middleware function.
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // Get the token from the 'Authorization' header.
  // The standard format is "Bearer YOUR_JWT_HERE".
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token part

  if (!token) {
    // If no token is provided, send a 401 Unauthorized response.
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  // Verify the token using the secret key.
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      // If the token is invalid (e.g., expired, wrong signature), send a 403 Forbidden response.
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    
    // If the token is valid, we can optionally attach the decoded user info to the request object.
    // This is useful if your token contains user roles or an ID.
    // (req as any).user = user; 
    
    // Call next() to pass control to the next middleware or the actual route handler.
    next();
  });
};