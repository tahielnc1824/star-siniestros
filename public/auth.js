(() => {
  const $ = id => document.getElementById(id);
  const gate=$('authGate'), shell=$('appShell'), form=$('authForm'), email=$('authEmail'), pass=$('authPassword'),
    submit=$('authSubmit'), msg=$('authMessage'), toggle=$('authModeToggle'), title=$('authTitle'), subtitle=$('authSubtitle'),
    userEmail=$('sessionEmail'), logout=$('logoutBtn');

  let cfg=null, mode='login', session=null;
  const STORAGE='star_supabase_session';

  function showMessage(text,type=''){
    msg.textContent=text||'';
    msg.className='auth-message'+(type?' '+type:'');
  }
  function setMode(next){
    mode=next;
    const signup=mode==='signup';
    title.textContent=signup?'Crear cuenta':'Ingresar';
    subtitle.textContent=signup?'Creá tu acceso para usar STAR Siniestros.':'Ingresá con tu email y contraseña.';
    submit.textContent=signup?'Crear cuenta':'Ingresar';
    toggle.textContent=signup?'Ya tengo cuenta':'Crear una cuenta';
    showMessage('');
  }
  function saveSession(s){
    session=s||null;
    if(session)localStorage.setItem(STORAGE,JSON.stringify(session));
    else localStorage.removeItem(STORAGE);
  }
  function getStored(){
    try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return null}
  }
  async function publicConfig(){
    const r=await fetch('/api/public-config');
    if(!r.ok)throw new Error('No se pudo cargar la configuración de acceso.');
    return r.json();
  }
  async function supa(path,opts={}){
    const headers={
      'Content-Type':'application/json',
      apikey:cfg.supabasePublishableKey,
      ...(opts.headers||{})
    };
    return fetch(cfg.supabaseUrl+path,{...opts,headers});
  }
  async function refreshSession(current){
    if(!current?.refresh_token)return null;
    const r=await supa('/auth/v1/token?grant_type=refresh_token',{
      method:'POST',body:JSON.stringify({refresh_token:current.refresh_token})
    });
    if(!r.ok)return null;
    const data=await r.json();
    saveSession(data);
    return data;
  }
  async function validateSession(current){
    if(!current?.access_token)return null;
    let r=await supa('/auth/v1/user',{headers:{Authorization:'Bearer '+current.access_token}});
    if(r.ok)return current;
    const fresh=await refreshSession(current);
    if(!fresh)return null;
    r=await supa('/auth/v1/user',{headers:{Authorization:'Bearer '+fresh.access_token}});
    return r.ok?fresh:null;
  }
  function enterApp(s){
    session=s;
    gate.classList.add('hidden');
    shell.classList.remove('hidden');
    userEmail.textContent=s?.user?.email||email.value||'Usuario';
  }
  function enterGate(){
    shell.classList.add('hidden');
    gate.classList.remove('hidden');
    userEmail.textContent='';
  }
  async function boot(){
    try{
      cfg=await publicConfig();
      if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error('Supabase todavía no está configurado.');
      const valid=await validateSession(getStored());
      if(valid){saveSession(valid);enterApp(valid)}
      else{saveSession(null);enterGate()}
    }catch(e){
      enterGate();
      showMessage(e.message||'No se pudo iniciar el acceso.','error');
      submit.disabled=true;
    }
  }

  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const mail=email.value.trim(), password=pass.value;
    if(!mail||!password){showMessage('Completá email y contraseña.','error');return}
    submit.disabled=true;
    submit.textContent=mode==='signup'?'Creando…':'Ingresando…';
    showMessage('');
    try{
      if(mode==='signup'){
        const r=await supa('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:mail,password})});
        const data=await r.json();
        if(!r.ok)throw new Error(data?.msg||data?.message||data?.error_description||'No se pudo crear la cuenta.');
        if(data.access_token){saveSession(data);enterApp(data)}
        else{
          setMode('login');
          email.value=mail;
          showMessage('Cuenta creada. Revisá tu email para confirmar el acceso.','success');
        }
      }else{
        const r=await supa('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:mail,password})});
        const data=await r.json();
        if(!r.ok)throw new Error(data?.msg||data?.message||data?.error_description||'Email o contraseña incorrectos.');
        saveSession(data);enterApp(data);
      }
    }catch(err){showMessage(err.message||'No se pudo completar el acceso.','error')}
    finally{
      submit.disabled=false;
      submit.textContent=mode==='signup'?'Crear cuenta':'Ingresar';
    }
  });

  toggle?.addEventListener('click',()=>setMode(mode==='login'?'signup':'login'));
  logout?.addEventListener('click',async()=>{
    try{
      if(session?.access_token)await supa('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+session.access_token}});
    }catch{}
    saveSession(null);session=null;enterGate();pass.value='';showMessage('Sesión cerrada.');
  });

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.startsWith('/api/') && url!=='/api/public-config'){
      let s=session||getStored();
      if(s?.access_token){
        const headers=new Headers(init.headers||{});
        headers.set('Authorization','Bearer '+s.access_token);
        init={...init,headers};
      }
    }
    const res=await nativeFetch(input,init);
    if(url.startsWith('/api/') && res.status===401){
      saveSession(null);session=null;enterGate();showMessage('Tu sesión venció. Volvé a ingresar.','error');
    }
    return res;
  };

  setMode('login');
  boot();
})();