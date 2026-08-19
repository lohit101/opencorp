import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execAsync = promisify(exec);

export interface SandboxCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SandboxConfig {
  image: string;
  workspaceRoot: string;
}

/**
 * DockerSandbox manages a persistent Docker container that serves as an
 * isolated workspace for agent operations.
 *
 * Security notes:
 * - Commands run inside the container, not on the host.
 * - The workspace directory is mounted into the container.
 * - This is a basic isolation layer, NOT a fully hardened sandbox.
 *   Treat agents as untrusted and review permissions carefully.
 */
export class DockerSandbox {
  private readonly image: string;
  private readonly workspaceRoot: string;
  private containerId: string | null = null;

  constructor(config: SandboxConfig) {
    this.image = config.image;
    this.workspaceRoot = config.workspaceRoot;
  }

  /**
   * Ensure the sandbox container is running.
   * Creates it if it doesn't exist.
   */
  async ensureRunning(): Promise<void> {
    if (this.containerId) {
      return;
    }

    await fs.mkdir(this.workspaceRoot, { recursive: true });

    // Check if a container already exists for this workspace
    const existing = await this.findExistingContainer();
    if (existing) {
      this.containerId = existing;
      await this.startContainer(existing);
      return;
    }

    // Create a new container
    const { stdout } = await execAsync(
      `docker run -d --name opencorp-sandbox-${Date.now()} ` +
        `-v "${this.workspaceRoot}:/workspace" ` +
        `-w /workspace ` +
        `--cap-drop ALL ` +
        `--cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETUID --cap-add SETGID ` +
        `--security-opt no-new-privileges:true ` +
        `--tmpfs /tmp ` +
        `${this.image} sleep infinity`,
    );

    this.containerId = stdout.trim();
  }

  /**
   * Execute a command inside the sandbox container.
   */
  async exec(
    command: string,
    workdir?: string,
  ): Promise<SandboxCommandResult> {
    await this.ensureRunning();

    if (!this.containerId) {
      throw new Error('Sandbox container is not running');
    }

    const workdirArg = workdir ? `-w "/workspace/${workdir}"` : '';
    const cmd = `docker exec ${workdirArg} ${this.containerId} /bin/bash -lc ${this.quote(command)}`;

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      const err = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? (error instanceof Error ? error.message : 'Unknown error'),
        exitCode: err.code ?? 1,
      };
    }
  }

  /**
   * Read a file from the workspace.
   */
  async readFile(relativePath: string): Promise<string> {
    const resolved = this.resolveWorkspacePath(relativePath);
    return fs.readFile(resolved, 'utf-8');
  }

  /**
   * Write a file to the workspace.
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const resolved = this.resolveWorkspacePath(relativePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  }

  /**
   * List files in the workspace.
   */
  async listFiles(relativePath = ''): Promise<
    { name: string; type: 'file' | 'directory'; path: string }[]
  > {
    const resolved = this.resolveWorkspacePath(relativePath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: relativePath ? `${relativePath}/${entry.name}` : entry.name,
    }));
  }

  /**
   * Stop and remove the sandbox container.
   */
  async destroy(): Promise<void> {
    if (!this.containerId) return;
    try {
      await execAsync(`docker rm -f ${this.containerId}`);
    } catch {
      // Ignore errors on cleanup
    }
    this.containerId = null;
  }

  private async findExistingContainer(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `docker ps -aq --filter "name=opencorp-sandbox-" | head -1`,
      );
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async startContainer(id: string): Promise<void> {
    try {
      await execAsync(`docker start ${id}`);
    } catch {
      // Container may already be running
    }
  }

  private resolveWorkspacePath(relativePath: string): string {
    const resolved = path.resolve(this.workspaceRoot, relativePath);
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error('Path escapes workspace');
    }
    return resolved;
  }

  private quote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
}