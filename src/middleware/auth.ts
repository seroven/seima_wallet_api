import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../db/knex';
import { PublicUser, RoleCode, UserRow } from '../types';
import { getUserRoles, toPublicUser } from '../utils/mappers';

export type AuthRequest = Request & {
  user?: PublicUser;
};

type JwtPayload = {
  sub: string;
  username: string;
  displayName: string;
};

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = header.slice(7);
  void (async () => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const row = await db<UserRow>('users').where({ id: payload.sub }).first();
      if (!row || row.is_active === false) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      req.user = await toPublicUser(row);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  })();
}

export function requireRole(...codes: RoleCode[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const roles = req.user?.roles ?? [];
    const ok = codes.some((c) => roles.includes(c));
    if (!ok) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

export function signToken(user: PublicUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

export async function loadRoles(userId: string): Promise<RoleCode[]> {
  return getUserRoles(userId);
}
