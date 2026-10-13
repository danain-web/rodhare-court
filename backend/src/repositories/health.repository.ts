import { pingDatabase } from '../config/db';

export class HealthRepository {
  async getDatabaseHealth(): Promise<boolean> {
    return await pingDatabase();
  }
}
