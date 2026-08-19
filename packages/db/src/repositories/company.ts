import { prisma } from '../client.js';
import type { Company } from '@opencorp/shared';

/**
 * CompanyRepository handles persistence for Company entities.
 */
export class CompanyRepository {
  async create(data: {
    name: string;
    description: string;
    objective?: string;
  }): Promise<Company> {
    const company = await prisma.company.create({
      data: {
        name: data.name,
        description: data.description,
        objective: data.objective ?? null,
      },
    });

    return this.toDomain(company);
  }

  async findById(id: string): Promise<Company | null> {
    const company = await prisma.company.findUnique({ where: { id } });
    return company ? this.toDomain(company) : null;
  }

  async findAll(): Promise<Company[]> {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return companies.map((c) => this.toDomain(c));
  }

  async updateObjective(id: string, objective: string): Promise<Company> {
    const company = await prisma.company.update({
      where: { id },
      data: { objective },
    });
    return this.toDomain(company);
  }

  async delete(id: string): Promise<void> {
    await prisma.company.delete({ where: { id } });
  }

  private toDomain(
    company: {
      id: string;
      name: string;
      description: string;
      objective: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): Company {
    return {
      id: company.id,
      name: company.name,
      description: company.description,
      objective: company.objective ?? undefined,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }
}