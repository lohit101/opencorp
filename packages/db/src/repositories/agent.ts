import { prisma } from '../client.js';
import type { AgentConfig, AgentState, ModelConfig, AgentPermissions, MemoryConfig } from '@opencorp/shared';

/**
 * AgentRepository handles persistence for Agent entities.
 */
export class AgentRepository {
  async create(data: {
    companyId: string;
    name: string;
    role: string;
    description: string;
    modelConfig: ModelConfig;
    systemPrompt: string;
    skillIds: string[];
    toolNames: string[];
    permissions: AgentPermissions;
    memoryConfig: MemoryConfig;
  }): Promise<AgentConfig> {
    const agent = await prisma.agent.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        role: data.role,
        description: data.description,
        modelProvider: data.modelConfig.provider,
        modelName: data.modelConfig.model,
        systemPrompt: data.systemPrompt,
        skillIds: JSON.stringify(data.skillIds),
        toolNames: JSON.stringify(data.toolNames),
        permissions: JSON.stringify(data.permissions),
        state: 'idle',
      },
    });

    return this.toDomain(agent);
  }

  async findById(id: string): Promise<AgentConfig | null> {
    const agent = await prisma.agent.findUnique({ where: { id } });
    return agent ? this.toDomain(agent) : null;
  }

  async findByCompany(companyId: string): Promise<AgentConfig[]> {
    const agents = await prisma.agent.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
    return agents.map((a) => this.toDomain(a));
  }

  async updateState(id: string, state: AgentState): Promise<AgentConfig> {
    const agent = await prisma.agent.update({
      where: { id },
      data: { state },
    });
    return this.toDomain(agent);
  }

  async delete(id: string): Promise<void> {
    await prisma.agent.delete({ where: { id } });
  }

  private toDomain(
    agent: {
      id: string;
      companyId: string;
      name: string;
      role: string;
      description: string;
      modelProvider: string;
      modelName: string;
      systemPrompt: string;
      skillIds: string;
      toolNames: string;
      permissions: string;
      state: string;
      createdAt: Date;
      updatedAt: Date;
    },
  ): AgentConfig {
    const permissions = JSON.parse(agent.permissions) as AgentPermissions;
    const memoryConfig: MemoryConfig = {
      enabled: true,
      maxEntries: 100,
      types: ['company', 'project', 'task', 'agent', 'decision'],
    };

    return {
      id: agent.id,
      companyId: agent.companyId,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      modelConfig: {
        provider: agent.modelProvider as ModelConfig['provider'],
        model: agent.modelName,
      },
      systemPrompt: agent.systemPrompt,
      skillIds: JSON.parse(agent.skillIds) as string[],
      toolNames: JSON.parse(agent.toolNames) as string[],
      permissions,
      memoryConfig,
      state: agent.state as AgentState,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }
}