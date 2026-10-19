import { withConnection, withTransaction } from '../config/db';
import { PermissionRepository } from '../repositories/permission.repository';
import { insertAudit } from '../repositories/shared.repository';
import { AppError } from '../utils/appError';

const MANAGE_PERMISSION = 'role.manage';

export class PermissionService {
  private repo = new PermissionRepository();

  // ตรวจสิทธิ์จากฐานข้อมูลทุกครั้ง → แก้สิทธิ์แล้วมีผลทันที ไม่ต้องรอ token หมดอายุ
  async hasPermission(roleNames: string[], code: string): Promise<boolean> {
    return withConnection((conn) => this.repo.hasPermission(conn, roleNames, code));
  }

  async listForRoles(roleNames: string[]): Promise<string[]> {
    return withConnection((conn) => this.repo.listForRoles(conn, roleNames));
  }

  async listPermissions() {
    return withConnection((conn) => this.repo.listAllPermissions(conn));
  }

  async listRoles() {
    return withConnection((conn) => this.repo.listRolesWithPermissions(conn));
  }

  async setRolePermissions(actorUserId: number, roleId: number, codes: string[], ipAddress?: string) {
    const unique = Array.from(new Set(codes));
    return withTransaction(async (conn) => {
      const role = await this.repo.findRoleById(conn, roleId);
      if (!role) throw AppError.notFound('ไม่พบบทบาทที่ระบุ');

      const known = await this.repo.existingCodes(conn, unique);
      const unknown = unique.filter((c) => !known.includes(c));
      if (unknown.length > 0) throw AppError.badRequest(`ไม่พบสิทธิ์: ${unknown.join(', ')}`);

      const before = await this.repo.getRolePermissionCodes(conn, roleId);
      await this.repo.replaceRolePermissions(conn, roleId, unique);

      // กันล็อกตัวเองออกจากระบบ: ต้องมีอย่างน้อยหนึ่งบทบาทที่ยังกำหนดสิทธิ์ได้
      const roles = await this.repo.listRolesWithPermissions(conn);
      if (!roles.some((r) => r.permissions.includes(MANAGE_PERMISSION))) {
        throw AppError.badRequest('ต้องมีอย่างน้อยหนึ่งบทบาทที่จัดการสิทธิ์ได้ (role.manage)');
      }

      await insertAudit(conn, {
        userId: actorUserId,
        action: 'UPDATE_ROLE_PERMISSIONS',
        entityName: 'ROLE_PERMISSIONS',
        entityId: roleId,
        oldValues: { role: role.roleName, permissions: before },
        newValues: { role: role.roleName, permissions: [...unique].sort() },
        ipAddress,
      });
      return roles.find((r) => r.roleId === roleId)!;
    });
  }
}
