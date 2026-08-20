import { NextResponse } from 'next/server';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// GET /api/companies/[companyId]/workspace?path=index.html
// Serves files from a company's agent workspace. Security:
// - The resolved path must stay within the company's workspace directory.
// - Returns a reasonable content type so HTML/CSS/JS render in the browser.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const url = new URL(request.url);
    const relPath = url.searchParams.get('path') ?? '';

    // Prevent path traversal
    if (relPath.includes('..')) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const workspaceRoot = path.join(process.cwd(), '..', '..', '.workspaces', companyId);
    const resolved = path.resolve(workspaceRoot, relPath);

    // Ensure the resolved path stays within the workspace
    if (!resolved.startsWith(workspaceRoot)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || stat.isDirectory()) {
      // If a directory is requested, return a JSON listing of its contents
      // so the file explorer can navigate into folders.
      return listDirectory(resolved, workspaceRoot);
    }

    return serveFile(resolved, workspaceRoot);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read workspace file' },
      { status: 500 },
    );
  }
}

/**
 * List the entries of a directory inside the workspace.
 * Returns { path, name, type } for each child (non-recursive).
 */
async function listDirectory(
  dirPath: string,
  workspaceRoot: string,
): Promise<Response> {
  const resolved = path.resolve(dirPath);
  if (!resolved.startsWith(workspaceRoot)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let entries;
  try {
    entries = await fs.readdir(resolved, { withFileTypes: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Directory not found' }, { status: 404 });
  }

  const items: { path: string; name: string; type: 'file' | 'directory' }[] = [];
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    items.push({
      path: entry.name,
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    });
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ success: true, data: items });
}

async function serveFile(filePath: string, workspaceRoot: string): Promise<Response> {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(workspaceRoot)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const data = await fs.readFile(resolved).catch(() => null);
  if (!data) {
    return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
  }

  const contentType = getContentType(resolved);
  return new Response(data, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  });
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'text/plain; charset=utf-8';
  }
}