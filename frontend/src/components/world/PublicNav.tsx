import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AuthNavLink } from '@/features/auth/AuthNavLink';

export function BrandMark({ size = 34, tone = 'honey' }: { size?: number; tone?: 'honey' | 'navy' }) {
  return (
    <Image
      src={tone === 'honey' ? '/brand/itinbee-mark-honey.svg' : '/brand/itinbee-mark-navy.svg'}
      alt=""
      width={Math.round((size * 530) / 580)}
      height={size}
      unoptimized
      aria-hidden="true"
    />
  );
}

const LINKS = [
  { href: '/explore', label: 'Explore' },
  { href: '/destinations', label: 'Destinations' },
  { href: '/create', label: 'Create' },
  { href: '/trips', label: 'My trips' },
] as const;

/** Solid trunk-dark bar with brass trim. Mobile menu is a native <details>. */
export function PublicNav() {
  return (
    <header className="relative z-40 border-b border-saffron/30 bg-trunk-dark">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2 text-saffron" aria-label="Itinbee home">
          <BrandMark />
          <span className="display text-[32px] leading-none">itinbee</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-[44px] items-center rounded-md px-3.5 py-2 text-[15px] font-semibold text-paper/90 transition-colors hover:bg-paper/10 hover:text-paper"
            >
              {l.label}
            </Link>
          ))}
          <AuthNavLink />
          <Link
            href="/create"
            className="ml-2 inline-flex min-h-[44px] items-center rounded-full border-[1.5px] border-saffron px-4 text-[15px] font-bold text-saffron transition-colors hover:bg-saffron hover:text-navy"
          >
            Plan a trip
          </Link>
        </nav>

        <details className="group relative md:hidden">
          <summary
            className="flex min-h-[44px] min-w-[44px] cursor-pointer list-none items-center justify-center rounded-md text-paper [&::-webkit-details-marker]:hidden"
            aria-label="Menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </summary>
          <nav
            aria-label="Mobile main"
            className="absolute right-0 top-12 z-50 flex w-60 flex-col gap-1 rounded-lg border border-saffron/30 bg-trunk-dark p-2 shadow-tag"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-3 text-base font-semibold text-paper hover:bg-paper/10"
              >
                {l.label}
              </Link>
            ))}
            <AuthNavLink mobile />
            <Link href="/create" className="btn-stamp mt-1">
              Plan a trip
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
