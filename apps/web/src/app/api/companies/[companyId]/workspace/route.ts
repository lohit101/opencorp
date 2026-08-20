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
      // If a directory is requested, try to serve an index.html in it
      const indexResolved = path.join(resolved, 'index.html').replace(/\/+$/, '');
      return serveFile(indexResolved, workspaceRoot);
    }

    return serveFile(resolved, workspaceRoot);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read workspace file' },
      { status: 500 },
    );
  }
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