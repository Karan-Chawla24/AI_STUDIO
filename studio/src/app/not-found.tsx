import Link from "next/link";
export default function NotFound() {
  return <main className="standalone"><p className="eyebrow">404 · Page not found</p><h1>A little off the path.</h1><p>This page doesn’t exist. Head back to your studio.</p><Link className="button primary" href="/home">Back to Home</Link></main>;
}
