import { Request, Response } from 'express';
import { z } from 'zod';
import { PermissionService } from '../services/permission.service';
import { sendSuccess } from '../utils/response';
import { currentUser } from './helpers';
import { parseIdParam } from '../utils/params';

const rolePermissionsSchema = z.object({
  permissions: z.array(z.string().trim().min(1).max(60)).max(100),
});

export class PermissionController {
  private permissionService = new PermissionService();

  listRoles = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.permissionService.listRoles(), 'Roles retrieved');
  };

  listPermissions = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.permissionService.listPermissions(), 'Permissions retrieved');
  };

  setRolePermissions = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { permissions } = rolePermissionsSchema.parse(req.body);
    const role = await this.permissionService.setRolePermissions(user.userId, parseIdParam(req), permissions, req.ip);
    return sendSuccess(res, role, 'Role permissions updated');
  };
}
