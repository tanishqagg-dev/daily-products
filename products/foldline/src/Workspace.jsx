import React,{useEffect,useRef,useState} from 'react';
import * as identity from '@netlify/identity';
import {flushSync} from 'react-dom';
import {loadVerifiedSession,createSessionGuard} from './session.js';
import {ArrowLeft,ArrowRight,ArrowUpRight,ChatText,PaperPlaneTilt,GearSix,Plus,SignOut,Copy,Check,DownloadSimple,Trash,GitMerge,LinkSimple,LockKey,NotePencil,CheckCircle,CaretRight,MagnifyingGlass} from '@phosphor-icons/react';
import {api,post,statuses,statusLabels,dateLabel} from './api.js';
import {Logo,Header,Footer,Button,Field,Notice,Status,Modal,RequestForm,Loading} from './components.jsx';

const slugify=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48);
const isDesktop=()=>window.matchMedia('(min-width: 960px)').matches;

export default function Workspace(){
  const [session,setSession]=useState(null);
  const [initialLoading,setInitialLoading]=useState(true);
  const [workspaces,setWorkspaces]=useState([]);
  const [data,setData]=useState(null);
  const [selected,setSelected]=useState(null);
  const [view,setView]=useState('feedback');
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [modal,setModal]=useState(null);
  const [createOpen,setCreateOpen]=useState(false);
  const [releaseOpen,setReleaseOpen]=useState(false);
  const [copied,setCopied]=useState(false);
  const copyTimer=useRef();
  const guard=useRef(createSessionGuard());
  const loadSequence=useRef(0);
  const clearPrivate=()=>{guard.current.invalidate();loadSequence.current++;setSession(null);setData(null);setWorkspaces([]);setSelected(null);setModal(null);setSearch('');setFilter('all');setView('feedback');setCreateOpen(false);setReleaseOpen(false);setCopied(false);clearTimeout(copyTimer.current);setBusy(false);setNotice('');setError('');setInitialLoading(true);};
  const workspace=data?.workspace;
  const requests=data?.requests||[];
  const releases=data?.releases||[];
  const request=requests.find(item=>item.id===selected);
  async function load(id,prefer,token=guard.current.capture()){
    const sequence=++loadSequence.current;
    const next=await api(`/workspaces/${id}`);
    if(!guard.current.isCurrent(token)||sequence!==loadSequence.current)return null;
    setData(next);
    setSelected(previous=>{
      const choice=prefer||previous;
      return next.requests.some(item=>item.id===choice&&item.status!=='merged')?choice:isDesktop()?next.requests.find(item=>item.status!=='merged')?.id||null:null;
    });
    return next;
  }
  useEffect(()=>{
    let active=true;
    async function boot(){
      clearPrivate();
      const token=guard.current.capture();
      const valid=()=>active&&guard.current.isCurrent(token);
      try{
        const userSession=await loadVerifiedSession();if(!valid())return;setSession(userSession);
        if(userSession.user){const result=await api('/workspaces');if(!valid())return;setWorkspaces(result.workspaces);if(result.workspaces.length)await load(result.workspaces[0].id,undefined,token);}
      }catch(err){if(valid()){setError(err.message);setSession(null);setData(null);setWorkspaces([]);}}
      finally{if(valid())setInitialLoading(false);}
    }
    boot();
    const unsubscribe=identity.onAuthChange((event,user)=>{
      if(event==='logout'&&!user){flushSync(clearPrivate);location.replace('/auth');}
      else if(event==='login'||event==='user_updated')boot();
    });
    // Avoid preserving a private DOM in the browser's back/forward page cache.
    const pagehide=()=>flushSync(clearPrivate);
    const pageshow=event=>{if(event.persisted)boot();};
    window.addEventListener('pagehide',pagehide);
    window.addEventListener('pageshow',pageshow);
    return()=>{active=false;guard.current.invalidate();loadSequence.current++;unsubscribe();clearTimeout(copyTimer.current);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);};
  },[]);
  async function run(action,{message='',reload=true,select}={}){
    const token=guard.current.capture();
    const valid=()=>guard.current.isCurrent(token);
    setBusy(true);setError('');setNotice('');
    try{await action(valid,token);if(!valid())return false;if(reload&&workspace)await load(workspace.id,select,token);if(!valid())return false;if(message)setNotice(message);return true;}
    catch(err){if(valid())setError(err.message);return false;}
    finally{if(valid())setBusy(false);}
  }
  async function switchWorkspace(id){
    const ok=await run(()=>load(id),{reload:false});if(!ok)return;setSelected(null);setView('feedback');setFilter('all');setSearch('');setCreateOpen(false);
  }
  async function createWorkspace(values){
    return run(async(valid,token)=>{const result=await post('/workspaces',values);if(!valid())return;setWorkspaces(previous=>[...previous,result.workspace]);await load(result.workspace.id,undefined,token);if(!valid())return;setCreateOpen(false);setView('feedback');},{reload:false,message:'Your workspace is ready. Add a note or share your feedback page.'});
  }
  async function copyLink(){
    const token=guard.current.capture();
    try{await navigator.clipboard.writeText(`${location.origin}/b/${workspace.slug}`);if(!guard.current.isCurrent(token))return;setCopied(true);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),2500);}
    catch{if(guard.current.isCurrent(token))setNotice(`Your feedback page is ${location.origin}/b/${workspace.slug}`);}
  }
  async function checkout(){
    if(!session.billingConfigured||busy)return;
    const token=guard.current.capture();
    const valid=()=>guard.current.isCurrent(token);
    setBusy(true);setError('');
    try{
      const order=await post('/checkout',{workspaceId:workspace.id});
      if(!valid())return;
      if(!window.Razorpay)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.onload=resolve;script.onerror=()=>reject(Error('Checkout could not load. Please try again.'));document.head.append(script);});
      if(!valid())return;
      const payment=new window.Razorpay({...order,key:order.keyId,order_id:order.id,
        handler:response=>valid()&&run(async()=>{const result=await post('/billing/verify',{workspaceId:workspace.id,...response});if(!result.active)throw Error('Your payment is being verified. Your plan has not changed yet.');},{message:'Your Plus pass is active.'}),
        modal:{ondismiss:()=>{if(valid())setBusy(false);}},
      });
      payment.on('payment.failed',()=>{if(!valid())return;setError('Payment did not complete. Your plan has not changed.');setBusy(false);});payment.open();
    }catch(err){if(valid()){setError(err.message);setBusy(false);}}
  }
  if(initialLoading)return <><Header/><Loading/></>;
  if(!session?.user)return <><Header/><main className="signed-out page-width"><div className="empty-art"><img src="/brand/foldline-fold.svg" alt=""/></div><span className="eyebrow">YOUR WORKSPACE IS PRIVATE</span><h1>Pick up the thread.</h1><p>Sign in to see your feedback and decide what happens next.</p><Notice error>{error}</Notice><a className="button primary" href="/auth">Continue to sign-in <ArrowRight size={18}/></a><a className="text-button" href="/#demo">Try the demo first</a></main><Footer/></>;
  const visible=requests.filter(item=>item.status!=='merged'&&(filter==='all'||item.status===filter)&&(!search||`${item.title} ${item.problem}`.toLowerCase().includes(search.toLowerCase())));
  return <div className="workspace-app">
    <aside className="app-navigation"><div className="app-brand"><Logo/><span className="beta-word">Beta</span></div>
      <label className="workspace-picker"><span>Workspace</span><select aria-label="Switch workspace" value={workspace?.id||''} onChange={event=>switchWorkspace(event.target.value)} disabled={busy}>{!workspaces.length&&<option value="">Create your first workspace</option>}{workspaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <nav aria-label="Workspace navigation">{[{id:'feedback',title:'Feedback',Icon:ChatText},{id:'releases',title:'Releases',Icon:PaperPlaneTilt},{id:'settings',title:'Settings',Icon:GearSix}].map(({id,title,Icon})=><button key={id} className={view===id&&!createOpen?'active':''} onClick={()=>{setView(id);setCreateOpen(false);setNotice('');setError('');}}><Icon size={20}/><span>{title}</span>{id==='feedback'&&requests.length>0&&<small>{requests.filter(item=>item.status!=='merged').length}</small>}</button>)}</nav>
      <button className="new-workspace-button" onClick={()=>setCreateOpen(true)}><Plus size={17}/>New workspace</button>
      <div className="nav-bottom"><div className="nav-plan"><span>{workspace?.plan==='plus'?'Plus pass':'Free workspace'}</span><button onClick={()=>{setView('settings');setCreateOpen(false);}}>Plan details <ArrowUpRight size={15}/></button></div><div className="account-menu"><div className="account-avatar" aria-hidden="true">{session.user.email?.charAt(0).toUpperCase()||'F'}</div><span title={session.user.email}>{session.user.email}</span><button className="icon-button" aria-label="Log out" onClick={async()=>{flushSync(clearPrivate);try{await identity.logout();}finally{location.replace('/auth');}}}><SignOut size={19}/></button></div></div>
    </aside>
    <main className="workspace-main"><header className="workspace-topbar"><span>{workspace?.name||'Welcome to Foldline'}<span className="topbar-separator">/</span>{createOpen?'New workspace':!workspace?'Get started':view==='feedback'?'Feedback':view==='releases'?'Releases':'Settings'}</span>{workspace&&<a className="text-button" href={`/b/${workspace.slug}`} target="_blank" rel="noreferrer">Public board <ArrowUpRight size={17}/></a>}</header>
      <div className="workspace-content"><div className="workspace-notices"><Notice error>{error}</Notice><Notice>{notice}</Notice></div>
        {!workspace||createOpen?<Onboarding busy={busy} onSubmit={createWorkspace} onCancel={workspace?()=>setCreateOpen(false):undefined}/>:view==='feedback'?<>
          <div className="workspace-heading"><div><span className="eyebrow">THE NEXT STEP STARTS HERE</span><h1>Feedback, with context.</h1><p>A place for the ask and the problem behind it.</p></div><div className="heading-actions"><Button onClick={copyLink}>{copied?<Check size={17}/>:<LinkSimple size={17}/>}<span>{copied?'Link copied':'Share board'}</span></Button><Button className="primary" onClick={()=>setModal('request')}><Plus size={18}/>Add feedback</Button></div></div>
          {!requests.length?<EmptyFeedback onAdd={()=>setModal('request')} onCopy={copyLink} copied={copied} slug={workspace.slug}/>:<div className={`feedback-workbench ${selected?'detail-is-open':''}`}>
            <section className="feedback-collection" aria-label="Feedback list"><div className="feedback-toolbar"><label className="search-control"><MagnifyingGlass size={19}/><input aria-label="Search feedback" placeholder="Find feedback…" value={search} onChange={event=>setSearch(event.target.value)}/></label><label className="filter-select"><span className="sr-only">Filter feedback</span><select value={filter} onChange={event=>setFilter(event.target.value)}>{['all',...statuses].map(status=><option value={status} key={status}>{status==='all'?'All feedback':statusLabels[status]}</option>)}</select></label></div><div className="feedback-list">{visible.map(item=><button className={`feedback-note ${item.id===selected?'selected':''}`} onClick={()=>setSelected(item.id)} key={item.id}><div className="note-meta"><Status value={item.status}/><time>{dateLabel(item.createdAt)}</time></div><h2>{item.title}</h2><p>{item.problem||'No extra context shared.'}</p><span className="note-footer">{item.sourceIds?.length>0?`${item.sourceIds.length+1} connected notes`:'Open the note'}<ArrowUpRight size={16}/></span></button>)}{!visible.length&&<div className="search-empty"><MagnifyingGlass size={28}/><h2>No matching notes.</h2><p>Try a different phrase or clear your filter.</p><button className="text-button" onClick={()=>{setSearch('');setFilter('all');}}>Show all feedback <ArrowRight size={17}/></button></div>}</div></section>
            <section className="feedback-detail" aria-label="Selected feedback">{request?<RequestDetail key={`${request.id}-${request.status}-${request.reason}-${request.decision}`} request={request} requests={requests} busy={busy} onBack={()=>setSelected(null)} onSave={values=>run(()=>post(`/workspaces/${workspace.id}/requests/${request.id}`,values,'PATCH'),{message:'Decision saved. The context stays with it.'})} onMerge={()=>setModal('merge')} onRelease={()=>{setView('releases');setReleaseOpen(true);}}/>:<div className="select-note"><NotePencil size={35}/><h2>A little context goes a long way.</h2><p>Choose a note to read the problem and make a decision.</p></div>}</section>
          </div>}
        </>:view==='releases'?<><div className="workspace-heading"><div><span className="eyebrow">CLOSE THE LOOP</span><h1>Show what changed.</h1><p>Connect shipped work to the notes that started it.</p></div>{!releaseOpen&&<Button className="primary" onClick={()=>setReleaseOpen(true)}><Plus size={18}/>Write a release</Button>}</div>{releaseOpen?<ReleaseEditor requests={requests} selected={selected} busy={busy} onCancel={()=>setReleaseOpen(false)} onSubmit={async values=>{const ok=await run(()=>post(`/workspaces/${workspace.id}/releases`,values),{message:'Release published. The linked feedback is marked shipped.'});if(ok)setReleaseOpen(false);}}/>:null}{!releases.length&&!releaseOpen?<div className="empty-releases"><PaperPlaneTilt size={38}/><h2>Your next release has a story.</h2><p>Write an update, link the feedback and give the work an ending.</p><Button onClick={()=>setReleaseOpen(true)}>Write your first release <ArrowRight size={18}/></Button></div>:<div className="releases-timeline">{releases.map(release=><article key={release.id} className="release-entry"><div className="release-date"><CheckCircle size={21}/><time>{dateLabel(release.createdAt)}</time></div><div><span className="visibility-label"><ArrowUpRight size={14}/>Published on your public board</span><h2>{release.title}</h2><p>{release.body}</p>{release.requestIds?.length>0&&<div className="release-linked"><span>{release.requestIds.length} connected request{release.requestIds.length===1?'':'s'}</span>{release.requestIds.map(id=>requests.find(item=>item.id===id)).filter(Boolean).map(item=><button key={item.id} onClick={()=>{setView('feedback');setSelected(item.id);}}>{item.title}<ArrowRight size={16}/></button>)}</div>}</div></article>)}</div>}</>:<Settings workspace={workspace} session={session} requestCount={requests.length} busy={busy} checkout={checkout} onDelete={()=>setModal('delete')} onCopy={copyLink} copied={copied}/>}
      </div>
    </main>
    {modal==='request'&&<Modal title="Add a piece of feedback" onClose={()=>setModal(null)}><p className="modal-intro">Keep the customer's problem and current workaround together.</p><RequestForm busy={busy} buttonText="Add feedback" onSubmit={async values=>{const ok=await run(async(valid)=>{const result=await post(`/workspaces/${workspace.id}/requests`,values);if(!valid())return;setSelected(result.request.id);},{message:'Feedback added. Give it a read, then choose the next step.'});if(ok)setModal(null);}}/></Modal>}
    {modal==='merge'&&request&&<MergeDialog source={request} requests={requests} busy={busy} onClose={()=>setModal(null)} onMerge={async targetId=>{const ok=await run(()=>post(`/workspaces/${workspace.id}/merge`,{sourceId:request.id,targetId}),{message:'Notes connected. All original evidence is preserved.',select:targetId});if(ok)setModal(null);}}/>}
    {modal==='delete'&&<DeleteDialog name={workspace.name} busy={busy} onClose={()=>setModal(null)} onDelete={async()=>{const ok=await run(async(valid,token)=>{await api(`/workspaces/${workspace.id}`,{method:'DELETE'});if(!valid())return;const result=await api('/workspaces');if(!valid())return;setWorkspaces(result.workspaces);setData(null);setSelected(null);if(result.workspaces.length)await load(result.workspaces[0].id,undefined,token);if(!valid())return;setView('feedback');},{reload:false,message:'Workspace deleted.'});if(ok)setModal(null);}}/>}
  </div>;
}

function Onboarding({busy,onSubmit,onCancel}){
  const [name,setName]=useState('');const [slug,setSlug]=useState('');const [customSlug,setCustomSlug]=useState(false);
  return <section className="onboarding"><div className="onboarding-art"><img src="/brand/foldline-fold.svg" alt="Three orange ribbons fold into one direction"/></div><span className="eyebrow">MAKE YOURSELF A LITTLE ROOM</span><h1>What's your product called?</h1><p>Give your feedback a home. You'll get a public page to share and a private place to make decisions.</p><form className="form-stack" onSubmit={event=>{event.preventDefault();onSubmit({name,slug});}}><Field label="Workspace name" name="name" placeholder="Your product or team" value={name} maxLength={80} autoComplete="organization" required onChange={event=>{setName(event.target.value);if(!customSlug)setSlug(slugify(event.target.value));}}/><Field label="Public page address" name="slug" value={slug} placeholder="your-product" pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]" minLength={3} maxLength={48} required title="3–48 lowercase letters, numbers or hyphens; begin and end with a letter or number" onChange={event=>{setSlug(event.target.value);setCustomSlug(true);}} hint={`${location.origin}/b/${slug||'your-product'}`}/><div className="onboarding-privacy"><LockKey size={19}/><p>Request titles and releases can be public. Customer context and your decision notes stay private.</p></div><Button className="primary full" disabled={busy}>{busy?'Creating your workspace…':'Create workspace'}<ArrowRight size={18}/></Button>{onCancel&&<button type="button" className="text-button" onClick={onCancel}>Cancel</button>}</form></section>;
}
function EmptyFeedback({onAdd,onCopy,copied,slug}){
  return <section className="empty-feedback"><div className="empty-feedback-intro"><span className="empty-fold-mark"><ChatText size={32}/></span><h2>Your first note starts here.</h2><p>Hear from a customer, add a conversation you've already had, or send your public page out into the world.</p><Button className="primary" onClick={onAdd}><Plus size={18}/>Add your first note</Button></div><div className="share-starter"><div><LinkSimple size={23}/><h3>Invite a little context.</h3></div><p>Your public page asks what people were trying to do and how they work around it.</p><div className="share-address"><span>/b/{slug}</span><button className="icon-button" aria-label="Copy public feedback link" onClick={onCopy}>{copied?<Check size={19}/>:<Copy size={19}/>}</button></div><a className="text-button" href={`/b/${slug}`} target="_blank" rel="noreferrer">Preview your public page <ArrowUpRight size={17}/></a></div></section>;
}
function RequestDetail({request,requests,busy,onBack,onSave,onMerge,onRelease}){
  const [saving,setSaving]=useState(false);const [saved,setSaved]=useState(false);
  const sources=(request.sourceIds||[]).map(id=>requests.find(item=>item.id===id)).filter(Boolean);
  return <><button className="detail-back text-button" onClick={onBack}><ArrowLeft size={18}/>Back to feedback</button><div className="detail-title"><div><Status value={request.status}/><span className="visibility-label"><LockKey size={14}/>Private context</span></div><h2>{request.title}</h2><time>{dateLabel(request.createdAt)}</time></div>
    <div className="customer-evidence"><h3>The problem</h3><p>{request.problem||'No extra context was shared.'}</p><h3>The current workaround</h3><p>{request.workaround||'No workaround was shared.'}</p></div>
    {sources.length>0&&<details className="source-notes"><summary><GitMerge size={18}/>{sources.length} connected original note{sources.length===1?'':'s'}</summary>{sources.map(source=><article key={source.id}><h4>{source.title}</h4><p>{source.problem}</p><span>Current workaround</span><p>{source.workaround||'None shared.'}</p>{source.decision&&<><span>Original decision</span><p>{source.decision}</p>{source.reason&&<p>{source.reason}</p>}</>}</article>)}</details>}
    <form className="form-stack decision-editor" onSubmit={async event=>{event.preventDefault();setSaving(true);const ok=await onSave(Object.fromEntries(new FormData(event.currentTarget)));setSaving(false);setSaved(ok);}}><div className="decision-editor-heading"><NotePencil size={22}/><div><h3>Choose the next step.</h3><p>Leave a reason your future self can follow.</p></div></div><label className="field"><span>Where does this stand?</span><select name="status" defaultValue={request.status}>{statuses.map(status=><option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><Field label="Your decision" name="decision" defaultValue={request.decision||''} maxLength={2000} placeholder="What will you do about this?" onChange={()=>setSaved(false)}/><Field label="Why this decision?" name="reason" defaultValue={request.reason||''} textarea rows={4} maxLength={4000} placeholder="Keep the thinking, not just the outcome." onChange={()=>setSaved(false)}/><div className="decision-actions"><Button className="primary" disabled={busy||saving}>{saving?'Saving…':saved?'Decision saved':'Save decision'}{saved?<Check size={18}/>:<ArrowRight size={18}/>}</Button>{request.status==='planned'&&<Button type="button" onClick={onRelease}>Write a release <PaperPlaneTilt size={18}/></Button>}</div></form>
    {requests.some(item=>item.id!==request.id&&item.status!=='merged')&&<button className="merge-trigger text-button" onClick={onMerge}><GitMerge size={18}/>Connect this with another note<ArrowRight size={16}/></button>}
  </>;
}
function MergeDialog({source,requests,busy,onClose,onMerge}){
  return <Modal title="Connect the evidence" onClose={onClose}><p className="modal-intro">Move “{source.title}” into another request. Its original context, decisions and release links will be preserved.</p><form className="form-stack" onSubmit={event=>{event.preventDefault();onMerge(new FormData(event.currentTarget).get('targetId'));}}><label className="field"><span>Which request describes the same problem?</span><select name="targetId" required>{requests.filter(item=>item.id!==source.id&&item.status!=='merged').map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><Button className="primary" disabled={busy}>{busy?'Connecting…':'Connect notes'}<GitMerge size={18}/></Button></form></Modal>;
}
function ReleaseEditor({requests,selected,busy,onSubmit,onCancel}){
  const candidates=requests.filter(item=>item.status!=='merged'&&item.status!=='shipped');
  return <section className="release-editor"><div className="editor-intro"><span className="visibility-label"><ArrowUpRight size={15}/>This update will appear on your public board</span><h2>Give the work an ending.</h2></div><form className="form-stack" onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);onSubmit({title:values.get('title'),body:values.get('body'),requestIds:values.getAll('requestIds')});}}><Field label="Release title" name="title" maxLength={160} required placeholder="A little less Monday admin."/><Field label="What changed?" name="body" textarea rows={6} maxLength={8000} required placeholder="Explain what people can do now. Keep it useful, keep it human."/><fieldset className="release-requests"><legend>Connect the feedback that led here</legend><p>Selected requests will be marked shipped when you publish.</p>{candidates.length?candidates.map(item=><label className="request-checkbox" key={item.id}><input type="checkbox" name="requestIds" value={item.id} defaultChecked={item.id===selected}/><span>{item.title}<small>{statusLabels[item.status]}</small></span></label>):<p>No open feedback to connect. You can still publish an update.</p>}</fieldset><div className="form-actions"><Button className="primary" disabled={busy}>{busy?'Publishing…':'Publish release'}<PaperPlaneTilt size={18}/></Button><Button type="button" onClick={onCancel} disabled={busy}>Cancel</Button></div></form></section>;
}
function Settings({workspace,session,requestCount,busy,checkout,onDelete,onCopy,copied}){
  const plus=workspace.plan==='plus';
  return <><div className="workspace-heading"><div><span className="eyebrow">A FEW THINGS TO MAKE IT YOURS</span><h1>Workspace settings.</h1><p>Your page, your plan and your data.</p></div></div><div className="settings-layout"><section className="settings-section"><div className="settings-section-heading"><h2>Your public page</h2><span className="visibility-label">Anyone with the link</span></div><p>Share this page to collect feedback and show what you ship.</p><div className="settings-link"><a href={`/b/${workspace.slug}`} target="_blank" rel="noreferrer">{location.origin}/b/{workspace.slug}<ArrowUpRight size={18}/></a><Button onClick={onCopy}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?'Copied':'Copy link'}</Button></div></section>
      <section className="settings-section plan-section"><div className="settings-section-heading"><h2>{plus?'Your Plus pass':'Room to grow, when you need it.'}</h2><span className="plan-badge">{plus?'Plus':'Free beta'}</span></div><div className="plan-body"><div><strong>{plus?'Plus is active.':'₹499'}{!plus&&<small> / 30 days</small>}</strong><p>One account-wide pass. Up to five workspaces, each with 500 requests and 1 MB of stored text. No automatic renewal.</p><Button className="primary" onClick={checkout} disabled={busy||!session.billingConfigured||plus}>{plus?'Pass active':!session.billingConfigured?'Payments not available yet':busy?'Opening checkout…':'Buy a Plus pass'}<ArrowUpRight size={18}/></Button>{!session.billingConfigured&&<p className="plan-availability">Free beta is open. Checkout stays disabled until payments are ready.</p>}</div><div className="current-plan"><span>Your workspace</span><h3>{plus?'Plus':'Free'}</h3><p>{requestCount} of {plus?'500':'30'} requests used</p><div className="usage-track" aria-hidden="true"><span style={{width:`${Math.min(100,requestCount/(plus?500:30)*100)}%`}}/></div><p>{plus?'1 MB':'250 kB'} text storage. Record counts and text capacity apply together.</p></div></div></section>
      <section className="settings-section data-section"><div><DownloadSimple size={24}/><h2>Your work belongs to you.</h2><p>Download current requests, decisions and connected note/release IDs as a CSV. Exports stay available even when you reach a limit.</p></div><a className="button" href={`/api/workspaces/${workspace.id}/export`}><DownloadSimple size={18}/>Export feedback</a></section>
      <section className="settings-section danger-section"><div><h2>Delete this workspace</h2><p>Removes its feedback, releases and decision history. Billing records are retained separately for reconciliation.</p></div><Button onClick={onDelete}><Trash size={18}/>Delete workspace</Button></section></div></>;
}
function DeleteDialog({name,busy,onClose,onDelete}){
  const [confirmation,setConfirmation]=useState('');
  return <Modal title="Delete this workspace?" onClose={onClose}><p className="modal-intro">This permanently removes the feedback, decisions and releases in <strong>{name}</strong>. Export your feedback first if you need a copy.</p><form className="form-stack" onSubmit={event=>{event.preventDefault();if(confirmation===name)onDelete();}}><Field label={`Type ${name} to confirm`} value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" required/><div className="form-actions"><Button className="primary" disabled={busy||confirmation!==name}>{busy?'Deleting…':'Delete workspace'}<Trash size={18}/></Button><Button type="button" onClick={onClose}>Keep workspace</Button></div></form></Modal>;
}
