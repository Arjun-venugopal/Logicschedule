import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { config } from '../config/config';

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
      req.user = await User.findById(decoded.id);
      if (req.user) delete req.user.password;
      next();
      return;
    } catch (error) {
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
    res.status(401).json({ message: 'Not authorized as an admin' });
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
    
    // Otherwise deny
    res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
  };
};
