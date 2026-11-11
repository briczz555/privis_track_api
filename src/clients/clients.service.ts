import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const clients = await this.prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    return { data: clients };
  }
}
