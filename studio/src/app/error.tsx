"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="standalone" role="alert"><p className="eyebrow">Something went wrong</p><h1>Let’s try that again.</h1><p>We couldn’t load this view.</p><button className="button primary" onClick={reset}>Try again</button></div>;
}
