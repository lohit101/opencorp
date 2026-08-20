import { NextResponse } from 'next/server';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// GET /api/companies/[companyId]/css/styles.css
// Catch-all route that serves relative workspace assets referenced by a
// deliverable's HTML (e.g. <link href="css/styles.css"> resolves here).
//
// When the browser loads a deliverable via
//   /api/companies/{companyId}/workspace?path=index.html
// relative paths like `css/styles.css` and `js/script.js` resolve to
//   /api/companies/{companyId}/css/styles.css
// which this handler maps back to the company's workspace directory.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; workspace: string[] }> },
) {
  try {
    const { companyId, workspace } = await params;
    const relPath = workspace.join('/');

    // Prevent path traversal
    if (relPath.includes('..')) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const workspaceRoot = path.join(process.cwd(), '..', '..', '.workspaces', companyId);
    const resolved = path.resolve(workspaceRoot, relPath);

    // Ensure the resolved path stays within the workspace directory
    if (!resolved.startsWith(workspaceRoot)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const data = await fs.readFile(resolved).catch(() => null);
    if (!data) {
      return new NextResponse('Not Found', { status: 404 });
    }

    return new Response(data, {
      headers: {
        'Content-Type': getContentType(resolved),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read workspace file' },
      { status: 500 },
    );
  }
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
    case '.webp':
      return 'image/webp';
    default:
      return 'text/plain; charset=utf-8';
  }
}