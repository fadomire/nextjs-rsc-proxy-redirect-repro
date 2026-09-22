import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <Link href="/redirect-source">redirect-source</Link>
      <Link href="/rewrite-source">rewrite-source</Link>
    </main>
  );
}
