"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CircleHelp, ExternalLink, FlaskConical, LayoutGrid, Plus, RefreshCw, Search, ShieldCheck, Wallet, X } from "lucide-react";
import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { useAppKit, useAppKitProvider } from "@reown/appkit/react";
import { useAccount, useChainId } from "wagmi";
import { projectId } from "@/lib/wallet";
import { CalldataAddress, TransactionHashVariant } from "genlayer-js/types";
import { hexToBytes } from "viem";
import { formatGen, parseGen } from "@/lib/amount";
import "./markets.css";

type Amount = string | number | bigint;
type Market = { address: string; model: string; metric: string; dataset: string; target_bps: number; deadline: number; checkpoint_cid: string; report_cid: string; score_bps: number; resolved: boolean; cancelled: boolean; success: boolean; yes_pool: Amount; no_pool: Amount; bond: Amount };
type Position = { yes_stake: Amount; no_stake: Amount; claimed: boolean };
type Tab = "explore" | "portfolio" | "create";
const KEY = "kally-market-addresses-v1";
const DEFAULT_MARKETS: string[] = ["0xdbCE247Dd96d108B36AF589Fa23E93797a71BbE5"];
const explorer = "https://explorer-studio-dev.genlayer.com";
const reader = createClient({ chain: studioDevnet });
const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
const isMarket = (value: unknown): value is Omit<Market, "address"> => {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return typeof m.model === "string" && typeof m.metric === "string" &&
    typeof m.dataset === "string" && typeof m.deadline === "number" &&
    typeof m.target_bps === "number" && typeof m.resolved === "boolean" &&
    typeof m.cancelled === "boolean" && typeof m.checkpoint_cid === "string" &&
    typeof m.report_cid === "string" && typeof m.score_bps === "number" &&
    typeof m.success === "boolean" && [m.yes_pool, m.no_pool, m.bond].every(v => {
      try { return BigInt(v as string | number | bigint) >= 0n; } catch { return false; }
    });
};
const gen = formatGen;
const short = (v: string) => v ? `${v.slice(0, 6)}…${v.slice(-4)}` : "";
const date = (n: number) => new Date(n * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const daysLeft = (n: number, now: number) => Math.max(0, Math.ceil((n * 1000 - now) / 86400000));
const isOpen = (m: Market, now: number) => !m.resolved && m.deadline * 1000 > now && BigInt(m.bond) > 0n;
const canClaim = (m: Market, p?: Position) => {
  if (!m.resolved || !p || p.claimed) return false;
  const yes = BigInt(p.yes_stake), no = BigInt(p.no_stake);
  if (m.cancelled || BigInt(m.success ? m.yes_pool : m.no_pool) === 0n) return yes + no > 0n;
  return (m.success ? yes : no) > 0n;
};

export default function MarketsPage() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const [tab, setTab] = useState<Tab>("explore");
  const [addresses, setAddresses] = useState<string[]>(DEFAULT_MARKETS);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState<string>("");
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider<{ request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }>("eip155");
  const wallet = connectedAddress || "";
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [readError, setReadError] = useState("");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("0.1");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const refreshSeq = useRef(0);
  const [notice, setNotice] = useState("");
  const [importAddress, setImportAddress] = useState("");
  const [form, setForm] = useState({ model: "", target: "80", deadline: "" });
  const [checkpoint, setCheckpoint] = useState("");
  const [report, setReport] = useState("");
  const current = markets.find(m => m.address === selected);

  useEffect(() => { const id = setTimeout(() => { try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(saved)) setAddresses([...new Set([...DEFAULT_MARKETS, ...saved.filter(isAddress)])]); } catch { /* Ignore malformed browser storage. */ } }, 0); return () => clearTimeout(id); }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(addresses)); } catch { /* Browsers may disable storage. */ } }, [addresses]);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setLoading(true); setReadError("");
    const results = await Promise.allSettled(addresses.map(async address => {
      const data = await reader.readContract({ address: address as `0x${string}`, functionName: "get_market", args: [], transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL });
      if (!isMarket(data)) throw new Error("Incompatible market contract");
      return { ...data, address };
    }));
    if (seq !== refreshSeq.current) return;
    const valid = results.filter((r): r is PromiseFulfilledResult<Market> => r.status === "fulfilled").map(r => r.value);
    const failed = results.length - valid.length;
    if (failed) setReadError(`${failed} market${failed === 1 ? "" : "s"} could not be loaded. Check Studio Dev and retry.`);
    setMarkets(valid);
    setSelected(old => old && valid.some(m => m.address === old) ? old : valid[0]?.address || "");
    setLoading(false);
  }, [addresses]);
  useEffect(() => { const id = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(id); }, [refresh]);
  useEffect(() => {
    if (!wallet || !markets.length) { const id = setTimeout(() => { setPositions({}); setPositionsLoading(false); }, 0); return () => clearTimeout(id); }
    let active = true;
    const loadingId = setTimeout(() => setPositionsLoading(true), 0);
    void Promise.all(markets.map(async m => {
      try { const p = await reader.readContract({ address: m.address as `0x${string}`, functionName: "get_position", args: [new CalldataAddress(hexToBytes(wallet as `0x${string}`))], transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL }) as Position; return [m.address, p] as const; }
      catch { return null; }
    })).then(rows => { if (active) { setPositions(Object.fromEntries(rows.filter((r): r is readonly [string, Position] => r !== null))); setPositionsLoading(false); if (rows.some(r => r === null)) setReadError("Some wallet positions could not be loaded. Retry refresh."); } });
    return () => { active = false; clearTimeout(loadingId); };
  }, [wallet, markets]);

  const connect = async () => {
    if (!projectId) { setNotice("Wallet connection is unavailable: Reown project ID is missing."); return; }
    try { await open(); } catch (error) { setNotice(`Wallet connection failed: ${String(error instanceof Error ? error.message : error)}`); }
  };
  const withWallet = async () => {
    if (!wallet || !walletProvider) { await connect(); throw new Error("Connect your wallet, then retry the action."); }
    if (chainId !== 61997) { await open({ view: "Networks" }); throw new Error("Switch your wallet to GenLayer Studio Dev and retry."); }
    return createClient({ chain: studioDevnet, account: wallet as `0x${string}`, provider: walletProvider as never });
  };
  const action = async (fn: () => Promise<string>, success: string) => {
    setBusy(true); setNotice("");
    try {
      const tx = await fn();
      setNotice(`Transaction ${tx} submitted. Waiting for validator decision…`);
      const decision = await reader.waitForDecision({ hash: tx as never });
      if (!isSuccessful(decision)) throw new Error(`Transaction ${tx} was rejected. Review it in the Studio Dev explorer.`);
      setNotice(`Transaction ${tx} was accepted. Waiting for finality…`);
      try {
        const finalized = await reader.waitForFinalization({ hash: tx as never, interval: 3000, retries: 60 });
        if (!isSuccessful(finalized)) throw new Error(`Transaction ${tx} did not finalize successfully.`);
        setNotice(`${success} Finalized transaction: ${tx}.`);
      } catch (error) {
        setNotice(`Transaction ${tx} was accepted, but finality is not confirmed here. Check the Studio Dev explorer before retrying. ${String(error instanceof Error ? error.message : error)}`);
      }
      void refresh();
    }
    catch (error) { setNotice(`${String(error instanceof Error ? error.message : error)} If you already signed, check the transaction in the explorer before retrying.`); }
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
    if (!isOpen(current, now)) { setNotice("Betting is closed or the creator bond has not been funded."); return; }
    let value: bigint;
    try { value = parseGen(amount); } catch (error) { setNotice(String(error)); return; }
    void action(() => write(current.address, "place_bet", [side === "yes"], value), "Position submitted.");
  };
  const createMarket = () => {
    const targetText = form.target.trim();
    const validTarget = /^(?:0|[1-9]\d?|100)(?:\.\d{1,2})?$/.test(targetText);
    const [whole = "0", fraction = ""] = targetText.split(".");
    const target = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
    const deadline = Math.floor(new Date(form.deadline).getTime() / 1000);
    if (!form.model.trim() || !validTarget || target > 10000 || !Number.isFinite(deadline) || deadline <= Date.now() / 1000) { setNotice("Enter a model, target from 0 to 100 with at most two decimals, and a future deadline."); return; }
    void action(async () => {
      const client = await withWallet();
      const source = await fetch("/KallyMarket.py").then(r => { if (!r.ok) throw new Error("Contract source unavailable"); return r.text(); });
      const estimate = await client.estimateTransactionFees();
      const call = { code: source, args: [form.model.trim(), target, deadline, "https://ipfs.io/ipfs/"], fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } };
      const tx = await client.deployContract(call as never);
      const receipt = await reader.waitForDecision({ hash: tx as never });
      if (!isSuccessful(receipt)) throw new Error(`Deployment ${tx} failed. Inspect the explorer.`);
      const address = receipt.recipient || (receipt.txDataDecoded && "contractAddress" in receipt.txDataDecoded ? receipt.txDataDecoded.contractAddress : undefined);
      if (address && isAddress(address)) setAddresses(old => [...new Set([...old, address])]);
      else throw new Error(`Deployment ${tx} succeeded but no contract address was returned. Import it from the explorer.`);
      return tx;
    }, "Market deployment submitted.");
  };
  const addMarket = async () => { const address = importAddress.trim(); if (!isAddress(address)) { setNotice("Enter a valid GenLayer contract address."); return; } try { const data = await reader.readContract({ address: address as `0x${string}`, functionName: "get_market", args: [] }); if (!isMarket(data)) throw new Error("Address is not a compatible Kally market."); setAddresses(old => [...new Set([...old, address])]); setImportAddress(""); setTab("explore"); setNotice("Market added to this browser."); } catch (error) { setNotice(`Could not import market: ${String(error)}`); } };
  const filtered = useMemo(() => markets.filter(m => m.model.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "open" ? isOpen(m, now) : m.resolved))), [markets, search, filter, now]);

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
          <div className="metric-strip"><div><span>ACTIVE MARKETS</span><strong>{markets.filter(m => isOpen(m, now)).length}</strong></div><div><span>TOTAL VOLUME</span><strong>{gen(markets.reduce((s,m) => s + BigInt(m.yes_pool) + BigInt(m.no_pool), 0n))} <small>GEN</small></strong></div><div><span>RESOLVED MARKETS</span><strong>{markets.filter(m => m.resolved).length}</strong></div><div className="metric-note"><ShieldCheck size={20}/><span>Outcomes recorded<br/>on GenLayer</span></div></div>
          <div className="market-layout"><div className="market-list-area"><div className="market-toolbar"><div className="filter-tabs">{(["all","open","resolved"] as const).map(f => <button key={f} className={filter === f ? "chosen" : ""} onClick={() => setFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}</div><div className="search-box"><Search size={16}/><input aria-label="Search markets" placeholder="Search markets" value={search} onChange={e => setSearch(e.target.value)}/></div><button className="icon-button" aria-label="Refresh" onClick={() => void refresh()}><RefreshCw size={17}/></button></div>
            {readError && <div className="notice" role="alert">{readError}</div>}{loading ? <div className="empty-state">Loading live markets…</div> : filtered.length ? <div className="market-list">{filtered.map(m => <button key={m.address} className={`market-row ${selected === m.address ? "selected" : ""}`} onClick={() => setSelected(m.address)}><div className="market-icon"><FlaskConical size={20}/></div><div className="market-row-main"><div className="market-row-meta"><span>AI BENCHMARK</span><span>•</span><span>{m.metric.toUpperCase()}</span></div><strong>Will {m.model} reach {m.target_bps / 100}% accuracy?</strong><div className="market-row-foot"><span>{m.resolved ? m.cancelled ? "Cancelled" : "Resolved" : isOpen(m, now) ? `${daysLeft(m.deadline, now)} days left` : "Betting closed"}</span><span>Ends {date(m.deadline)}</span></div></div><div className="market-row-right"><span className={m.resolved ? "status done" : "status"}>{m.cancelled ? "CANCELLED" : m.resolved ? "SETTLED" : isOpen(m, now) ? "OPEN" : "CLOSED"}</span><strong>{gen(BigInt(m.yes_pool) + BigInt(m.no_pool))} <small>GEN</small></strong><span>Volume <ArrowRight size={13}/></span></div></button>)}</div> : <div className="empty-state"><FlaskConical size={30}/><strong>No markets here yet</strong><span>Deploy a market or add an existing contract address.</span></div>}
            <div className="import-card"><div><strong>Have a market address?</strong><p>Track any Kally contract on Studio Dev.</p></div><div className="import-control"><input aria-label="Contract address" placeholder="0x… contract address" value={importAddress} onChange={e => setImportAddress(e.target.value)}/><button onClick={() => void addMarket()}>Add <ArrowRight size={15}/></button></div></div>
          </div><div className="detail-area">{current ? <><div className="detail-top"><span>MARKET DETAILS</span><div className="detail-links"><button type="button" onClick={() => document.getElementById("position-controls")?.scrollIntoView({ behavior: "smooth", block: "center" })}>{isOpen(current, now) ? "Bet YES / NO" : "View status"}</button><a href={`${explorer}/address/${current.address}`} target="_blank" rel="noreferrer">View on explorer <ExternalLink size={14}/></a></div></div><div className="detail-body"><div className="detail-icon"><FlaskConical size={22}/></div><h2>Will {current.model} reach {current.target_bps / 100}% accuracy?</h2><p>Measured on the {current.dataset} classification dataset.</p><div className="detail-grid"><div><span>TARGET SCORE</span><strong>{current.target_bps / 100}%</strong></div><div><span>DEADLINE</span><strong>{date(current.deadline)}</strong></div><div><span>YES POOL</span><strong>{gen(current.yes_pool)} GEN</strong></div><div><span>NO POOL</span><strong>{gen(current.no_pool)} GEN</strong></div></div><div className="detail-divider"/><p className="detail-disclaimer">Demo limitation: submitted predictions are scored without running or verifying the model checkpoint. Outcomes can be manipulated. Use test GEN only.</p><div className="detail-label" id="position-controls">TAKE A POSITION</div>{!current.resolved && current.deadline * 1000 > now ? <>{BigInt(current.bond) === 0n && <div className="resolution-box">Awaiting creator bond. Predictions will open after funding.</div>}<div className="side-switch"><button className={side === "yes" ? "yes selected" : "yes"} onClick={() => setSide("yes")}>Yes <Check size={16}/></button><button className={side === "no" ? "no selected" : "no"} onClick={() => setSide("no")}>No <X size={16}/></button></div><label className="form-label">Amount in GEN<div className="amount-control"><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}/><span>GEN</span></div></label><button className="submit-button" disabled={busy || BigInt(current.bond) === 0n} onClick={placeBet}>{busy ? "Submitting…" : BigInt(current.bond) === 0n ? "Awaiting creator bond" : `Place ${side.toUpperCase()} position`} <ArrowUpRight size={17}/></button></> : <div className="resolution-box"><span>{current.cancelled ? "Market cancelled" : current.resolved ? `Final score: ${current.score_bps / 100}%` : BigInt(current.bond) === 0n ? "Awaiting creator bond" : "Betting has closed"}</span>{current.resolved && !current.cancelled && <strong>{current.success ? "Target achieved" : "Target missed"}</strong>}</div>}
            <div className="admin-actions"><span>MARKET ACTIONS · AMOUNT FIELD ABOVE SETS BOND</span><button disabled={busy || current.resolved} onClick={() => void action(() => write(current.address, "fund_bond", [], parseGen(amount)), "Bond funding submitted.")}>Fund creator bond <ArrowRight size={14}/></button><input placeholder="Checkpoint CID" value={checkpoint} onChange={e => setCheckpoint(e.target.value)}/><button disabled={busy || !checkpoint || current.resolved || !!current.checkpoint_cid} onClick={() => void action(() => write(current.address, "submit_checkpoint", [checkpoint]), "Checkpoint submitted.")}>Submit checkpoint <ArrowRight size={14}/></button><input placeholder="Report CID" value={report} onChange={e => setReport(e.target.value)}/><button disabled={busy || !report || current.resolved || current.deadline * 1000 > now || !current.checkpoint_cid} onClick={() => void action(() => write(current.address, "resolve", [report]), "Resolution submitted.")}>Resolve market <ArrowRight size={14}/></button><button disabled={busy || !current.resolved || !canClaim(current, positions[current.address])} onClick={() => void action(() => write(current.address, "claim"), "Claim submitted.")}>Claim payout <ArrowRight size={14}/></button><button disabled={busy || !current.resolved} onClick={() => void action(() => write(current.address, "claim_bond"), "Bond claim submitted.")}>Claim bond <ArrowRight size={14}/></button><button disabled={busy || current.resolved || current.deadline * 1000 + 604800000 > now} onClick={() => void action(() => write(current.address, "cancel_unresolved"), "Cancellation submitted.")}>Cancel unresolved market <ArrowRight size={14}/></button><button disabled={busy || current.resolved || !!current.checkpoint_cid || current.deadline * 1000 > now} onClick={() => void action(() => write(current.address, "cancel_missing_checkpoint"), "Missing-checkpoint cancellation submitted.")}>Cancel missing checkpoint <ArrowRight size={14}/></button></div></div></> : <div className="detail-empty"><CircleHelp size={28}/><strong>Select a market</strong><p>Market rules and position controls appear here.</p></div>}</div></div>
        </>}
        {tab === "portfolio" && <>{readError && <div className="notice" role="alert">{readError}</div>}<div className="app-heading"><div><p className="eyebrow">YOUR POSITIONS</p><h1>Portfolio<span>.</span></h1><p>Follow your conviction from opening to settlement.</p></div></div>{!wallet ? <div className="portfolio-empty"><Wallet size={33}/><h2>Connect to see your positions.</h2><p>Your market activity is read directly from GenLayer.</p><button className="dark-button" onClick={() => void connect()}>Connect wallet <ArrowUpRight size={17}/></button></div> : positionsLoading ? <div className="portfolio-empty">Loading positions…</div> : <div className="portfolio-list">{markets.filter(m => BigInt(positions[m.address]?.yes_stake || 0) + BigInt(positions[m.address]?.no_stake || 0) > 0n).map(m => <div className="portfolio-row" key={m.address}><div><span className="eyebrow">{m.cancelled ? "CANCELLED" : m.resolved ? "SETTLED" : isOpen(m, now) ? "OPEN" : "CLOSED"}</span><h3>{m.model} · {m.target_bps / 100}% accuracy</h3><p>Yes {gen(positions[m.address]?.yes_stake || 0)} GEN · No {gen(positions[m.address]?.no_stake || 0)} GEN · {positions[m.address]?.claimed ? "Claimed" : "Unclaimed"}</p></div><button onClick={() => { setTab("explore"); setSelected(m.address); }}>View market <ArrowUpRight size={16}/></button></div>)}{Object.values(positions).every(p => BigInt(p.yes_stake) + BigInt(p.no_stake) === 0n) && <div className="portfolio-empty"><Wallet size={33}/><h2>No positions yet.</h2><p>Explore a market and take your first position.</p><button className="dark-button" onClick={() => setTab("explore")}>Explore markets <ArrowUpRight size={17}/></button></div>}</div>}</>}
        {tab === "create" && <><div className="app-heading"><div><p className="eyebrow">SET THE QUESTION</p><h1>Create a market<span>.</span></h1><p>Define a testable outcome for the community.</p></div></div><div className="create-layout"><div className="create-form"><div className="form-section-title"><span>01</span><div><h2>Market details</h2><p>Use a clear model name and measurable target.</p></div></div><label className="form-label">Model name<input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="e.g. DemoModel" maxLength={100}/></label><div className="form-two"><label className="form-label">Target accuracy (%)<input type="number" min="0" max="100" step="0.01" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}/></label><label className="form-label">Deadline<input type="datetime-local" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}/></label></div><div className="form-section-title second"><span>02</span><div><h2>Deploy on GenLayer</h2><p>The market rules will be stored in an intelligent contract.</p></div></div><div className="info-banner"><ShieldCheck size={19}/><span>Metric: accuracy · Dataset: kally-demo-v1 · Network: Studio Dev</span></div><button className="submit-button create-submit" disabled={busy} onClick={createMarket}>{busy ? "Deploying…" : "Deploy market"}<ArrowUpRight size={17}/></button><p className="create-note">After deployment, fund the creator bond to open betting. The new address is saved in this browser. The demo benchmark scores submitted predictions; it does not execute model checkpoints.</p></div><div className="create-aside"><div className="create-aside-image"/><div className="create-aside-body"><span className="eyebrow">GOOD MARKETS START WITH GOOD QUESTIONS</span><h3>Make the outcome unambiguous.</h3><p>Choose a specific model and deadline. Every participant should know exactly what score will settle the market.</p><a href="https://docs.genlayer.com/developers/intelligent-contracts/" target="_blank" rel="noreferrer">Read GenLayer docs <ArrowUpRight size={15}/></a></div></div></div></>}
      </div>
    </main>
  </div>;
}
