import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Skill } from '@opencorp/shared';

/**
 * SkillLoader loads skill packages from the skills/ directory.
 *
 * Skills are Markdown files that follow the structure:
 *
 *   skills/<category>/<skill-name>/SKILL.md
 *   skills/<category>/SKILL.md
 *
 * The loader maps a skill id (e.g. "engineering/nextjs" or "ceo") to the
 * contents of its SKILL.md file and parses the frontmatter (if present).
 */
export class SkillLoader {
  private readonly skillsRoot: string;

  constructor(skillsRoot: string) {
    this.skillsRoot = skillsRoot;
  }

  /**
   * Load a single skill by id.
   *
   * Supports both:
   * - "engineering/nextjs"  → skills/engineering/nextjs/SKILL.md
   * - "ceo"                 → skills/management/ceo/SKILL.md (searched across categories)
   */
  async load(skillId: string): Promise<Skill | null> {
    // Direct path candidates
    const paths = [path.join(this.skillsRoot, skillId, 'SKILL.md')];

    // If skillId has no slash, also try common category prefixes
    if (!skillId.includes('/')) {
      for (const category of ['engineering', 'management', 'research']) {
        paths.push(
          path.join(this.skillsRoot, category, skillId, 'SKILL.md'),
          path.join(this.skillsRoot, category, 'SKILL.md'),
        );
      }
    }

    for (const file of paths) {
      try {
        const raw = await fs.readFile(file, 'utf-8');
        return this.parseSkill(skillId, raw, file);
      } catch {
        // Try next path
      }
    }

    return null;
  }

  /**
   * Load multiple skills by id.
   */
  async loadMany(skillIds: string[]): Promise<Skill[]> {
    const results: Skill[] = [];
    for (const id of skillIds) {
      const skill = await this.load(id);
      if (skill) results.push(skill);
    }
    return results;
  }

  private parseSkill(id: string, raw: string, filePath: string): Skill {
    const fileName = path.basename(path.dirname(filePath));
    const category = path.basename(path.dirname(path.dirname(filePath)));
    const version = '1.0.0';

    // Parse basic frontmatter (title/name/description)
    let name = fileName;
    let description = '';
    let body = raw;

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) {
      body = fmMatch[2].trim();
      const meta: Record<string, string> = {};
      for (const line of fmMatch[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        }
      }
      name = meta.name ?? fileName;
      description = meta.description ?? '';
    }

    return {
      id: id,
      name,
      description,
      category,
      instructions: body,
      version,
    };
  }
}