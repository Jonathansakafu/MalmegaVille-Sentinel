import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { jwtSecret } from '../config.js';

interface AuthPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  try {
    if (!jwtSecret) {
      throw new Error('JWT secret is not configured');
    }
    const verified = jwt.verify(token, jwtSecret);
    if (typeof verified !== 'object' || verified === null || typeof verified.userId !== 'string') {
      throw new Error('Invalid token payload');
    }
    req.user = { userId: verified.userId };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
