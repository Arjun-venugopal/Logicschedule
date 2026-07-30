"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 text-center">
      <h1 className="text-6xl font-bold text-amber-500 mb-2">404</h1>
      <h2 className="text-xl font-semibold text-white mb-4">Page Not Found</h2>
      <p className="text-sm text-neutral-400 max-w-md mb-6">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="px-5 py-2.5 bg-amber-500 text-black font-semibold rounded-xl hover:bg-amber-400 transition-colors text-sm"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
