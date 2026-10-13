import { Request, Response, NextFunction } from 'express';
import { HealthService } from '../services/health.service';
import { AppError } from '../utils/appError';

export class HealthController {
  private healthService: HealthService;

  constructor() {
    this.healthService = new HealthService();
  }

  getHealth = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.healthService.checkHealth();
      const statusCode = result.status === 'ok' ? 200 : 503;
      res.status(statusCode).json({
        status: result.status,
        database: result.database,
      });
    } catch (error) {
      next(error);
    }
  };

  testError = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const type = req.query.type as string;
      switch (type) {
        case '400':
          throw AppError.badRequest('Test 400 Bad Request');
        case '401':
          throw AppError.unauthorized('Test 401 Unauthorized');
        case '403':
          throw AppError.forbidden('Test 403 Forbidden');
        case '404':
          throw AppError.notFound('Test 404 Not Found');
        case '409':
          throw AppError.conflict('Test 409 Conflict');
        case '500':
          throw AppError.internal('Test 500 Internal Error');
        default:
          throw AppError.badRequest('Invalid error type parameter. Use ?type=400|401|403|404|409|500');
      }
    } catch (error) {
      next(error);
    }
  };
}
