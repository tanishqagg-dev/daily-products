import React,{useEffect,useState} from 'react';
import {ArrowUpRight,Plus,ChatText,PaperPlaneTilt,LockKey,CheckCircle,ArrowLeft} from '@phosphor-icons/react';
import {api,post,dateLabel} from './api.js';
import {Logo,Footer,Button,Notice,Status,RequestForm,Loading} from './components.jsx';

export default function PublicBoard(){
  const slug=decodeURIComponent(location.pathname.split('/')[2]||'');
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [tab,setTab]=useState('roadmap');
  const [formOpen,setFormOpen]=useState(false);
  useEffect(()=>{let active=true;api(`/public/${encodeURIComponent(slug)}`).then(result=>{if(active)setData(result);}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[slug]);
  async function send(values,form){
    setBusy(true);setError('');setNotice('');
    try{await post(`/public/${encodeURIComponent(slug)}/requests`,values);form.reset();setNotice('Your note has landed. The workspace owner can read your context; only your title and status appear here.');setData(await api(`/public/${encodeURIComponent(slug)}`));}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <><header className="public-header"><Logo/><a className="text-button" href="/auth">Your workspace <ArrowUpRight size={17}/></a></header>
    {loading?<Loading label="Opening the feedback page…"/>:!data?<main className="page-width public-not-found"><ChatText size={36}/><h1>This page isn't ready.</h1><Notice error>{error}</Notice><a className="button" href="/">Back to Foldline <ArrowLeft size={18}/></a></main>:<main className="public-page page-width">
      <header className="public-intro"><div><span className="eyebrow">{data.workspace.name} / FEEDBACK & UPDATES</span><h1>A better next step<br/>starts with a note.</h1><p>What's getting in your way? Share a little context and follow what happens next.</p></div><Button className="primary public-add" onClick={()=>setFormOpen(!formOpen)}><Plus size={18}/>{formOpen?'Close feedback form':'Leave feedback'}</Button></header>
      <div className={`public-columns ${formOpen?'form-is-open':''}`}><section className="public-updates"><div className="public-tabs" aria-label="Public board view"><button aria-pressed={tab==='roadmap'} onClick={()=>setTab('roadmap')}><ChatText size={19}/>Feedback<span>{data.requests.length}</span></button><button aria-pressed={tab==='releases'} onClick={()=>setTab('releases')}><PaperPlaneTilt size={19}/>Releases<span>{data.releases.length}</span></button></div>
        {tab==='roadmap'?<>{data.requests.length?data.requests.filter(item=>item.status!=='merged').map(item=><article className="public-note" key={item.id}><div><Status value={item.status}/><time>{dateLabel(item.createdAt)}</time></div><h2>{item.title}</h2></article>):<div className="public-empty"><ChatText size={31}/><h2>No notes yet. Yours could be first.</h2><p>Say what you're trying to do and where you get stuck.</p><Button onClick={()=>setFormOpen(true)}>Leave a note <ArrowUpRight size={17}/></Button></div>}</>:<>{data.releases.length?data.releases.map(item=><article className="public-release" key={item.id}><div className="release-date"><CheckCircle size={20}/><time>{dateLabel(item.createdAt)}</time></div><h2>{item.title}</h2><p>{item.body}</p></article>):<div className="public-empty"><PaperPlaneTilt size={32}/><h2>The next update will land here.</h2><p>No releases have been published yet.</p></div>}</>}
      </section><aside className="public-form"><div className="public-form-heading"><span className="eyebrow">A LITTLE CONTEXT HELPS</span><h2>What could work better?</h2><p>Describe the problem as you see it. You don't need to have the solution.</p></div><Notice error>{error}</Notice><Notice>{notice}</Notice><RequestForm busy={busy} publicForm onSubmit={send}/><div className="public-privacy"><LockKey size={18}/><p>Only your title and status are public. Leave passwords, payment details and sensitive information out of your note.</p></div></aside></div>
    </main>}<Footer/></>;
}
