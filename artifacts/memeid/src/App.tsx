import { useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, ExternalLink, Fingerprint, Menu, ShieldCheck, Sparkles, X } from 'lucide-react';

const navItems = [
  ['Vision', 'vision'], ['How it works', 'how-it-works'], ['Ecosystem', 'ecosystem'], ['Roadmap', 'roadmap'], ['FAQ', 'faq'],
];

const faqs = [
  ['What is ATTENTION?', 'ATTENTION is a project focused on the concept of verifiable digital identity for meme coin logos and project profiles.'],
  ['Why does meme coin identity matter?', 'A recognizable identity and a verifiable record can help people distinguish registered artwork from unauthorized copies and better understand a project’s claimed provenance.'],
  ['Will ATTENTION create or launch tokens?', 'No. ATTENTION is focused on project identity and provenance, not token creation or token launches.'],
  ['Will identities be NFTs on Solana?', 'NFT-based registration on Solana is the intended direction. The final implementation details remain subject to development.'],
  ['Does an ATTENTION identity prove that a token is safe?', 'No. An identity record can provide information about registered artwork and metadata, but it cannot guarantee that a token or its creators are trustworthy.'],
  ['Is the platform available now?', 'This website presents the project vision. The actual identity registration and verification application is not being built as part of this website.'],
];

function Mark({ large = false }: { large?: boolean }) {
  return <div className={`mark ${large ? 'mark-large' : ''}`} aria-label="Attention emblem"><span className="mark-bar bar-a" /><span className="mark-bar bar-b" /><span className="mark-bar bar-c" /></div>;
}

