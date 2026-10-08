'use client';
import {useEffect, useRef, useState} from 'react';
import {ethers} from 'ethers';
import {createProofDockClient, readableError, STATUS_LABELS} from '../lib/proofdock-client.mjs';

const VIEWS = [['compile', '服务记录'], ['records', '上链记录'], ['api', 'API 接入'], ['assets', '我的资产']];
const short = value => value ? `${value.slice(0, 8)}…${value.slice(-5)}` : '—';
const decimal = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 5});
const date = value => new Date(value).toLocaleString('zh-CN', {hour12: false});
const serviceName = service => service?.id === 'local-solidity' ? 'Solidity 编译' : service?.name || '';
function Json({value, label = '查看完整 JSON'}) { return <details className="json-disclosure"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>; }
function Pill({status, demo}) { return <span className={`pill ${status || ''}`}>{demo ? '示例 · ' : ''}{STATUS_LABELS[status] || status}</span>; }

export default function Home() {
  const [view, setView] = useState('compile'), [cfg, setCfg] = useState(null), [client, setClient] = useState(null);
  const [services, setServices] = useState([]), [records, setRecords] = useState([]), [pagination, setPagination] = useState({total: 0, nextOffset: null});
  const [filters, setFilters] = useState({service: '', status: ''}), [offset, setOffset] = useState(0);
  const [parameters, setParameters] = useState(null), [balance, setBalance] = useState(null);
  const [ownedRecords, setOwnedRecords] = useState([]);
  const [compiler, setCompiler] = useState(null), [source, setSource] = useState(''), [result, setResult] = useState(null), [draft, setDraft] = useState(null);
  const [selectedService, setSelectedService] = useState('local-solidity');
  const [reports, setReports] = useState([]), [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState({text: '', error: false});
  const [events, setEvents] = useState([]), [modal, setModal] = useState(null);
  const [apiSample, setApiSample] = useState(null);
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false), scope = useRef({}), clientRef = useRef(null), cfgRef = useRef(null), dialogRef = useRef(null);
  scope.current = {filters, offset, balance, modal, view};
  const chosenService = services.find(service => service.id === selectedService);
  const canCompile = chosenService?.executionStatus === 'local-demo-available' && chosenService.executionEndpoint === '/api/local-compiler';
  const wallet = balance?.address;
  const notify = (text, error = false) => setNotice({text, error});
  function event(item) { setEvents(previous => [...previous.slice(-119), item]); }
  function navigate(next) { const target = next === 'home' ? 'compile' : next; setNotice({text: '', error: false}); location.hash = target === 'compile' ? '#/' : `#/${target}`; setView(target); window.scrollTo({top:0, behavior:'instant'}); }
  async function refresh(active = clientRef.current) {
    if (!active) return;
    const current = scope.current;
    const query = new URLSearchParams({limit: '20', offset: String(current.offset)});
    if (current.filters.service) query.set('serviceId', current.filters.service);
    if (current.filters.status) query.set('status', current.filters.status);
    const [catalog, rows, verification] = await Promise.all([
      active.request('/api/v1/services', {}, false), active.request(`/api/v1/records?${query}`, {}, false), active.request('/api/verification', {}, false)
    ]);
    setServices(catalog.services); setRecords(rows.records); setPagination(rows.pagination);
    setReports(verification.reports); setOnline(true);
    if (current.modal?.type === 'record') {
      const snapshot = await active.request(`/api/v1/records/${current.modal.record.id}`, {}, false);
      setModal(previous => previous?.type === 'record' && previous.record.id === snapshot.record.id ? {...previous, record: snapshot.record, verification: snapshot.verification} : previous);
    }
    if (current.balance) {
      try {
        const fresh = await active.balances(); setBalance(fresh);
        if (current.view === 'assets') {
          let cursor = 0; const owned = [];
          do {
            const page = await active.request(`/api/v1/records?limit=100&offset=${cursor}`, {}, false);
            owned.push(...page.records.filter(row => row.publisher.toLowerCase() === fresh.address.toLowerCase()));
            cursor = page.pagination.nextOffset;
          } while (cursor != null);
          setOwnedRecords(owned);
        }
      } catch { setBalance(null); setOwnedRecords([]); }
    }
  }
  useEffect(() => {
    let mounted = true;
    const hash = () => { const next = location.hash.slice(2); setView(VIEWS.some(([id]) => id === next) || next === 'agent' ? next : 'compile'); };
    hash(); window.addEventListener('hashchange', hash);
    async function initialize() {
      try {
        const response = await fetch('/deployment.json', {cache: 'no-store'});
        if (!response.ok) throw new Error('部署配置不可用，请先启动项目。');
        const config = await response.json();
        if (!mounted) return;
        cfgRef.current = config; setCfg(config);
        const active = createProofDockClient({cfg: config, ethereum: window.ethereum, onEvent: event});
        clientRef.current = active; setClient(active);
        const values = await active.parameters(); if (!mounted) return; setParameters(values);
        const info = await active.request('/api/local-compiler', {}, false);
        if (!mounted) return;
        setCompiler(info); setSource(info.sampleRequest.sources['Counter.sol'].content);
        try {
          const saved = JSON.parse(localStorage.getItem('proofdock-draft-v3'));
          if (saved?.resetId === config.resetId && saved.payload?.demo === false) setDraft(saved);
          else localStorage.removeItem('proofdock-draft-v3');
        } catch { /* Storage is optional; actual public records always come from the server. */ }
        await refresh(active);
      } catch (error) { if (mounted) { setOnline(false); notify(readableError(error), true); } }
    }
    initialize();
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        if (!clientRef.current) return;
        const response = await fetch('/deployment.json', {cache: 'no-store'});
        const config = await response.json();
        if (config.resetId !== cfgRef.current?.resetId) {
          setBalance(null); setDraft(null); setResult(null); setModal(null);
          try { localStorage.removeItem('proofdock-draft-v3'); } catch {}
          clientRef.current.dispose(); clientRef.current = null;
          notify('网络已重置，正在重新连接。'); await initialize(); return;
        }
        await refresh();
      } catch { if (mounted) setOnline(false); }
    }, 4000);
    const changed = () => { setBalance(null); setModal(null); notify('钱包账户或网络已变化，请重新连接。'); };
    window.ethereum?.on?.('accountsChanged', changed); window.ethereum?.on?.('chainChanged', changed);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('hashchange', hash); window.ethereum?.removeListener?.('accountsChanged', changed); window.ethereum?.removeListener?.('chainChanged', changed); clientRef.current?.dispose(); };
  }, []);
  useEffect(() => { if (client) refresh().catch(() => setOnline(false)); }, [filters, offset, client]);
  useEffect(() => { if (client && view === 'assets') refresh().catch(() => setOnline(false)); }, [view, balance?.address, client]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector('button, textarea, input')?.focus();
    const keydown = e => {
      if (e.key === 'Escape' && !lock.current) setModal(null);
      if (e.key === 'Tab' && dialog) {
        const items = [...dialog.querySelectorAll('button:not(:disabled),textarea,input,a[href]')];
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [Boolean(modal)]);
  async function run(title, operation) {
    if (lock.current) return;
    if (!clientRef.current) { notify('服务尚未就绪，请稍后重试。', true); return; }
    lock.current = true; setBusy(true); notify(title);
    event({id: crypto.randomUUID(), time: new Date().toISOString(), stage: 'task', title, details: {}});
    try {
      await operation(clientRef.current);
      try { await refresh(); } catch { setOnline(false); }
    } catch (error) {
      const message = readableError(error); notify(message, true);
      event({id: crypto.randomUUID(), time: new Date().toISOString(), stage: 'error', title: message, details: {code: error.code, status: error.status}});
    } finally { lock.current = false; setBusy(false); }
  }
  async function compile(active, save) {
    const input = structuredClone(compiler.sampleRequest);
    input.sources = {'Counter.sol': {content: source}};
    const compiled = await active.compile(input, save); setResult(compiled);
    if (compiled.publicationPayload && compiled.observation.executionStatus === 'COMPILED') {
      const next = {resetId: cfgRef.current.resetId, owner: compiled.owner, payload: compiled.publicationPayload};
      setDraft(next); try { localStorage.setItem('proofdock-draft-v3', JSON.stringify(next)); } catch {}
    }
    notify(compiled.observation.executionStatus === 'COMPILED' ? (save ? '已保存' : '编译成功') : '编译失败', compiled.observation.executionStatus !== 'COMPILED');
  }
  async function openRecord(row) {
    await run('读取公共记录摘要', async active => {
      const snapshot = await active.request(`/api/v1/records/${row.id}`);
      setModal({type: 'record', ...snapshot}); notify('');
    });
  }
  function exportJson(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const formatFee = key => parameters ? `${decimal(parameters[key])} DCR` : '读取中…';
  const myRecords = ownedRecords;

  return <div className="app-shell workspace">
    <header className="site-header">
      <a className="wordmark" href="#/" aria-label="服务记录" onClick={() => navigate('home')}><img className="brand-logo" src="/proofdock-logo-transparent.png" alt="" width="48" height="48"/></a>
      <nav aria-label="主要导航">{VIEWS.map(([id, name]) => <a key={id} href={`#/${id}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>{name}</a>)}</nav>
      <div className="header-actions"><button className="text-button" disabled={busy || !client} onClick={() => run('切换网络', async active => {await active.addNetwork(); notify('网络已切换。');})}>切换网络</button><button className="wallet-button" disabled={busy || !client} onClick={() => run('连接钱包', async active => {setBalance(await active.connect()); notify('钱包已连接。');})}>{wallet ? short(wallet) : '连接钱包'}</button></div>
    </header>

    <main className="workspace-main">
      <nav className="workspace-navigation" aria-label="页面位置"><div>{view !== 'compile' && <><a href="#/" onClick={() => navigate('compile')}>← 服务记录</a><span aria-hidden="true">/</span></>}<span aria-current="page">{VIEWS.find(([id]) => id === view)?.[1] || '调用日志'}</span></div></nav>
      {notice.text && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'} aria-live="polite">{busy && <span className="spinner"/>}{notice.text}</div>}

      {view === 'compile' && <>
        <div className="page-heading"><h1>服务记录</h1></div>
        <div className="compile-grid">
          <div className="service-tabs" aria-label="服务选择">{services.map(service => <button key={service.id} className={`service-option ${selectedService === service.id ? 'selected' : ''}`} disabled={busy} aria-pressed={selectedService === service.id} onClick={() => {setSelectedService(service.id); setResult(null);}}><strong>{serviceName(service)}</strong></button>)}</div>
          <section className="editor-panel">
            <div className="panel-topline"><h2>{serviceName(chosenService) || '加载中…'}</h2></div>
            {canCompile ? <><label className="editor-label" htmlFor="source-code">Counter.sol</label><textarea id="source-code" className="code-editor" value={source} onChange={e => setSource(e.target.value)} spellCheck="false" disabled={busy} aria-label="Counter.sol 源码"/><div className="action-row"><button className="button primary" disabled={busy || !compiler || !online} onClick={() => run('编译', active => compile(active, false))}>编译 <span aria-hidden="true">↗</span></button><button className="button" disabled={busy || !compiler || !online} onClick={() => run('签名保存材料', active => compile(active, true))}>签名保存</button></div></> : <div className="unavailable"><h3>服务暂不可用</h3><button className="button" disabled={busy} onClick={() => {setSelectedService('local-solidity'); setResult(null);}}>切换至 Solidity 编译</button></div>}
            {canCompile && result && <section className="execution-result"><div className="result-title"><span className={`result-dot ${result.observation.executionStatus === 'COMPILED' ? 'ok' : 'fail'}`}/><h3>{result.observation.executionStatus === 'COMPILED' ? '编译成功' : '编译返回错误'}</h3><span>{result.observation.elapsedMs} ms</span></div><p>{result.executionId ? '已保存' : '未保存'}</p>{result.observation.output.errors?.map((error, i) => <pre className="compiler-diagnostic" key={i}>{error.formattedMessage || error.message}</pre>)}<Json value={result.observation} label="编译结果"/></section>}
            {canCompile && draft && <section className="publication"><div className="section-label">待发布材料</div><h3>{draft.payload.title}</h3><p>钱包：<code>{short(draft.owner)}</code> · 发布质押 {formatFee('stake')}</p><div className="action-row"><button className="button primary" disabled={busy || !online} onClick={() => run('签名材料并质押发布', async active => {const published = await active.publish(draft.payload, draft.owner); setDraft(null); try {localStorage.removeItem('proofdock-draft-v3');} catch {} notify(published.alreadyPublished ? '记录已发布。' : '发布成功。'); navigate('records');})}>质押发布</button><button className="text-button" disabled={busy} onClick={() => {setDraft(null); try {localStorage.removeItem('proofdock-draft-v3');} catch {}}}>移除待发布材料</button></div></section>}
          </section>
        </div>
      </>}

      {view === 'records' && <>
        <div className="page-heading split"><div><h1>上链记录</h1></div><button className="button" disabled={busy} onClick={() => run('刷新公共记录', async () => {await refresh(); notify('公共记录已刷新。');})}>刷新记录</button></div>
        <div className="record-toolbar"><div className="filter-group"><label>服务<select value={filters.service} onChange={e => {setFilters({...filters, service: e.target.value}); setOffset(0);}}><option value="">全部服务</option>{services.map(service => <option value={service.id} key={service.id}>{serviceName(service)}</option>)}</select></label><label>状态<select value={filters.status} onChange={e => {setFilters({...filters, status: e.target.value}); setOffset(0);}}><option value="">全部状态</option>{Object.entries(STATUS_LABELS).filter(([key]) => key !== 'unpublished').map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label></div><span>{pagination.total} 条符合条件的记录</span></div>
        <div className="record-list">{records.map(row => <button className="record-row" key={row.id} onClick={() => openRecord(row)} disabled={busy}><div className="record-main"><Pill status={row.status} demo={row.demo}/><h2>{row.title}</h2><span>{serviceName(services.find(service => service.id === row.serviceId)) || row.serviceId} <i>·</i> 发布者 {short(row.publisher)}</span></div><div className="record-right"><code>{short(row.id)}</code><span>查阅记录 ↗</span></div></button>)}{records.length === 0 && <div className="empty-state"><h2>{online ? '暂无记录' : '服务连接失败'}</h2><button className="button" onClick={() => navigate('compile')}>服务记录</button></div>}</div>
        <div className="pagination"><button className="button" disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - 20))}>上一页</button><span>第 {Math.floor(offset / 20) + 1} 页</span><button className="button" disabled={pagination.nextOffset == null || busy} onClick={() => setOffset(pagination.nextOffset)}>下一页</button></div>
        <div className="verification-strip"><span>{reports.filter(report => report.status === 'resolved').length} 份已完成报告</span></div>
      </>}

      {view === 'agent' && <>
        <div className="page-heading"><h1>调用日志</h1></div>
        <div className="agent-layout"><aside><h2>调用记录</h2><button className="button primary" onClick={() => navigate('compile')}>服务记录 ↗</button><div className="terms-box"><h3>接口入口</h3><ul className="api-list"><li><code>GET /api/v1/services</code><span>服务目录</span></li><li><code>GET /api/v1/records</code><span>公开记录</span></li><li><code>POST /api/local-compiler</code><span>编译</span></li><li><code>POST /api</code><span>签名存证</span></li></ul><button className="text-button" onClick={() => navigate('api')}>API ↗</button></div></aside><section className="trace-panel"><div className="panel-topline"><h2>操作日志</h2><button className="text-button" disabled={busy} onClick={() => setEvents([])}>清空视图</button></div>{events.length === 0 ? <div className="empty-state"><h3>暂无日志</h3></div> : <ol className="trace-list">{events.map(item => <li key={item.id} className={item.stage === 'error' ? 'trace-error' : ''}><time>{new Date(item.time).toLocaleTimeString('zh-CN', {hour12: false})}</time><div><span className="trace-stage">{item.stage}</span><strong>{item.title}</strong>{Object.keys(item.details).length > 0 && <Json value={item.details} label="详情"/>}</div></li>)}</ol>}</section></div>
      </>}

      {view === 'api' && <>
        <div className="page-heading"><h1>API 接入</h1></div>
        <div className="api-connection"><code>{typeof location === 'undefined' ? '' : location.origin}</code><div className="action-row"><button className="button" disabled={busy || !client} onClick={() => run('测试 API 连接', async active => {setApiSample(await active.request('/api/v1/services')); notify('HTTP 200');})}>测试连接</button><button className="button" onClick={() => navigate('agent')}>调用日志</button></div></div>
        <div className="api-endpoints">{[['服务目录','GET /api/v1/services'],['上链记录','GET /api/v1/records?limit=20&offset=0'],['记录详情','GET /api/v1/records/{id}'],['查询报价','GET /api/v1/records/{id}/quote?address={wallet}'],['完整材料','POST /api/v1/records/{id}/evidence'],['编译','GET /api/local-compiler · POST /api/local-compiler'],['签名存证','POST /api'],['复验报告','GET /api/verification']].map(([label, endpoint]) => <div key={label}><h2>{label}</h2><code>{endpoint}</code></div>)}</div>
        <section className="api-example"><h2>编译请求</h2><code>POST /api/local-compiler</code><pre>{JSON.stringify({action:'preview',input:compiler?.sampleRequest},null,2)}</pre></section>
        <section className="api-example"><h2>签名读取</h2><ol className="api-flow"><li>获取 quote。</li><li>paymentRequired 为 true 时按 transactions 付款。</li><li>签署 readAuthorization.message。</li><li>POST evidence：address、queryId、expiresAt、signature。</li></ol></section>
        {apiSample && <section className="api-example"><h2>连接响应</h2><Json value={apiSample} label="HTTP 200 · 展开响应"/></section>}
      </>}

      {view === 'assets' && <>
        <div className="page-heading"><h1>我的资产</h1></div>
        {!wallet ? <div className="empty-state"><h2>连接钱包后查看资产</h2></div> : <><div className="asset-stats"><div><span>DCR 余额</span><strong>{decimal(balance.dcr)}</strong></div><div><span>ETH 余额</span><strong>{decimal(balance.eth)}</strong></div><div><span>可领取 DCR</span><strong>{decimal(balance.credit)}</strong></div></div><div className="asset-actions"><code>{wallet}</code><button className="button primary" disabled={busy || Number(balance.credit) <= 0} onClick={() => run('领取资金', async active => {await active.act('withdraw'); notify('领取成功。');})}>领取资金</button></div><h2 className="section-heading">我的发布记录</h2>{myRecords.map(row => <div className="asset-record" key={row.id}><div><Pill status={row.status}/><h3>{row.title}</h3><p>{row.exitAt ? `可退出时间：${date(row.exitAt * 1000)}` : `申请退出后等待 ${parameters?.wait || '—'} 秒`}</p></div>{[1, 3].includes(row.state) && <button className="button" disabled={busy || (row.exitAt > 0 && now < row.exitAt * 1000)} onClick={() => run(row.exitAt ? '退出质押' : '申请退出质押', async active => {await active.act(row.exitAt ? 'exit' : 'requestExit', row.id); notify(row.exitAt ? '质押已退出。' : '退出申请已提交。');})}>{row.exitAt ? (now < row.exitAt * 1000 ? '等待退出时间' : '完成退出') : '申请退出'}</button>}</div>)}</>}
      </>}
          </main>

    {modal && <div className="modal-backdrop" onMouseDown={e => {if (e.target === e.currentTarget && !busy) setModal(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={dialogRef}>
      <header className="modal-header"><h2 id="dialog-title">{modal.type === 'record' ? '履约记录' : modal.type === 'purchase' ? '读取完整材料' : modal.type === 'challenge' ? '发起挑战' : '程序接入流程'}</h2><button aria-label="关闭弹窗" disabled={busy} onClick={() => setModal(null)}>×</button></header>
      {notice.error && <div className="notice error" role="alert">{notice.text}</div>}
      {modal.type === 'record' && <div className="modal-content"><Pill status={modal.record.status} demo={modal.record.demo}/><h3 className="record-title">{modal.record.title}</h3><dl className="evidence-fields"><div><dt>记录编号</dt><dd>{modal.record.id}</dd></div><div><dt>发布者</dt><dd>{modal.record.publisher}</dd></div><div><dt>材料摘要</dt><dd>{modal.record.evidenceHash}</dd></div></dl><div className="action-row"><button className="button primary" disabled={busy || !online} onClick={() => run('读取费用与付款凭证', async active => {const quote = await active.quote(modal.record.id); setModal({...modal, type: 'purchase', quote}); notify(quote.access.paymentRequired ? '查询费已确认。' : '付款凭证已确认。');})}>查看材料</button>{[1, 3].includes(modal.record.state) && <button className="button" disabled={busy} onClick={() => setModal({...modal, type: 'challenge'})}>提出挑战 · {formatFee('bond')}</button>}{modal.record.state === 2 && <button className="button" disabled={busy || now < (modal.record.challengedAt + 300) * 1000} onClick={() => run('结束超时挑战', async active => {await active.act('timeout', modal.record.id); notify('挑战已按超时规则结束。');})}>{now < (modal.record.challengedAt + 300) * 1000 ? '等待裁定 / 5 分钟超时' : '超时退款'}</button>}</div>{modal.evidence && <section className="evidence-delivery"><h3>材料</h3><Json value={modal.evidence} label="展开完整证据"/><button className="text-button" onClick={() => exportJson(modal.evidence, `ProofDock-${modal.record.id.slice(0, 10)}.json`)}>导出材料 JSON ↗</button></section>}<section className="report-section"><h3>复验报告</h3>{modal.verification?.length ? modal.verification.map(report => <div className="report-row" key={report.reportHash}><strong>{['', '支持记录', '发现差异', '无法验证'][report.outcome]}</strong><p>{report.reason}</p><code>{short(report.transactionHash)}</code></div>) : <p>暂无复验报告。</p>}</section>{modal.record.state === 2 && wallet?.toLowerCase() === parameters?.validator.toLowerCase() && <details className="manual-resolve"><summary>手动裁定</summary><p>复验处理中，请勿重复提交。</p><div className="action-row">{[[1, '支持记录'], [2, '记录有误'], [3, '无法验证']].map(([outcome, label]) => <button key={outcome} className="button" disabled={busy} onClick={() => run('提交手动裁定', async active => {await active.act('resolve', modal.record.id, [outcome, ethers.id(`MANUAL_DEMO_REPORT:${outcome}`)]); notify('手动裁定已上链。');})}>{label}</button>)}</div></details>}</div>}
      {modal.type === 'purchase' && <div className="modal-content"><h3>{modal.record.title}</h3><div className="purchase-price"><span>{modal.quote.access.paymentRequired ? '查询费' : '已付款'}</span><strong>{modal.quote.access.paymentRequired ? `${modal.quote.payment.amount} DCR` : '0 DCR'}</strong></div><button className="button primary full" disabled={busy} onClick={() => run('核对付款凭证并读取材料', async active => {const delivered = await active.readEvidence(modal.record.id); setModal({...modal, type: 'record', evidence: delivered.evidence}); notify('材料已读取。');})}>{busy ? '处理中…' : modal.quote.access.paymentRequired ? '支付并读取' : '签名读取'}</button></div>}
      {modal.type === 'challenge' && <div className="modal-content"><h3>{modal.record.title}</h3><p>确认后将质押挑战金，并自动复验这条记录的原始输入与输出。</p><div className="purchase-price"><span>挑战金</span><strong>{formatFee('bond')}</strong></div><div className="action-row"><button className="button primary" disabled={busy || !online} onClick={() => run('质押挑战金并发起挑战', async active => {const receipt = await active.challenge(modal.record.id); setModal({...modal, type: 'record'}); notify(`挑战已发布，等待自动复验。交易 ${short(receipt.hash)}`);})}>{busy ? '处理中…' : '签名并质押发起挑战'}</button></div></div>}
      {modal.type === 'api' && <div className="modal-content"><ol className="api-flow"><li>服务目录：<code>GET /api/v1/services</code></li><li>编译：<code>POST /api/local-compiler</code>，传 action=preview 与 input。</li><li>发布：签名执行材料后，<code>POST /api</code> 保存，再由钱包调用 publish。</li><li>读取：取 quote → 必要时付款 → 签署 readAuthorization.message → POST evidence。</li><li>挑战：钱包调用 challenge，再读取 <code>GET /api/verification?id=…</code>。</li></ol><Json value={{baseUrl: typeof location === 'undefined' ? '' : location.origin, chainId: cfg?.chainId, services: '/api/v1/services', records: '/api/v1/records', compiler: '/api/local-compiler', verification: '/api/verification'}} label="查看接入地址"/></div>}
    </section></div>}
  </div>;
}
