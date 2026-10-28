import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, Copy, ExternalLink, Fingerprint, ImagePlus, LoaderCircle, Menu, Search, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';

const navItems = [
  ['Vision', 'vision'], ['Registry', 'registry'], ['How it works', 'how-it-works'], ['Ecosystem', 'ecosystem'], ['Roadmap', 'roadmap'], ['FAQ', 'faq'],
];

const faqs = [
  ['What is ATTENTION?', 'ATTENTION is a project focused on the concept of verifiable digital identity for meme coin logos and project profiles.'],
  ['Why does meme coin identity matter?', 'A recognizable identity and a verifiable record can help people distinguish registered artwork from unauthorized copies and better understand a project’s claimed provenance.'],
  ['Will ATTENTION create or launch tokens?', 'No. ATTENTION is focused on project identity and provenance, not token creation or token launches.'],
  ['Will identities be NFTs on Solana?', 'NFT-based registration on Solana is the intended direction. The final implementation details remain subject to development.'],
  ['Does an ATTENTION identity prove that a token is safe?', 'No. An identity record can provide information about registered artwork and metadata, but it cannot guarantee that a token or its creators are trustworthy.'],
  ['Can I look up a token now?', 'Yes. The live registry search uses public DEX Screener profile data for market context. Attention identity verification is a separate provenance check and does not imply that a token is safe.'],
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

type TokenProfile = { url: string; chainId: string; tokenAddress: string; icon?: string; header?: string | null; description?: string | null; links?: { type: string; label?: string; url: string }[] | null };

function TokenDiscovery({ onVerify }: { onVerify: (query: string) => void }) {
  const [profiles, setProfiles] = useState<TokenProfile[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [searched, setSearched] = useState<TokenProfile | null>(null);

  useEffect(() => {
    fetch('https://api.dexscreener.com/token-profiles/latest/v1')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load profiles')))
      .then((data: TokenProfile[] | TokenProfile) => setProfiles(Array.isArray(data) ? data.slice(0, 6) : [data]))
      .catch(() => setStatus('error'))
      .finally(() => setStatus((current) => current === 'error' ? current : 'idle'));
  }, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setStatus('loading'); setSearched(null);
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(value)}`);
      const data = await response.json();
      setSearched(data.pairs?.[0]?.info ? { ...data.pairs[0].info, tokenAddress: data.pairs[0].baseToken.address, chainId: data.pairs[0].chainId, url: data.pairs[0].url } : null);
      setStatus('idle');
    } catch { setStatus('error'); }
  };

  return <section id="registry" className="section-pad registry-section"><div className="registry-heading"><div><p className="eyebrow">Live registry intelligence</p><h2>See what&apos;s <span>already visible.</span></h2><p className="section-intro">Search any Solana token address and pull its public profile data from DEX Screener. Attention identity records are designed to sit alongside this market context, not replace it.</p></div><div className="api-badge"><span className="api-dot" /> DEX Screener API · live</div></div><form className="registry-search" onSubmit={search}><Search size={18} /><input aria-label="Token address" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Paste a Solana token address" /><button className="button" type="submit">{status === 'loading' ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Search</button></form>{status === 'error' && <p className="registry-note">The market feed is temporarily unavailable. Try again shortly.</p>}{searched && <article className="token-result"><img src={searched.icon || '/memeid-brand-reference.png'} alt="" /><div><span className="token-chain">{searched.chainId} · public profile</span><h3>{searched.description || 'Token profile found'}</h3><code>{searched.tokenAddress}</code></div><button className="text-link text-button" onClick={() => onVerify(searched.tokenAddress)}>Verify identity <ArrowRight size={15} /></button></article>}<div className="registry-topline"><span>Latest public profiles</span><a href="https://dexscreener.com" target="_blank" rel="noreferrer">Open DEX Screener <ExternalLink size={13} /></a></div><div className="profile-grid">{profiles.map((profile) => <article className="profile-card" key={profile.tokenAddress}><img src={profile.icon || '/memeid-brand-reference.png'} alt="" /><div className="profile-copy"><div><span>{profile.chainId}</span><a href={profile.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a></div><p>{profile.description || 'Community token profile'}</p><code>{profile.tokenAddress.slice(0, 6)}…{profile.tokenAddress.slice(-4)}</code></div></article>)}</div>{status === 'loading' && profiles.length === 0 && <div className="registry-loading"><LoaderCircle className="spin" /> Loading public profiles…</div>}</section>;
}

function IdentityModal({ mode, onClose }: { mode: 'register' | 'verify'; onClose: () => void }) {
  const [logo, setLogo] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [form, setForm] = useState({ name: '', ticker: '', description: '', wallet: '', website: '', twitter: '', telegram: '', tokenAddress: '', query: '' });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setLogo(URL.createObjectURL(file));
  };
  const handleSubmit = (event: FormEvent) => { event.preventDefault(); setSubmitted(true); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
      {!submitted ? <>
        <p className="eyebrow">{mode === 'register' ? 'Creator workspace' : 'Public registry'}</p>
        <h2 id="modal-title">{mode === 'register' ? <>Register your <span>identity.</span></> : <>Verify a <span>MemeID.</span></>}</h2>
        <p className="modal-intro">{mode === 'register' ? 'Prepare your project record before minting on Solana mainnet.' : 'Search the registry by project ID, NFT address, or creator wallet.'}</p>
        <form onSubmit={handleSubmit}>
          {mode === 'register' ? <>
            <label>Project name<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Moon Frog" /></label>
            <label>Ticker<input required maxLength={8} value={form.ticker} onChange={(event) => update('ticker', event.target.value.toUpperCase())} placeholder="MOON" /></label>
            <label>Description<textarea required rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="What makes this identity recognizable?" /></label>
            <label className="upload-zone"><ImagePlus size={20} /><span>{logo ? 'Logo selected' : 'Add original logo artwork'}<small>PNG, JPG, GIF or WebP · max 6 MB</small></span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleLogo} /></label>
            <div className="studio-grid"><label>Website<input type="url" value={form.website} onChange={(event) => update('website', event.target.value)} placeholder="https://" /></label><label>X / Twitter<input value={form.twitter} onChange={(event) => update('twitter', event.target.value)} placeholder="@project" /></label></div>
            <div className="studio-grid"><label>Telegram<input value={form.telegram} onChange={(event) => update('telegram', event.target.value)} placeholder="t.me/project" /></label><label>Token address <small className="field-optional">optional</small><input value={form.tokenAddress} onChange={(event) => update('tokenAddress', event.target.value)} placeholder="Add after launch" /></label></div>
            <label>Creator wallet<input required value={form.wallet} onChange={(event) => update('wallet', event.target.value)} placeholder="Connect wallet to continue" /></label>
            <div className="identity-preview"><div className="preview-art">{logo ? <img src={logo} alt="Uploaded project artwork" /> : <><Mark large /><span>{generated ? 'GENERATED IDENTITY' : 'ARTWORK PREVIEW'}</span></>}</div><div><span className="token-chain">Draft identity · Solana mainnet</span><strong>{form.name || 'Your project name'} {form.ticker && <small>${form.ticker}</small>}</strong><p>{form.description || 'Add a description to preview the public identity record.'}</p></div></div>
            <button type="button" className="studio-generate" onClick={() => setGenerated(true)}><Sparkles size={15} /> Generate a starter mark</button>
          </> : <label>Search the registry<div className="search-input"><Search size={16} /><input required value={form.query} onChange={(event) => update('query', event.target.value)} placeholder="Project ID or NFT address" /></div></label>}
          <button className="button modal-submit" type="submit">{mode === 'register' ? <><Wallet size={15} /> Connect & continue</> : <><Search size={15} /> Check record</>}</button>
        </form>
      </> : <div className="success-state"><div className="success-icon"><Check /></div><p className="eyebrow">{mode === 'register' ? 'Identity prepared' : 'Registry result'}</p><h2>{mode === 'register' ? <>Identity draft <span>created.</span></> : <>Record <span>found.</span></>}</h2>{mode === 'register' ? <><p>Your artwork and metadata are ready for wallet authorization and on-chain minting.</p><div className="record-summary"><span>Next step</span><strong>Approve the Solana mainnet transaction</strong><small>Artwork and metadata will be stored with the identity record.</small></div></> : <><p>This prototype found a matching public lookup target. In production, the verifier compares the NFT metadata hash, creator wallet, and registration timestamp.</p><div className="record-summary"><span>Verification target</span><strong>{form.query}</strong><small><ShieldCheck size={13} /> Metadata integrity check · ready</small></div></>}<button className="button" onClick={onClose}>Back to Attention <ArrowRight size={15} /></button></div>}
    </section>
  </div>;
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [modal, setModal] = useState<'register' | 'verify' | null>(null);
  return <div className="site-shell">
    <header className="navbar">
      <a className="brand" href="#top" aria-label="Attention home"><Mark /><span>ATTENTION</span></a>
      <nav className={menuOpen ? 'nav-links nav-open' : 'nav-links'} aria-label="Primary navigation">
        {navItems.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}
        <button className="nav-action" onClick={() => setModal('verify')}><Search size={14} /> Verify</button><button className="nav-action nav-action-primary" onClick={() => setModal('register')}><Wallet size={14} /> Register identity</button>
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
          <div className="hero-actions"><button className="button" onClick={() => setModal('register')}><Wallet size={15} /> Register identity</button><button className="text-link text-button" onClick={() => setModal('verify')}><Search size={15} /> Verify a record</button></div>
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

      <TokenDiscovery onVerify={(query) => { setModal('verify'); }} />

      <section id="how-it-works" className="section-pad how-section"><Reveal><p className="eyebrow">03 · How it works</p><h2>From artwork to<br /><span>verifiable identity.</span></h2></Reveal><div className="timeline">{[['01', 'Create an identity', 'A creator prepares a project name, ticker, logo, description, and relevant project links.'], ['02', 'Register the artwork', 'The proposed platform records the logo and associated metadata using an appropriate decentralized storage solution.'], ['03', 'Establish provenance', 'The proposed system creates an on-chain identity record associated with the creator’s wallet and registration time.'], ['04', 'Verify the record', 'Users can inspect the registered identity and compare its recorded metadata with project information.']].map(([num, title, text]) => <Reveal key={num} className="timeline-item"><div className="timeline-number">{num}</div><div><h3>{title}</h3><p>{text}</p></div></Reveal>)}</div><p className="disclaimer"><Sparkles size={15} /> These steps describe the intended product concept. NFT registration and verification are not available through this organization website.</p></section>

      <section id="ecosystem" className="section-pad ecosystem-section"><Reveal><p className="eyebrow">04 · Ecosystem</p><h2>Designed for an<br /><span>open ecosystem.</span></h2><p className="section-intro">Digital identity becomes more useful when it can be recognized across the tools and communities where meme coins live.</p></Reveal><div className="card-grid three-col ecosystem-cards">{[['Launchpads', 'Explore future ways for launch platforms to reference registered project identities.'], ['Trading tools', 'Explore how compatible trading interfaces and bots might display identity information alongside token data.'], ['Developers', 'Work toward a developer-friendly approach for applications that want to read and reference registered identities.']].map(([title, text]) => <Reveal key={title}><article className="eco-card"><div className="eco-top"><span>{title}</span><ExternalLink size={15} /></div><p>{text}</p><small>Potential future direction</small></article></Reveal>)}</div><a className="text-link journey-link" href="#roadmap">Follow the journey <ArrowRight size={15} /></a></section>

      <section className="section-pad scope-section"><Reveal><p className="eyebrow">05 · The distinction</p><h2>A foundation for identity.<br /><span>Not another launchpad.</span></h2></Reveal><div className="scope-grid"><div className="scope-column is-column"><h3><Check size={18} /> ATTENTION is</h3>{['Focused on meme coin identity and artwork provenance.', 'Designed around publicly verifiable records.', 'Exploring NFT-based identity registration on Solana.', 'Intended to support future ecosystem integrations.'].map(item => <p key={item}><Check size={14} />{item}</p>)}</div><div className="scope-column not-column"><h3><X size={18} /> ATTENTION is not</h3>{['A token launchpad.', 'A meme coin creation tool.', 'A trading platform.', 'A guarantee that a token is legitimate or safe.'].map(item => <p key={item}><X size={14} />{item}</p>)}</div></div><blockquote>“An identity record can help establish provenance. It does not guarantee a project’s honesty, prevent a rug pull, or prove that a token is safe.”</blockquote></section>

      <section id="roadmap" className="section-pad roadmap-section"><Reveal><p className="eyebrow">06 · Roadmap</p><h2>Building toward<br /><span>verifiable identity.</span></h2><p className="section-intro">A proposed path from a clear standard to a more open ecosystem.</p></Reveal><div className="roadmap-grid">{[['01', 'Foundation', ['Establish the ATTENTION brand', 'Define the identity and provenance model', 'Document the core product vision']], ['02', 'Protocol design', ['Define the identity metadata standard', 'Research NFT implementation options on Solana', 'Evaluate decentralized storage options']], ['03', 'Product development', ['Develop the identity registration application', 'Implement wallet-based authorization', 'Build the verification experience']], ['04', 'Ecosystem expansion', ['Explore developer tooling and API access', 'Investigate potential launchpad integrations', 'Gather feedback from creators']]].map(([num, title, items]) => <Reveal key={String(num)}><article className="roadmap-card"><div className="phase">Phase {num} · planned</div><h3>{title}</h3>{(items as string[]).map(item => <p key={String(item)}><span />{item}</p>)}</article></Reveal>)}</div></section>

      <section id="faq" className="section-pad faq-section"><Reveal><p className="eyebrow">07 · FAQ</p><h2>Questions worth<br /><span>asking.</span></h2></Reveal><div className="faq-list">{faqs.map(([question, answer], index) => <Reveal key={question}><div className={`faq-item ${openFaq === index ? 'faq-open' : ''}`}><button onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}><span>{question}</span><ChevronDown size={18} /></button>{openFaq === index && <p>{answer}</p>}</div></Reveal>)}</div></section>

      <section className="final-cta section-pad"><div className="cta-art"><div className="cta-ring" /><img src="/memeid-brand-reference.png" alt="Attention emblem floating above a reflective surface" /></div><div className="cta-copy"><p className="eyebrow">Stay curious</p><h2>The internet moves fast.<br /><span>Identity should last.</span></h2><p>We’re exploring a more verifiable future for meme coin identity, built around original artwork, transparent provenance, and open ecosystem participation.</p><Button href="#top">Stay connected</Button></div></section>
    </main>
    {modal && <IdentityModal mode={modal} onClose={() => setModal(null)} />}

    <footer className="footer section-pad"><div className="footer-brand"><a className="brand" href="#top"><Mark /><span>ATTENTION</span></a><p>Every Meme Deserves an Identity.</p></div><div className="footer-links">{navItems.map(([label, id]) => <a key={id} href={`#${id}`}>{label}</a>)}</div><div className="footer-bottom"><span>© {new Date().getFullYear()} ATTENTION</span><span>Identity registration and verification are not provided by this organization website.</span></div></footer>
  </div>;
}

export default App;