function Button({ children, href = '#vision', secondary = false }: { children: React.ReactNode; href?: string; secondary?: boolean }) {
  return <a className={`button ${secondary ? 'button-secondary' : ''}`} href={href}>{children}<ArrowRight size={15} /></a>;
}

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`reveal ${className}`}>{children}</div>;
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return <div className="site-shell">
    <header className="navbar">
      <a className="brand" href="#top" aria-label="Attention home"><Mark /><span>ATTENTION</span></a>
      <nav className={menuOpen ? 'nav-links nav-open' : 'nav-links'} aria-label="Primary navigation">
        {navItems.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}
        <Button href="#vision">Explore the vision</Button>
      </nav>
      <button className="menu-button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
    </header>

    <main id="top">
      <section className="hero section-pad">
        <div className="hero-glow glow-one" /><div className="hero-glow glow-two" />
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> Solana · digital identity</p>
          <h1>Every Meme<br /><em>Deserves an Identity.</em></h1>
          <p className="hero-sub">ATTENTION is building toward a future where every meme coin project can establish a recognizable identity through its original artwork, project metadata, and a publicly verifiable record.</p>
          <div className="hero-actions"><Button href="#vision">Explore our vision</Button><a className="text-link" href="#how-it-works">How it works <ArrowDown size={15} /></a></div>
        </div>
        <div className="hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><img src="/memeid-brand-reference.png" alt="Abstract cyan and green Attention emblem" /></div>
        <a className="scroll-cue" href="#problem"><span>Scroll to explore</span><ArrowDown size={15} /></a>
      </section>

      <section id="problem" className="section-pad problem-section">
        <Reveal><p className="eyebrow">01 · The problem</p><h2>In a world of infinite memes,<br /><span>identity matters.</span></h2><p className="section-intro">Meme coins move at internet speed. Project logos can be copied, identities can be impersonated, and it can be difficult to distinguish original artwork from unauthorized reproductions.</p></Reveal>
        <div className="card-grid three-col">
          {[['01', 'Identity confusion', 'Similar names, copied logos, and impersonation can make it difficult to identify a project’s original visual identity.'], ['02', 'No clear provenance', 'Without a verifiable record, the origin and registration history of a project’s artwork may be difficult to establish.'], ['03', 'Fragmented identity', 'Project information and visual identity can be scattered across social platforms, token pages, and community channels.']].map(([num, title, text]) => <Reveal key={num}><article className="info-card"><span className="card-number">{num}</span><div className="abstract-icon"><span /></div><h3>{title}</h3><p>{text}</p></article></Reveal>)}
        </div>
      </section>

      <section id="vision" className="section-pad vision-section">
        <div className="vision-layout"><Reveal><p className="eyebrow">02 · The vision</p><h2>Identity should be<br /><span>verifiable.</span></h2><p className="section-intro">ATTENTION envisions an identity layer for the meme coin ecosystem, connecting a project’s visual identity with a verifiable digital record.</p><div className="principles">{[['01', 'Originality', 'Establish a record of a project’s submitted logo and associated identity metadata.'], ['02', 'Provenance', 'Associate the record with a creator wallet and a registration timestamp.'], ['03', 'Verification', 'Create a path for people and compatible applications to inspect a project’s registered identity.']].map(([num, title, text]) => <div className="principle" key={num}><span>{num}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></Reveal><Reveal className="identity-visual"><div className="visual-card visual-logo"><Mark large /><span>original artwork</span></div><div className="visual-line line-one" /><div className="visual-card visual-meta"><Fingerprint size={20} /><div><b>identity record</b><small>creator · timestamp · metadata</small></div></div><div className="visual-line line-two" /><div className="visual-card visual-cert"><ShieldCheck size={22} /><div><b>publicly verifiable</b><small>Solana identity layer · proposed</small></div></div><div className="visual-caption">A conceptual identity record<br />not a live blockchain interface</div></Reveal></div>
      </section>

      <section id="how-it-works" className="section-pad how-section"><Reveal><p className="eyebrow">03 · How it works</p><h2>From artwork to<br /><span>verifiable identity.</span></h2></Reveal><div className="timeline">{[['01', 'Create an identity', 'A creator prepares a project name, ticker, logo, description, and relevant project links.'], ['02', 'Register the artwork', 'The proposed platform records the logo and associated metadata using an appropriate decentralized storage solution.'], ['03', 'Establish provenance', 'The proposed system creates an on-chain identity record associated with the creator’s wallet and registration time.'], ['04', 'Verify the record', 'Users can inspect the registered identity and compare its recorded metadata with project information.']].map(([num, title, text]) => <Reveal key={num} className="timeline-item"><div className="timeline-number">{num}</div><div><h3>{title}</h3><p>{text}</p></div></Reveal>)}</div><p className="disclaimer"><Sparkles size={15} /> These steps describe the intended product concept. NFT registration and verification are not available through this organization website.</p></section>

      <section id="ecosystem" className="section-pad ecosystem-section"><Reveal><p className="eyebrow">04 · Ecosystem</p><h2>Designed for an<br /><span>open ecosystem.</span></h2><p className="section-intro">Digital identity becomes more useful when it can be recognized across the tools and communities where meme coins live.</p></Reveal><div className="card-grid three-col ecosystem-cards">{[['Launchpads', 'Explore future ways for launch platforms to reference registered project identities.'], ['Trading tools', 'Explore how compatible trading interfaces and bots might display identity information alongside token data.'], ['Developers', 'Work toward a developer-friendly approach for applications that want to read and reference registered identities.']].map(([title, text]) => <Reveal key={title}><article className="eco-card"><div className="eco-top"><span>{title}</span><ExternalLink size={15} /></div><p>{text}</p><small>Potential future direction</small></article></Reveal>)}</div><a className="text-link journey-link" href="#roadmap">Follow the journey <ArrowRight size={15} /></a></section>

      <section className="section-pad scope-section"><Reveal><p className="eyebrow">05 · The distinction</p><h2>A foundation for identity.<br /><span>Not another launchpad.</span></h2></Reveal><div className="scope-grid"><div className="scope-column is-column"><h3><Check size={18} /> ATTENTION is</h3>{['Focused on meme coin identity and artwork provenance.', 'Designed around publicly verifiable records.', 'Exploring NFT-based identity registration on Solana.', 'Intended to support future ecosystem integrations.'].map(item => <p key={item}><Check size={14} />{item}</p>)}</div><div className="scope-column not-column"><h3><X size={18} /> ATTENTION is not</h3>{['A token launchpad.', 'A meme coin creation tool.', 'A trading platform.', 'A guarantee that a token is legitimate or safe.'].map(item => <p key={item}><X size={14} />{item}</p>)}</div></div><blockquote>“An identity record can help establish provenance. It does not guarantee a project’s honesty, prevent a rug pull, or prove that a token is safe.”</blockquote></section>

      <section id="roadmap" className="section-pad roadmap-section"><Reveal><p className="eyebrow">06 · Roadmap</p><h2>Building toward<br /><span>verifiable identity.</span></h2><p className="section-intro">A proposed path from a clear standard to a more open ecosystem.</p></Reveal><div className="roadmap-grid">{[['01', 'Foundation', ['Establish the ATTENTION brand', 'Define the identity and provenance model', 'Document the core product vision']], ['02', 'Protocol design', ['Define the identity metadata standard', 'Research NFT implementation options on Solana', 'Evaluate decentralized storage options']], ['03', 'Product development', ['Develop the identity registration application', 'Implement wallet-based authorization', 'Build the verification experience']], ['04', 'Ecosystem expansion', ['Explore developer tooling and API access', 'Investigate potential launchpad integrations', 'Gather feedback from creators']]].map(([num, title, items]) => <Reveal key={num}><article className="roadmap-card"><div className="phase">Phase {num} · planned</div><h3>{title}</h3>{(items as string[]).map(item => <p key={item}><span />{item}</p>)}</article></Reveal>)}</div></section>

      <section id="faq" className="section-pad faq-section"><Reveal><p className="eyebrow">07 · FAQ</p><h2>Questions worth<br /><span>asking.</span></h2></Reveal><div className="faq-list">{faqs.map(([question, answer], index) => <Reveal key={question}><div className={`faq-item ${openFaq === index ? 'faq-open' : ''}`}><button onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}><span>{question}</span><ChevronDown size={18} /></button>{openFaq === index && <p>{answer}</p>}</div></Reveal>)}</div></section>

      <section className="final-cta section-pad"><div className="cta-art"><div className="cta-ring" /><img src="/memeid-brand-reference.png" alt="Attention emblem floating above a reflective surface" /></div><div className="cta-copy"><p className="eyebrow">Stay curious</p><h2>The internet moves fast.<br /><span>Identity should last.</span></h2><p>We’re exploring a more verifiable future for meme coin identity, built around original artwork, transparent provenance, and open ecosystem participation.</p><Button href="#top">Stay connected</Button></div></section>
    </main>

    <footer className="footer section-pad"><div className="footer-brand"><a className="brand" href="#top"><Mark /><span>ATTENTION</span></a><p>Every Meme Deserves an Identity.</p></div><div className="footer-links">{navItems.map(([label, id]) => <a key={id} href={`#${id}`}>{label}</a>)}</div><div className="footer-bottom"><span>© {new Date().getFullYear()} ATTENTION</span><span>Identity registration and verification are not provided by this organization website.</span></div></footer>
  </div>;
}

export default App;
