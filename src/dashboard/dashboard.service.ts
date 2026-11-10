import { Injectable } from '@nestjs/common';
import type { ProjectStatus } from '@prisma/client';
import { activityInclude, mapActivity } from '../activities/activity.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { mapProjectSummary, projectListInclude } from '../projects/project.mapper.js';

const PORTFOLIO_ORDER: ProjectStatus[] = [
  'in_progress',
  'on_hold',
  'not_started',
  'completed',
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [totalProjects, grouped, activeProjects, activities] =
      await Promise.all([
        this.prisma.project.count(),
        this.prisma.project.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.project.findMany({
          where: { status: 'in_progress' },
          include: projectListInclude,
          orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
          take: 10,
        }),
        this.prisma.activity.findMany({
          include: activityInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 10,
        }),
      ]);

    const counts = new Map(
      grouped.map((group) => [group.status, group._count._all]),
    );

    const portfolio = PORTFOLIO_ORDER.map((status) => {
      const count = counts.get(status) ?? 0;
      return {
        status,
        count,
        percentage:
          totalProjects === 0
            ? 0
            : Math.round((count / totalProjects) * 1000) / 10,
      };
    });

    return {
      generated_at: new Date().toISOString(),
      total_projects: totalProjects,
      portfolio,
      active_projects: activeProjects.map(mapProjectSummary),
      activities: activities.map(mapActivity),
    };
  }
}
