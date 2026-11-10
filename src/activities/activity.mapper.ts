import { Prisma } from '@prisma/client';

export const activityInclude = Prisma.validator<Prisma.ActivityInclude>()({
  actor: { select: { id: true, name: true, division: true } },
  project: { select: { id: true, code: true, name: true } },
});

export type ActivityRow = Prisma.ActivityGetPayload<{
  include: typeof activityInclude;
}>;

export interface ActivityCursor {
  createdAt: Date;
  id: string;
}

export function encodeActivityCursor(row: ActivityRow): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
  ).toString('base64url');
}

export function decodeActivityCursor(cursor: string): ActivityCursor {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const parsed = JSON.parse(decoded) as { createdAt?: string; id?: string };

  if (!parsed.createdAt || !parsed.id || Number.isNaN(Date.parse(parsed.createdAt))) {
    throw new Error('Cursor tidak valid.');
  }

  return { createdAt: new Date(parsed.createdAt), id: parsed.id };
}

export function activityCursorWhere(
  cursor: ActivityCursor,
): Prisma.ActivityWhereInput {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export function mapActivity(row: ActivityRow) {
  return {
    id: row.id,
    type: row.type,
    actor: {
      id: row.actor.id,
      name: row.actor.name,
      division: row.actor.division ?? row.division,
    },
    action: row.action,
    target: row.target,
    project: {
      id: row.project.id,
      code: row.project.code,
      name: row.project.name,
    },
    created_at: row.createdAt.toISOString(),
  };
}
