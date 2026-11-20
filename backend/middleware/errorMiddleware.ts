import { Request, Response, NextFunction } from 'express';

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const isDup = Boolean(err.isDuplicate || err.code === '23505');
  const statusCode = err.statusCode || (isDup ? 409 : (res.statusCode === 200 ? 500 : res.statusCode));
  res.status(statusCode);
  res.json({
    message: err.message || 'An unexpected error occurred',
    isDuplicate: isDup,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};
