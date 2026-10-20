import { withConnection, withTransaction } from '../config/db';
import { AdminUserDTO, AdminUserRepository } from '../repositories/admin-user.repository';
import { PermissionRepository } from '../repositories/permission.repository';
import { SessionRepository } from '../repositories/session.repository';
import { insertAudit } from '../repositories/shared.repository';
import { AppError } from '../utils/appError';
import { UpdateUserInput } from '../validators/admin-user.validator';

const MANAGE_PERMISSION = 'role.manage';

export class AdminUserService {
  private repo = new AdminUserRepository();
  private permissionRepo = new PermissionRepository();
  private sessionRepo = new SessionRepository();

  // รายชื่อผู้ใช้ + ตัวเลือกบทบาท/ประเภทสมาชิก สำหรับหน้าจัดการผู้ใช้ (ดึงในคำขอเดียว)
  async list(filter: { search?: string; role?: string; status?: 'active' | 'suspended'; limit?: number }) {
    return withConnection(async (conn) => ({
      users: await this.repo.list(conn, { ...filter, limit: Math.min(Math.max(filter.limit || 200, 1), 500) }),
      roles: await this.repo.listRoles(conn),
      memberTypes: (await conn.query(`SELECT member_type_id, COALESCE(display_name, type_name) AS display_name, discount_percent FROM member_types ORDER BY member_type_id`)).rows.map(
        (r: any) => ({ memberTypeId: r.member_type_id, displayName: r.display_name, discountPercent: parseFloat(r.discount_percent) })
      ),
    }));
  }

  // ระงับ/เปิดบัญชี · เปลี่ยนบทบาท · เปลี่ยนประเภทสมาชิก (ส่งมาเฉพาะที่ต้องการเปลี่ยน)
  // - แก้สถานะหรือบทบาทของบัญชีตัวเองไม่ได้ (กันล็อกตัวเองออก)
  // - ห้ามทำให้ระบบไม่เหลือผู้ใช้ที่จัดการสิทธิ์ได้ (role.manage)
  // - ระงับบัญชีหรือเปลี่ยนบทบาท → ออกจากระบบทุกอุปกรณ์ทันที เพื่อให้บทบาทใหม่มีผลและตัด token เก่า
  async update(actorUserId: number, targetUserId: number, input: UpdateUserInput, ipAddress?: string): Promise<AdminUserDTO> {
    return withTransaction(async (conn) => {
      const before = await this.repo.getForUpdate(conn, targetUserId);
      if (!before) throw AppError.notFound('ไม่พบผู้ใช้');

      const activeChanged = input.isActive !== undefined && input.isActive !== before.isActive;
      const roleChanged = input.role !== undefined && !(before.roles.length === 1 && before.roles[0] === input.role);
      const memberTypeChanged = input.memberTypeId !== undefined && input.memberTypeId !== before.memberTypeId;
      if (!activeChanged && !roleChanged && !memberTypeChanged) return before;

      if ((activeChanged || roleChanged) && actorUserId === targetUserId) {
        throw AppError.badRequest('ไม่สามารถระงับบัญชีหรือเปลี่ยนบทบาทของบัญชีตัวเองได้ ให้ผู้ดูแลระบบคนอื่นดำเนินการ');
      }
      if (roleChanged && !(await this.repo.roleExists(conn, input.role!))) throw AppError.badRequest('ไม่พบบทบาทที่ระบุ');
      if (memberTypeChanged && !(await this.repo.memberTypeExists(conn, input.memberTypeId!))) throw AppError.badRequest('ไม่พบประเภทสมาชิกที่ระบุ');

      const willBeActive = input.isActive ?? before.isActive;
      const willHaveRoles = roleChanged ? [input.role!] : before.roles;
      const hadManage = before.isActive && (await this.permissionRepo.hasPermission(conn, before.roles, MANAGE_PERMISSION));
      const keepsManage = willBeActive && (await this.permissionRepo.hasPermission(conn, willHaveRoles, MANAGE_PERMISSION));
      if (hadManage && !keepsManage && (await this.repo.countOtherActiveRoleManagers(conn, targetUserId)) === 0) {
        throw AppError.badRequest('ไม่สามารถดำเนินการได้ เพราะผู้ใช้นี้เป็นคนสุดท้ายที่จัดการสิทธิ์ของบทบาทได้ (role.manage)');
      }

      if (activeChanged) await this.repo.setActive(conn, targetUserId, input.isActive!);
      if (roleChanged) await this.repo.replaceRole(conn, targetUserId, input.role!);
      if (memberTypeChanged) await this.repo.setMemberType(conn, targetUserId, input.memberTypeId!);
      if ((activeChanged && !input.isActive) || roleChanged) await this.sessionRepo.revokeAllForUser(conn, targetUserId);

      const after = (await this.repo.getById(conn, targetUserId))!;
      await insertAudit(conn, {
        userId: actorUserId,
        action: 'UPDATE_USER',
        entityName: 'USERS',
        entityId: targetUserId,
        oldValues: { isActive: before.isActive, roles: before.roles, memberTypeId: before.memberTypeId },
        newValues: { isActive: after.isActive, roles: after.roles, memberTypeId: after.memberTypeId },
        ipAddress,
      });
      return after;
    }, actorUserId);
  }
}
