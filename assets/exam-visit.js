(() => {
  'use strict';
  const access=window.EnglishAccess;
  let session=null, rendered=false, active=true, recorded=false, pending=false;
  let viewId=null, attempts=0, retry=null, epoch=0;
  function sameStudent(){const live=access?.session();return session?.role==='student'&&live?.role==='student'&&session.token===live.token&&session.student?.id===live.student?.id;}
  function visible(){return document.visibilityState==='visible'&&!document.hidden&&(typeof document.hasFocus!=='function'||document.hasFocus());}
  function clearRetry(){if(retry!==null){clearTimeout(retry);retry=null;}}
  function stop(){epoch++;active=false;rendered=false;session=null;clearRetry();}
  function id(){
    if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  async function send(){
    if(!active||!rendered||recorded||pending||!sameStudent()||!visible()||attempts>=3)return;
    const ticket=epoch;pending=true;attempts++;
    try{
      viewId ||= id();
      const result=await access.request('/api/exam-results/view',{method:'POST',body:{viewId}});
      if(ticket!==epoch||!active)return;
      if(result?.ok!==true)throw new Error('View not acknowledged.');
      if(!sameStudent()){stop();return;}
      recorded=true;clearRetry();
    }catch(_){
      if(ticket!==epoch||!active)return;
      if(!sameStudent()){stop();return;}
      if(attempts<3){clearRetry();retry=setTimeout(()=>{retry=null;send();},1000*2**(attempts-1));}
    }finally{if(ticket===epoch)pending=false;}
  }
  window.EnglishExamVisits={rendered(){if(!active)return;rendered=true;send();},stop};
  document.addEventListener('visibilitychange',send);
  window.addEventListener('focus',send);
  window.addEventListener('online',()=>{if(!recorded){attempts=0;clearRetry();send();}});
  window.addEventListener('english:logout',stop);
  window.addEventListener('english:session-expired',stop);
  window.addEventListener('pagehide',stop);
  access?.ready.then(value=>{if(!active||value?.role!=='student')return;session=value;if(sameStudent())send();else stop();});
})();
