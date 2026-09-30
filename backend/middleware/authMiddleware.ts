import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { config } from '../config/config';
import { serverCache } from '../utils/cache';

export interface AuthRequest extends Request {
  user?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded: any = jwt.verify(token, config.JWT_SECRET);
      
      const cacheKey = `auth_user_${decoded.id}`;
      let user = serverCache.get<any>(cacheKey);

      if (!user) {
        user = await User.findById(decoded.id);
        if (!user) {
          res.status(401).json({ message: 'User account no longer exists' });
          return;
        }
        delete user.password;
        // Cache user session for 60 seconds to eliminate redundant database reads
        serverCache.set(cacheKey, user, 60_000);
      }

      req.user = user;
      next();
      return;
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') {
        res.status(401).json({ message: 'Token expired, please log in again', code: 'TOKEN_EXPIRED' });
        return;
      }
      console.error('Token verify error:', error);
      res.status(401).json({ message: 'Not authorized, token failed' });
      return;
    }
  }

  res.status(401).json({ message: 'Not authorized, no token' });
};

export const admin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user && (req.user.role === 'Admin' || req.user.role === 'Super Admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
};

export const permissionCheck = (module: string, accessType: 'read' | 'write') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    
    // Admins and Super Admins have full access
    if (req.user.role === 'Admin' || req.user.role === 'Super Admin') {
      next();
      return;
    }

    // Sub Admins check permissions object
    if (req.user.role === 'Sub Admin') {
      const hasPermission = req.user.permissions && 
                            req.user.permissions[module] && 
                            req.user.permissions[module][accessType] === true;
      if (hasPermission) {
        next();
        return;
      }
    }
    
    // Sales Persons have access to demoSessions
    if (req.user.role === 'Sales Person' && module === 'demoSessions') {
      next();
      return;
    }
    
    // Otherwise deny
    res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
  };
};
