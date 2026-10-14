import { Request } from 'express';
import { AppError } from '../utils/appError';
import { AuthUserPayload } from '../types';

export const currentUser = (req: Request): AuthUserPayload => {
  if (!req.user) throw AppError.unauthorized('กรุณาเข้าสู่ระบบก่อน');
  return req.user;
};
