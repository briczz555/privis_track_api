import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QueryClientsDto } from './dto/query-clients.dto.js';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryClientsDto) {
    const search = query.search?.trim();

    const where: Prisma.ClientWhereInput | undefined = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : undefined;

    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
      take: query.limit,
      select: { id: true, name: true },
    });

    return { data: clients };
  }
}
