import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string | object;
}

export const sendSuccess = <T>(res: Response, data?: T, message?: string, statusCode: number = 200) => {
  const body: ApiResponse<T> = {
    success: true,
    ...(message && { message }),
    ...(data !== undefined && { data }),
  };
  return res.status(statusCode).json(body);
};

export const sendError = (res: Response, message: string, statusCode: number = 500, errorDetails?: any) => {
  const body: ApiResponse = {
    success: false,
    error: message,
    ...(errorDetails && { details: errorDetails }),
  };
  return res.status(statusCode).json(body);
};
