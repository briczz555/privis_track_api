import type { AuditLog } from '@prisma/client';

export function toAuditLogResponse(row: AuditLog) {
  return {
    id: row.id,
    actor_id: row.actorId,
    actor_name: row.actorName,
    actor_role: row.actorRole,
    action: row.action,
    entity: row.entity,
    entity_id: row.entityId,
    summary: row.summary,
    metadata: row.metadata,
    created_at: row.createdAt.toISOString(),
  };
}
