# Zine - Bookmark Manager

A modern bookmark manager built with React, TypeScript, and Cloudflare.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Routing**: Tanstack Router
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **API**: Hono + Cloudflare Workers
- **Database**: Cloudflare D1 + Drizzle ORM
- **Monorepo**: Turborepo
- **Package Manager**: Bun
- **Hosting**: Cloudflare Pages + Workers

## Project Structure

```
zine/
├── packages/
│   ├── web/          # React frontend
│   ├── api/          # Hono API (Cloudflare Workers)
│   └── shared/       # Shared types and utilities
├── package.json      # Root package.json
├── turbo.json        # Turborepo configuration
└── tsconfig.json     # TypeScript configuration
```

## Getting Started

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Development**:
   ```bash
   # Start all packages in development mode
   bun dev
   
   # Or start individual packages
   bun dev --filter=@zine/web
   bun dev --filter=@zine/api
   ```

3. **Build**:
   ```bash
   bun build
   ```

## Database Setup

1. **Create D1 database**:
   ```bash
   cd packages/api
   wrangler d1 create zine-db
   ```

2. **Update wrangler.toml** with your database ID

3. **Generate and run migrations**:
   ```bash
   bun db:generate
   bun db:migrate
   ```

## Deployment

1. **Deploy API**:
   ```bash
   cd packages/api
   bun deploy
   ```

2. **Deploy Frontend**:
   ```bash
   cd packages/web
   bun deploy
   ```

Or deploy everything:
```bash
bun deploy
```

## Development Commands

- `bun dev` - Start development servers
- `bun build` - Build all packages
- `bun lint` - Run linting
- `bun type-check` - Run TypeScript checks
- `bun clean` - Clean build artifacts
- `bun deploy` - Deploy to production