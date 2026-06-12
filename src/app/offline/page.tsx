import Image from "next/image";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="max-w-md text-center">
        <Image className="mx-auto h-24 w-24 object-contain" src="/letw-logo.png" alt="LETW logo" width={160} height={160} />
        <h1 className="mt-5 text-2xl font-semibold">You are offline</h1>
        <p className="mt-3 text-sm leading-6 text-ink/60">
          LETW protected workspace data needs a secure connection. Reconnect to continue syncing messages, files, forms, and meetings.
        </p>
        <Link className="mt-5 inline-flex h-10 items-center rounded-md bg-moss px-4 text-sm font-medium text-white" href="/dashboard">
          Try again
        </Link>
      </div>
    </main>
  );
}
