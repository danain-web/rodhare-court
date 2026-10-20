import { Request, Response } from 'express';
import { AdminUserService } from '../services/admin-user.service';
import { listUsersQuerySchema, updateUserSchema } from '../validators/admin-user.validator';
import { sendSuccess } from '../utils/response';
import { currentUser } from './helpers';
import { parseIdParam } from '../utils/params';

export class AdminUserController {
  private adminUserService = new AdminUserService();

  list = async (req: Request, res: Response) => {
    return sendSuccess(res, await this.adminUserService.list(listUsersQuerySchema.parse(req.query)), 'Users retrieved');
  };

  update = async (req: Request, res: Response) => {
    const actor = currentUser(req);
    const user = await this.adminUserService.update(actor.userId, parseIdParam(req), updateUserSchema.parse(req.body), req.ip);
    return sendSuccess(res, user, 'User updated');
  };
}
