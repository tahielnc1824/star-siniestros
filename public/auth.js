(() => {
  const $ = id => document.getElementById(id);
  const gate=$('authGate'), shell=$('appShell'), form=$('authForm'), email=$('authEmail'), pass=$('authPassword'),
    submit=$('authSubmit'), msg=$('authMessage'), toggle=$('authModeToggle'), title=$('authTitle'), subtitle=$('authSubtitle'),
    userEmail=$('sessionEmail'), adminBadge=$('adminBadge'), logout=$('logoutBtn'), forgot=$('forgotPassword'), forgotBox=$('forgotPasswordBox'),
    forgotEmail=$('forgotEmail'), forgotSubmit=$('forgotSubmit'), forgotCancel=$('forgotCancel'), resetBox=$('resetPasswordBox'),
    resetPass=$('resetPassword'), resetConfirm=$('resetPasswordConfirm'), resetSubmit=$('resetPasswordSubmit'), resetCancel=$('resetPasswordCancel');

  let cfg=null, mode='login', session=null, recoverySession=null;
  const STORAGE='star_supabase_session';

  function showMessage(text,type=''){
    msg.textContent=text||'';
    msg.className='auth-message'+(type?' '+type:'');
  }

  function translateAuthError(value,fallback='Ocurrió un error. Intentá nuevamente.'){
    const raw=String(value||'').trim();
    const s=raw.toLowerCase();
    if(!s)return fallback;

    if(s.includes('new password should be different from the old password')) return 'La nueva contraseña debe ser distinta de la anterior.';
    if(s.includes('password should be at least') || s.includes('password must be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
    if(s.includes('weak password')) return 'La contraseña elegida es demasiado débil. Probá con una más segura.';
    if(s.includes('invalid login credentials')) return 'El email o la contraseña son incorrectos.';
    if(s.includes('email not confirmed')) return 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.';
    if(s.includes('user already registered') || s.includes('already registered') || s.includes('already exists')) return 'Ya existe una cuenta con ese correo. Iniciá sesión o recuperá tu contraseña.';
    if(s.includes('email rate limit exceeded') || s.includes('rate limit')) return 'Hiciste demasiados intentos seguidos. Esperá un momento y volvé a probar.';
    if(s.includes('for security purposes') && s.includes('seconds')) return 'Por seguridad, esperá unos segundos antes de volver a intentarlo.';
    if(s.includes('token has expired') || s.includes('otp_expired') || s.includes('expired')) return 'El enlace venció. Solicitá uno nuevo.';
    if(s.includes('invalid token') || s.includes('otp_disabled') || s.includes('bad_jwt')) return 'El enlace ya no es válido. Solicitá uno nuevo.';
    if(s.includes('signup is disabled')) return 'El registro de nuevas cuentas está deshabilitado.';
    if(s.includes('email address') && s.includes('invalid')) return 'Ingresá una dirección de email válida.';
    if(s.includes('network') || s.includes('fetch')) return 'No se pudo conectar con el servicio. Revisá tu conexión e intentá nuevamente.';
    return fallback;
  }
  function setMode(next){
    mode=next;
    forgotBox?.classList.add('hidden');
    resetBox?.classList.add('hidden');
    form?.classList.remove('hidden');
    document.querySelector('.auth-switch')?.classList.remove('hidden');
    const signup=mode==='signup';
    title.textContent=signup?'Crear cuenta':'Ingresar';
    subtitle.textContent=signup?'Creá tu acceso para usar STAR Siniestros.':'Ingresá con tu email y contraseña.';
    submit.textContent=signup?'Crear cuenta':'Ingresar';
    toggle.textContent=signup?'Ya tengo cuenta':'Crear una cuenta';
    forgot?.classList.toggle('hidden',signup);
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
  async function loadAccountRole(){
    try{
      const r=await fetch('/api/me');
      if(!r.ok)return;
      const data=await r.json();
      const isAdmin=data?.role==='admin';
      adminBadge?.classList.toggle('hidden',!isAdmin);
      document.body.dataset.role=isAdmin?'admin':'user';
    }catch{}
  }
  function enterApp(s){
    session=s;
    gate.classList.add('hidden');
    shell.classList.remove('hidden');
    userEmail.textContent=s?.user?.email||email.value||'Usuario';
    adminBadge?.classList.add('hidden');
    loadAccountRole();
  }
  function enterGate(){
    shell.classList.add('hidden');
    gate.classList.remove('hidden');
    userEmail.textContent='';
    adminBadge?.classList.add('hidden');
    delete document.body.dataset.role;
  }
  function sessionFromHash(){
    if(!location.hash||!location.hash.includes('access_token='))return null;
    const p=new URLSearchParams(location.hash.slice(1));
    const access_token=p.get('access_token');
    const refresh_token=p.get('refresh_token');
    if(!access_token)return null;
    const s={
      access_token,
      refresh_token:refresh_token||'',
      token_type:p.get('token_type')||'bearer',
      expires_in:Number(p.get('expires_in')||0),
      expires_at:Math.floor(Date.now()/1000)+Number(p.get('expires_in')||3600),
      auth_event:p.get('type')||'',
      user:null
    };
    window.history.replaceState(null,'',location.pathname+location.search);
    return s;
  }
  async function hydrateUser(current){
    if(!current?.access_token)return current;
    const r=await supa('/auth/v1/user',{headers:{Authorization:'Bearer '+current.access_token}});
    if(r.ok)current.user=await r.json();
    return current;
  }
  async function boot(){
    try{
      cfg=await publicConfig();
      if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error('Supabase todavía no está configurado.');
      const confirmed=sessionFromHash();
      if(confirmed){
        const recovery=confirmed.auth_event==='recovery';
        if(recovery){
          recoverySession=confirmed;
          form?.classList.add('hidden');
          forgotBox?.classList.add('hidden');
          document.querySelector('.auth-switch')?.classList.add('hidden');
          forgot?.classList.add('hidden');
          resetBox?.classList.remove('hidden');
          title.textContent='Elegí una nueva contraseña';
          subtitle.textContent='Ingresá una contraseña nueva para tu cuenta.';
          showMessage('');
          return;
        }
        const hydrated=await hydrateUser(confirmed);
        saveSession(hydrated);
        enterApp(hydrated);
        return;
      }
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
        const redirectTo=location.origin+'/';
        const r=await supa('/auth/v1/signup?redirect_to='+encodeURIComponent(redirectTo),{method:'POST',body:JSON.stringify({email:mail,password})});
        const data=await r.json();
        if(!r.ok){
          const raw=data?.msg||data?.message||data?.error_description||'';
          throw new Error(translateAuthError(raw,'No se pudo crear la cuenta.'));
        }
        if(data.access_token){saveSession(data);enterApp(data)}
        else{
          setMode('login');
          email.value=mail;
          showMessage('Cuenta creada. Revisá tu email para confirmar el acceso.','success');
        }
      }else{
        const r=await supa('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:mail,password})});
        const data=await r.json();
        if(!r.ok)throw new Error(translateAuthError(data?.msg||data?.message||data?.error_description,'Email o contraseña incorrectos.'));
        saveSession(data);enterApp(data);
      }
    }catch(err){showMessage(err.message||'No se pudo completar el acceso.','error')}
    finally{
      submit.disabled=false;
      submit.textContent=mode==='signup'?'Crear cuenta':'Ingresar';
    }
  });


  forgot?.addEventListener('click',()=>{
    form.classList.add('hidden');
    forgotBox.classList.remove('hidden');
    document.querySelector('.auth-switch')?.classList.add('hidden');
    title.textContent='Recuperar contraseña';
    subtitle.textContent='Ingresá el email de tu cuenta y te enviaremos un enlace para cambiar la contraseña.';
    forgotEmail.value='';
    forgotEmail.focus();
    showMessage('');
  });

  forgotSubmit?.addEventListener('click',async()=>{
    const mail=forgotEmail.value.trim();
    if(!mail){forgotEmail.focus();showMessage('Ingresá tu email.','error');return}
    forgotSubmit.disabled=true;forgotSubmit.textContent='Enviando…';showMessage('');
    try{
      const redirectTo=location.origin+'/';
      const r=await supa('/auth/v1/recover',{method:'POST',body:JSON.stringify({email:mail,redirect_to:redirectTo})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(translateAuthError(data?.msg||data?.message,'No se pudo enviar el correo de recuperación.'));
      showMessage('Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.','success');
    }catch(err){showMessage(err.message||'No se pudo enviar el correo de recuperación.','error')}
    finally{forgotSubmit.disabled=false;forgotSubmit.textContent='Enviar enlace de recuperación'}
  });

  forgotCancel?.addEventListener('click',()=>setMode('login'));

  resetSubmit?.addEventListener('click',async()=>{
    const p1=resetPass.value, p2=resetConfirm.value;
    if(!p1||p1.length<6){showMessage('La contraseña debe tener al menos 6 caracteres.','error');return}
    if(p1!==p2){showMessage('Las contraseñas no coinciden.','error');return}
    if(!recoverySession?.access_token){showMessage('El enlace de recuperación ya no es válido.','error');return}
    resetSubmit.disabled=true;showMessage('Actualizando contraseña…');
    try{
      const r=await supa('/auth/v1/user',{
        method:'PUT',
        headers:{Authorization:'Bearer '+recoverySession.access_token},
        body:JSON.stringify({password:p1})
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(translateAuthError(data?.msg||data?.message,'No se pudo cambiar la contraseña.'));
      window.history.replaceState(null,'',location.pathname+location.search);
      recoverySession=null;
      resetPass.value='';resetConfirm.value='';
      resetBox.classList.add('hidden');
      form.classList.remove('hidden');
      document.querySelector('.auth-switch')?.classList.remove('hidden');
      setMode('login');
      showMessage('Contraseña actualizada. Ya podés iniciar sesión.','success');
    }catch(err){showMessage(err.message||'No se pudo cambiar la contraseña.','error')}
    finally{resetSubmit.disabled=false}
  });

  resetCancel?.addEventListener('click',()=>{
    window.history.replaceState(null,'',location.pathname+location.search);
    recoverySession=null;
    resetPass.value='';resetConfirm.value='';
    resetBox.classList.add('hidden');
    form.classList.remove('hidden');
    document.querySelector('.auth-switch')?.classList.remove('hidden');
    setMode('login');
  });

  document.querySelectorAll('.password-toggle').forEach(button=>{
    button.addEventListener('click',()=>{
      const input=$(button.dataset.passwordTarget);
      if(!input)return;
      const showing=input.type==='text';
      input.type=showing?'password':'text';
      button.textContent=showing?'👁':'🙈';
      button.setAttribute('aria-label',showing?'Mostrar contraseña':'Ocultar contraseña');
      button.title=showing?'Mostrar contraseña':'Ocultar contraseña';
    });
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