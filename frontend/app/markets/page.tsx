"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, ExternalLink, FlaskConical, LayoutGrid, Plus, RefreshCw, Search, ShieldCheck, Wallet, X } from "lucide-react";
import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { useAppKit, useAppKitProvider } from "@reown/appkit/react";
import { useAccount, useChainId } from "wagmi";
import { projectId } from "@/lib/wallet";
import { TransactionHashVariant } from "genlayer-js/types";
import "./markets.css";

type Market = { address: string; model: string; metric: string; dataset: string; target_bps: number; deadline: number; checkpoint_cid: string; report_cid: string; score_bps: number; resolved: boolean; cancelled: boolean; success: boolean; yes_pool: number; no_pool: number; bond: number };
type Position = { yes_stake: number; no_stake: number; claimed: boolean };
type Tab = "explore" | "portfolio" | "create";
const KEY = "kally-market-addresses-v1";
const DEFAULT_MARKETS: string[] = ["0xdbCE247Dd96d108B36AF589Fa23E93797a71BbE5"];
const explorer = "https://explorer-studio-dev.genlayer.com";
const reader = createClient({ chain: studioDevnet });
const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
const gen = (wei: number) => (Number(wei || 0) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 3 });
const short = (v: string) => v ? `${v.slice(0, 6)}…${v.slice(-4)}` : "";
const date = (n: number) => new Date(n * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const daysLeft = (n: number) => Math.max(0, Math.ceil((n * 1000 - Date.now()) / 86400000));

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("explore");
  const [addresses, setAddresses] = useState<string[]>(DEFAULT_MARKETS);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState<string>("");
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider<{ request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }>("eip155");
  const wallet = connectedAddress || "";
  const [position, setPosition] = useState<Position | null>(null);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("0.1");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [importAddress, setImportAddress] = useState("");
  const [form, setForm] = useState({ model: "", target: "80", deadline: "", bond: "0.1" });
  const [checkpoint, setCheckpoint] = useState("");
  const [report, setReport] = useState("");
  const current = markets.find(m => m.address === selected);

  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(saved)) setAddresses([...new Set([...DEFAULT_MARKETS, ...saved.filter(isAddress)])]); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(addresses)); } catch {} }, [addresses]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled(addresses.map(async address => {
      const data = await reader.readContract({ address: address as `0x${string}`, functionName: "get_market", args: [], transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL }) as Omit<Market, "address">;
      return { ...data, address } as Market;
    }));
    const valid = results.filter((r): r is PromiseFulfilledResult<Market> => r.status === "fulfilled").map(r => r.value);
    setMarkets(valid);
    setSelected(old => old && valid.some(m => m.address === old) ? old : valid[0]?.address || "");
    setLoading(false);
  }, [addresses]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!wallet || !selected) { setPosition(null); return; } void reader.readContract({ address: selected as `0x${string}`, functionName: "get_position", args: [wallet as `0x${string}`], transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL }).then(v => setPosition(v as Position)).catch(() => setPosition(null)); }, [wallet, selected, markets]);
  useEffect(() => {
    if (!wallet || !markets.length) { setPositions({}); return; }
    void Promise.all(markets.map(async m => {
      try { const p = await reader.readContract({ address: m.address as `0x${string}`, functionName: "get_position", args: [wallet as `0x${string}`], transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL }) as Position; return [m.address, p] as const; }
      catch { return null; }
    })).then(rows => setPositions(Object.fromEntries(rows.filter((r): r is readonly [string, Position] => r !== null))));
  }, [wallet, markets]);

  const connect = async () => {
    if (!projectId) { setNotice("Wallet connection is unavailable: Reown project ID is missing."); return; }
    await open();
  };
  const withWallet = async () => {
    if (!wallet || !walletProvider) { await connect(); throw new Error("Connect your wallet, then retry the action."); }
    if (chainId !== 61997) { await open({ view: "Networks" }); throw new Error("Switch your wallet to GenLayer Studio Dev and retry."); }
    return createClient({ chain: studioDevnet, account: wallet as `0x${string}`, provider: walletProvider as never });
  };
  const action = async (fn: () => Promise<string>, success: string) => {
    setBusy(true); setNotice("");
    try { const tx = await fn(); setNotice(`Transaction ${short(tx)} submitted. Waiting for validator decision…`); const receipt = await reader.waitForDecision({ hash: tx as never }); if (!isSuccessful(receipt)) throw new Error(`Transaction ${short(tx)} was not executed successfully. Review it in the Studio Dev explorer.`); setNotice(`${success} Transaction: ${short(tx)}.`); void refresh(); }
    catch (error) { setNotice(String(error instanceof Error ? error.message : error)); }
    finally { setBusy(false); }
  };
  const write = async (address: string, functionName: string, args: unknown[] = [], value = BigInt(0)) => {
    const client = await withWallet();
    const estimate = await client.estimateTransactionFeesForWrite({ address: address as `0x${string}`, functionName, args: args as never, value });
    const call = { address: address as `0x${string}`, functionName, args, value, fees: { distribution: estimate.distribution, messageAllocations: estimate.messageAllocations, feeValue: estimate.feeValue } };
    return await client.writeContract(call as never);
  };
  const placeBet = () => {
    if (!current) return;
    const value = toWei(amount);
    if (value <= BigInt(0)) { setNotice("Enter a GEN amount greater than zero."); return; }
    void action(() => write(current.address, "place_bet", [side === "yes"], value), "Position submitted.");
  };
  const createMarket = () => {
    const target = Math.round(Number(form.target) * 100);
    const deadline = Math.floor(new Date(form.deadline).getTime() / 1000);
    if (!form.model.trim() || !Number.isInteger(target) || target < 0 || target > 10000 || deadline <= Date.now() / 1000) { setNotice("Enter a model, target from 0 to 100, and a future deadline."); return; }
    void action(async () => {
      const client = await withWallet();
      const source = await fetch("/KallyMarket.py").then(r => { if (!r.ok) throw new Error("Contract source unavailable"); return r.text(); });
      const estimate = await client.estimateTransactionFees();
      const call = { code: source, args: [form.model.trim(), target, deadline, "https://ipfs.io/ipfs/"], fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } };
      const tx = await client.deployContract(call as never);
      setNotice(`Deployment submitted: ${tx}. Add the contract address once it appears in the explorer.`);
      return tx;
    }, "Market deployment submitted.");
  };
  const addMarket = () => { const address = importAddress.trim(); if (!isAddress(address)) { setNotice("Enter a valid GenLayer contract address."); return; } setAddresses(old => [...new Set([...old, address])]); setImportAddress(""); setTab("explore"); setNotice("Market added to this browser."); };
  const filtered = useMemo(() => markets.filter(m => m.model.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "open" ? !m.resolved : m.resolved))), [markets, search, filter]);

  return <div className="app-shell">
    <aside className="app-sidebar">
      <Link href="/" className="brand app-brand"><img className="brand-logo" src="/kally-logo.png" alt=""/><span>Kally<span className="brand-dot">.</span></span></Link>
      <div className="side-label">WORKSPACE</div>
      <button className={`side-link ${tab === "explore" ? "active" : ""}`} onClick={() => setTab("explore")}><LayoutGrid size={18}/> Explore markets</button>
      <button className={`side-link ${tab === "portfolio" ? "active" : ""}`} onClick={() => setTab("portfolio")}><Wallet size={18}/> My portfolio</button>
      <button className={`side-link ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}><Plus size={18}/> Create market</button>
      <Link className="side-link" href="/docs"><CircleHelp size={18}/> Documentation</Link>
      <div className="side-bottom"><div className="network-card"><span className="network-dot"/> GenLayer Studio Dev <small>Development testnet</small></div><Link href="/" className="sidebar-back">Back to Kally <ArrowUpRight size={15}/></Link></div>
    </aside>
    <main className="app-main"><div className="app-topbar"><div className="crumb">KALLY <span>/</span> {tab === "explore" ? "MARKETS" : tab === "portfolio" ? "PORTFOLIO" : "CREATE MARKET"}</div><div className="top-actions"><span className="studionet-pill"><span className="network-dot"/> STUDIO DEV</span><button className="wallet-button" onClick={() => void connect()}><Wallet size={16}/>{wallet ? short(wallet) : "Connect wallet"}</button></div></div>
      <div className="app-content">
        {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}><X size={15}/></button></div>}
        {tab === "explore" && <><div className="app-heading"><div><p className="eyebrow">THE MARKET FLOOR</p><h1>Explore markets<span>.</span></h1><p>Take a position on what AI can achieve next.</p></div><button className="dark-button" onClick={() => setTab("create")}><Plus size={17}/> Create market</button></div>
          <div className="metric-strip"><div><span>ACTIVE MARKETS</span><strong>{markets.filter(m => !m.resolved).length}</strong></div><div><span>TOTAL VOLUME</span><strong>{gen(markets.reduce((s,m) => s + Number(m.yes_pool) + Number(m.no_pool), 0))} <small>GEN</small></strong></div><div><span>RESOLVED MARKETS</span><strong>{markets.filter(m => m.resolved).length}</strong></div><div className="metric-note"><ShieldCheck size={20}/><span>Outcomes recorded<br/>on GenLayer</span></div></div>
          <div className="market-layout"><div className="market-list-area"><div className="market-toolbar"><div className="filter-tabs">{(["all","open","resolved"] as const).map(f => <button key={f} className={filter === f ? "chosen" : ""} onClick={() => setFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}</div><div className="search-box"><Search size={16}/><input aria-label="Search markets" placeholder="Search markets" value={search} onChange={e => setSearch(e.target.value)}/></div><button className="icon-button" aria-label="Refresh" onClick={() => void refresh()}><RefreshCw size={17}/></button></div>
            {loading ? <div className="empty-state">Loading live markets…</div> : filtered.length ? <div className="market-list">{filtered.map(m => <button key={m.address} className={`market-row ${selected === m.address ? "selected" : ""}`} onClick={() => setSelected(m.address)}><div className="market-icon"><FlaskConical size={20}/></div><div className="market-row-main"><div className="market-row-meta"><span>AI BENCHMARK</span><span>•</span><span>{m.metric.toUpperCase()}</span></div><strong>Will {m.model} reach {m.target_bps / 100}% accuracy?</strong><div className="market-row-foot"><span>{m.resolved ? m.cancelled ? "Cancelled" : "Resolved" : `${daysLeft(m.deadline)} days left`}</span><span>Ends {date(m.deadline)}</span></div></div><div className="market-row-right"><span className={m.resolved ? "status done" : "status"}>{m.resolved ? "SETTLED" : "OPEN"}</span><strong>{gen(Number(m.yes_pool) + Number(m.no_pool))} <small>GEN</small></strong><span>Volume <ArrowRight size={13}/></span></div></button>)}</div> : <div className="empty-state"><FlaskConical size={30}/><strong>No markets here yet</strong><span>Deploy a market or add an existing contract address.</span></div>}
            <div className="import-card"><div><strong>Have a market address?</strong><p>Track any Kally contract on Studio Dev.</p></div><div className="import-control"><input aria-label="Contract address" placeholder="0x… contract address" value={importAddress} onChange={e => setImportAddress(e.target.value)}/><button onClick={addMarket}>Add <ArrowRight size={15}/></button></div></div>
          </div><div className="detail-area">{current ? <><div className="detail-top"><span>MARKET DETAILS</span><a href={`${explorer}/address/${current.address}`} target="_blank" rel="noreferrer">View on explorer <ExternalLink size={14}/></a></div><div className="detail-body"><div className="detail-icon"><FlaskConical size={22}/></div><h2>Will {current.model} reach {current.target_bps / 100}% accuracy?</h2><p>Measured on the {current.dataset} classification dataset.</p><div className="detail-grid"><div><span>TARGET SCORE</span><strong>{current.target_bps / 100}%</strong></div><div><span>DEADLINE</span><strong>{date(current.deadline)}</strong></div><div><span>YES POOL</span><strong>{gen(current.yes_pool)} GEN</strong></div><div><span>NO POOL</span><strong>{gen(current.no_pool)} GEN</strong></div></div><div className="detail-divider"/><div className="detail-label">TAKE A POSITION</div>{!current.resolved && daysLeft(current.deadline) > 0 ? <>{Number(current.bond) === 0 && <div className="resolution-box">Awaiting creator bond. Predictions will open after funding.</div>}<div className="side-switch"><button className={side === "yes" ? "yes selected" : "yes"} onClick={() => setSide("yes")}>Yes <Check size={16}/></button><button className={side === "no" ? "no selected" : "no"} onClick={() => setSide("no")}>No <X size={16}/></button></div><label className="form-label">Amount in GEN<div className="amount-control"><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}/><span>GEN</span></div></label><button className="submit-button" disabled={busy || Number(current.bond) === 0} onClick={placeBet}>{busy ? "Submitting…" : Number(current.bond) === 0 ? "Awaiting creator bond" : `Place ${side.toUpperCase()} position`} <ArrowUpRight size={17}/></button></> : <div className="resolution-box"><span>{current.cancelled ? "Market cancelled" : current.resolved ? `Final score: ${current.score_bps / 100}%` : Number(current.bond) === 0 ? "Awaiting creator bond" : "Betting has closed"}</span>{current.resolved && !current.cancelled && <strong>{current.success ? "Target achieved" : "Target missed"}</strong>}</div>}
            <p className="detail-disclaimer">Studio Dev uses test GEN. Review the market rules and contract before taking a position.</p><div className="admin-actions"><span>MARKET ACTIONS · AMOUNT FIELD ABOVE SETS BOND</span><button disabled={busy} onClick={() => void action(() => write(current.address, "fund_bond", [], toWei(amount)), "Bond funding submitted.")}>Fund creator bond <ArrowRight size={14}/></button><input placeholder="Checkpoint CID" value={checkpoint} onChange={e => setCheckpoint(e.target.value)}/><button disabled={busy || !checkpoint} onClick={() => void action(() => write(current.address, "submit_checkpoint", [checkpoint]), "Checkpoint submitted.")}>Submit checkpoint <ArrowRight size={14}/></button><input placeholder="Report CID" value={report} onChange={e => setReport(e.target.value)}/><button disabled={busy || !report} onClick={() => void action(() => write(current.address, "resolve", [report]), "Resolution submitted.")}>Resolve market <ArrowRight size={14}/></button><button disabled={busy} onClick={() => void action(() => write(current.address, "claim"), "Claim submitted.")}>Claim payout <ArrowRight size={14}/></button><button disabled={busy} onClick={() => void action(() => write(current.address, "claim_bond"), "Bond claim submitted.")}>Claim bond <ArrowRight size={14}/></button><button disabled={busy} onClick={() => void action(() => write(current.address, "cancel_unresolved"), "Cancellation submitted.")}>Cancel unresolved market <ArrowRight size={14}/></button></div></div></> : <div className="detail-empty"><CircleHelp size={28}/><strong>Select a market</strong><p>Market rules and position controls appear here.</p></div>}</div></div>
        </>}
        {tab === "portfolio" && <><div className="app-heading"><div><p className="eyebrow">YOUR POSITIONS</p><h1>Portfolio<span>.</span></h1><p>Follow your conviction from opening to settlement.</p></div></div>{!wallet ? <div className="portfolio-empty"><Wallet size={33}/><h2>Connect to see your positions.</h2><p>Your market activity is read directly from GenLayer.</p><button className="dark-button" onClick={() => void connect()}>Connect wallet <ArrowUpRight size={17}/></button></div> : <div className="portfolio-list">{markets.filter(m => Number(positions[m.address]?.yes_stake || 0) + Number(positions[m.address]?.no_stake || 0) > 0).map(m => <div className="portfolio-row" key={m.address}><div><span className="eyebrow">{m.resolved ? "SETTLED" : "OPEN"}</span><h3>{m.model} · {m.target_bps / 100}% accuracy</h3><p>Yes {gen(positions[m.address]?.yes_stake || 0)} GEN · No {gen(positions[m.address]?.no_stake || 0)} GEN · {positions[m.address]?.claimed ? "Claimed" : "Unclaimed"}</p></div><button onClick={() => { setTab("explore"); setSelected(m.address); }}>View market <ArrowUpRight size={16}/></button></div>)}{Object.values(positions).every(p => Number(p.yes_stake) + Number(p.no_stake) === 0) && <div className="portfolio-empty"><Wallet size={33}/><h2>No positions yet.</h2><p>Explore a market and take your first position.</p><button className="dark-button" onClick={() => setTab("explore")}>Explore markets <ArrowUpRight size={17}/></button></div>}</div>}</>}
        {tab === "create" && <><div className="app-heading"><div><p className="eyebrow">SET THE QUESTION</p><h1>Create a market<span>.</span></h1><p>Define a testable outcome for the community.</p></div></div><div className="create-layout"><div className="create-form"><div className="form-section-title"><span>01</span><div><h2>Market details</h2><p>Use a clear model name and measurable target.</p></div></div><label className="form-label">Model name<input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="e.g. DemoModel" maxLength={100}/></label><div className="form-two"><label className="form-label">Target accuracy (%)<input type="number" min="0" max="100" step="0.01" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}/></label><label className="form-label">Deadline<input type="datetime-local" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}/></label></div><div className="form-section-title second"><span>02</span><div><h2>Deploy on GenLayer</h2><p>The market rules will be stored in an intelligent contract.</p></div></div><div className="info-banner"><ShieldCheck size={19}/><span>Metric: accuracy · Dataset: kally-demo-v1 · Network: Studio Dev</span></div><button className="submit-button create-submit" disabled={busy} onClick={createMarket}>{busy ? "Deploying…" : "Deploy market"}<ArrowUpRight size={17}/></button><p className="create-note">After deployment, fund the bond through the contract and add its address to Kally. The demo benchmark scores submitted predictions; it does not execute model checkpoints.</p></div><div className="create-aside"><div className="create-aside-image"/><div className="create-aside-body"><span className="eyebrow">GOOD MARKETS START WITH GOOD QUESTIONS</span><h3>Make the outcome unambiguous.</h3><p>Choose a specific model and deadline. Every participant should know exactly what score will settle the market.</p><a href="https://docs.genlayer.com/developers/intelligent-contracts/" target="_blank" rel="noreferrer">Read GenLayer docs <ArrowUpRight size={15}/></a></div></div></div></>}
      </div>
    </main>
  </div>;
}

function toWei(value: string): bigint { const n = Number(value); if (!Number.isFinite(n) || n <= 0) return BigInt(0); return BigInt(Math.round(n * 1e9)) * BigInt(1_000_000_000); }
