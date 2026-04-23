import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/client';
import { config } from '../config';
import { JwtPayload } from '../types/index';

// Extend Express Request to include creatorId
declare global {
  namespace Express {
    interface Request {
      creatorId: string;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    const result = await pool.query<{ session_revoked: boolean; session_expires_at: Date }>(
      'SELECT session_revoked, session_expires_at FROM creators WHERE id = $1',
      [payload.creatorId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const { session_revoked, session_expires_at } = result.rows[0];

    if (session_revoked || new Date(session_expires_at) < new Date()) {
      res.status(401).json({ error: 'Session expired or revoked' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.creatorId = payload.creatorId;
  next();
}
