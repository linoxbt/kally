import Link from "next/link";
import { ArrowRight, ArrowUpRight, CircleCheck, DatabaseZap, ScanEye } from "lucide-react";

const steps = [
  { n: "01", title: "Choose a measurable outcome", copy: "A model, a dataset, a target score, and a deadline. Every market starts with a question you can test." },
  { n: "02", title: "Take a position", copy: "Back yes or no with GEN. Positions and payouts live in a GenLayer intelligent contract." },
  { n: "03", title: "Resolve with evidence", copy: "A benchmark report is pinned to IPFS. Validators agree on the score before the market settles." },
];

export default function Home() {
  return <main className="landing">
    <header className="site-header wrap">
      <Link href="/" className="brand"><img className="brand-logo" src="/kally-logo.png" alt=""/><span>Kally<span className="brand-dot">.</span></span></Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#standard">The standard</a><Link href="/markets">Markets</Link><Link href="/docs">Docs</Link></nav>
      <Link href="/markets" className="header-cta">Launch app <ArrowUpRight size={17}/></Link>
    </header>
    <section className="hero"><div className="hero-image" aria-hidden="true" /><div className="hero-shade" /><div className="wrap hero-content">
      <div className="eyebrow light"><span className="pulse-dot"/> THE FUTURE HAS A SCORE</div>
      <h1>Conviction meets<br/><em>computation.</em></h1>
      <p>Take a position on the next AI breakthrough. Kally turns model benchmarks into transparent, on-chain markets.</p>
      <div className="hero-actions"><Link href="/markets" className="button button-lime">Explore markets <ArrowUpRight size={18}/></Link><a href="#how-it-works" className="text-link light-link">See how it works <ArrowRight size={17}/></a></div>
      <div className="hero-footer"><span>POWERED BY <strong>GenLayer</strong></span><span>BUILT FOR THE CURIOUS</span></div>
    </div></section>
    <section className="intro wrap" id="standard"><div><p className="eyebrow">A NEW KIND OF SIGNAL</p><h2>Opinions are everywhere.<br/><em>Evidence is rare.</em></h2></div><div className="intro-copy"><p>AI moves fast. Headlines move faster. Kally gives builders, researchers, and the curious a way to express what they believe will actually happen—and settle it against a defined result.</p><Link href="/markets" className="underlined-link">See the market <ArrowUpRight size={17}/></Link></div></section>
    <section className="feature-grid wrap"><div className="feature-photo"><div className="photo-caption"><span>FIELD NOTES / 001</span><strong>The next threshold is already in motion.</strong></div></div><div className="feature-panel"><div className="eyebrow">DESIGNED FOR CLARITY</div><h3>A clear question.<br/>A verifiable answer.</h3><p>Each market publishes the model, metric, target, and deadline upfront. Evidence is linked to an immutable content identifier, with the final outcome recorded on GenLayer.</p><div className="feature-points"><div><ScanEye/><span>Transparent criteria</span></div><div><DatabaseZap/><span>IPFS backed evidence</span></div><div><CircleCheck/><span>On-chain settlement</span></div></div></div></section>
    <section className="process wrap" id="how-it-works"><div className="section-top"><div><p className="eyebrow">HOW KALLY WORKS</p><h2>From hypothesis<br/><em>to outcome.</em></h2></div><p>Simple enough to use in a minute. Rigorous enough to make the result matter.</p></div><div className="step-grid">{steps.map(s=><article className="step" key={s.n}><span className="step-number">{s.n}</span><h3>{s.title}</h3><p>{s.copy}</p><ArrowUpRight size={19}/></article>)}</div></section>
    <section className="closing"><div className="wrap closing-inner"><div><p className="eyebrow light">THE MARKET IS OPEN</p><h2>What do you believe<br/>AI can do next?</h2></div><Link href="/markets" className="button button-lime">Enter Kally <ArrowUpRight size={18}/></Link></div></section>
    <footer className="footer wrap"><Link href="/" className="brand"><img className="brand-logo" src="/kally-logo.png" alt=""/><span>Kally<span className="brand-dot">.</span></span></Link><span>Benchmark markets on GenLayer Studio Dev</span><Link href="/docs">Kally docs <ArrowUpRight size={14}/></Link></footer>
  </main>
}
