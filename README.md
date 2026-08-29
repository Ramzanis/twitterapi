# Skylark — X (formerly Twitter) API landing page

A landing page for Skylark, a third-party X API service. Built with [Next.js](https://nextjs.org) (App Router, TypeScript) and [Tailwind CSS v4](https://tailwindcss.com), managed with [pnpm](https://pnpm.io).

## Project structure

```
twitterapi/
├── app/
│   ├── layout.tsx       # Root layout: metadata and fonts (next/font)
│   ├── page.tsx         # Landing page sections
│   └── globals.css      # Tailwind import, theme tokens, base styles
├── components/
│   ├── Header.tsx       # Sticky site header
│   ├── CodeCard.tsx     # Code-sample tabs (client component)
│   └── Faq.tsx          # FAQ accordion (client component)
├── next.config.ts
├── postcss.config.mjs   # Tailwind v4 PostCSS plugin
├── tsconfig.json
└── package.json
```

## Getting started

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Other scripts

```bash
pnpm build   # Production build
pnpm start   # Serve the production build
```
