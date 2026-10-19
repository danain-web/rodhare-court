import { Request, Response } from 'express';
import { z } from 'zod';
import { SettingsService } from '../services/settings.service';
import { sendSuccess } from '../utils/response';
import { currentUser } from './helpers';

const settingValueSchema = z.object({ value: z.number() });

export class SettingsController {
  private settingsService = new SettingsService();

  list = async (_req: Request, res: Response) => {
    return sendSuccess(res, await this.settingsService.list(), 'Settings retrieved');
  };

  update = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { value } = settingValueSchema.parse(req.body);
    const key = String(req.params.key);
    return sendSuccess(res, await this.settingsService.update(user.userId, key, value, req.ip), 'Setting updated');
  };
}
