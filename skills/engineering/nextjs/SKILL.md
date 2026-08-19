# Next.js / React / TypeScript Skill

## Overview

This skill teaches an agent how to work with Next.js, React, TypeScript, and Tailwind CSS projects.

## Project Structure

A typical Next.js project:

```
project/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   └── components/
├── public/
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.ts
```

## Key Conventions

- Use the App Router (`src/app/`)
- Place shared components in `src/components/`
- Use Tailwind CSS for styling
- Use TypeScript for all files
- Use `'use client'` directive for client components
- Server components are the default

## Common Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
```

## Best Practices

1. Prefer server components unless interactivity is needed
2. Use `Link` component for client-side navigation
3. Place static assets in `public/`
4. Use environment variables via `NEXT_PUBLIC_` prefix for client-side vars
5. Keep components small and focused
6. Use TypeScript strictly - avoid `any`
7. Use Tailwind utility classes over custom CSS