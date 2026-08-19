import { NextResponse } from 'next/server';
import { CompanyRepository } from '@opencorp/db';

const companyRepo = new CompanyRepository();

// GET /api/companies - list all companies
export async function GET() {
  try {
    const companies = await companyRepo.findAll();
    return NextResponse.json({ success: true, data: companies });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list companies' },
      { status: 500 },
    );
  }
}

// POST /api/companies - create a new company
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, objective } = body as {
      name?: string;
      description?: string;
      objective?: string;
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Company name is required' },
        { status: 400 },
      );
    }

    const company = await companyRepo.create({
      name: name.trim(),
      description: description?.trim() ?? '',
      objective: objective?.trim(),
    });

    return NextResponse.json({ success: true, data: company }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create company' },
      { status: 500 },
    );
  }
}