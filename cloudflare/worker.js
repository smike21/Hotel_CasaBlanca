const DAY = 86400000;
const enc = new TextEncoder();

const escape = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const money = (n) => `S/ ${Number(n).toFixed(0)}`;
const dateOk = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const nights = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const random = () => crypto.randomUUID().replaceAll('-', '');

function layout(title, content, session) {
  const flash = session?.flash ? `<div class="flash flash-${session.flash.type}">${escape(session.flash.text)}</div>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Hotel Casa Blanca</title><link rel="stylesheet" href="/css/style.css"></head><body>
  <header class="site-header"><div class="container"><a class="brand-mark" href="/"><div>HOTEL CASA BLANCA<small>LA UNIÓN · HUÁNUCO</small></div></a><nav class="main-nav"><a href="/">Inicio</a><a href="/habitaciones">Habitaciones</a><a href="/contacto">Contacto</a></nav><a href="/reserva" class="btn btn-clay">Reservar</a></div></header>
  ${flash}${content}<footer class="site-footer"><div class="container"><div><h4>Hotel Casa Blanca</h4><p>Comodidad y trato cercano en La Unión, Huánuco.</p></div><div><h4>Contacto</h4><a href="/contacto">Escríbenos</a><a href="/admin/login">Panel administrativo</a></div></div></footer></body></html>`;
}

function formToken(session) { return `<input type="hidden" name="_csrf" value="${session.csrf}">`; }
function cookie(request, name) { return request.headers.get('Cookie')?.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1); }

async function sessionFor(request, env) {
  const sid = cookie(request, 'hcb_sid');
  if (sid) {
    const row = await env.DB.prepare('SELECT data FROM SesionesWeb WHERE sid=? AND expira_en > CURRENT_TIMESTAMP').bind(sid).first();
    if (row) return { id: sid, ...JSON.parse(row.data), fresh: false };
  }
  return { id: random(), csrf: random(), fresh: true };
}
async function saveSession(env, session) {
  const data = { csrf: session.csrf, user: session.user, flash: session.flash };
  await env.DB.prepare(`INSERT INTO SesionesWeb(sid,data,expira_en) VALUES(?,?,datetime('now','+4 hours')) ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expira_en=excluded.expira_en`).bind(session.id, JSON.stringify(data)).run();
}
async function reply(env, session, body, status = 200, headers = {}) {
  await saveSession(env, session);
  session.flash = undefined;
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Set-Cookie', `hcb_sid=${session.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`);
  responseHeaders.set('Content-Type', 'text/html; charset=UTF-8');
  responseHeaders.set('X-Frame-Options', 'DENY');
  return new Response(body, { status, headers: responseHeaders });
}
function redirect(url) { return new Response(null, { status: 303, headers: { Location: url } }); }
async function readForm(request, session) {
  const form = await request.formData();
  if (form.get('_csrf') !== session.csrf) throw new Error('CSRF');
  return Object.fromEntries(form);
}
async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 }, key, 256);
  const bytes = new Uint8Array(bits);
  const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex(salt)}:${hex(bytes)}`;
}
async function passwordMatches(password, saved) {
  const [saltHex] = saved.split(':');
  if (!saltHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  return (await hashPassword(password, salt)) === saved;
}
async function rooms(env, guests = 1, checkin, checkout) {
  let sql = `SELECT h.id,h.numero,h.piso,t.nombre tipo_nombre,t.precio_base,t.capacidad,(SELECT url FROM FotosHabitacion f WHERE f.tipo_id=t.id ORDER BY orden LIMIT 1) foto FROM Habitaciones h JOIN TiposHabitacion t ON t.id=h.tipo_id JOIN EstadosHabitacion e ON e.id=h.estado_id WHERE h.activo=1 AND t.capacidad>=? AND e.nombre<>'Mantenimiento'`;
  const params = [guests];
  if (checkin && checkout) { sql += ` AND NOT EXISTS (SELECT 1 FROM DetalleReserva d JOIN Reservas r ON r.id=d.reserva_id JOIN EstadosReserva er ON er.id=r.estado_id WHERE d.habitacion_id=h.id AND er.nombre<>'Cancelada' AND r.fecha_checkin<? AND r.fecha_checkout>?)`; params.push(checkout, checkin); }
  return env.DB.prepare(sql).bind(...params).all();
}
function card(room, booking = '') { return `<div class="room-card"><div class="thumb"><img src="${escape(room.foto || '/img/portada-hotel.png')}" alt="Habitación ${escape(room.tipo_nombre)}"><span class="tag">${room.capacidad} huésped(es)</span></div><div class="body"><h3>${escape(room.tipo_nombre)}</h3><p>Habitación ${escape(room.numero)} · Piso ${room.piso}</p><div class="price">${money(room.precio_base)} <span>/ noche</span></div>${booking}</div></div>`; }

async function publicRoute(request, env, session, url) {
  if (url.pathname === '/') {
    const result = await rooms(env); const grid = result.results.map((r) => card(r, '<a class="btn btn-ghost-dark" href="/reserva">Reservar</a>')).join('');
    return reply(env, session, layout('Inicio', `<section class="hero"><div class="hero-photo" style="background-image:url('/img/portada-hotel.png')"></div><div class="container hero-inner"><div class="eyebrow">La Unión · Huánuco</div><h1 class="headline">SE SIENTE<br><span class="accent">COMO EN CASA</span></h1><p class="lede">Limpieza, comodidad y trato personalizado para cada estadía.</p><a href="/reserva" class="btn btn-clay">Reservar ahora</a></div></section><section><div class="container"><div class="section-head"><div><div class="section-label">Nuestras habitaciones</div><h2 class="section-title">Un ambiente para cada viajero</h2></div></div><div class="room-grid">${grid}</div></div></section>`, session));
  }
  if (url.pathname === '/habitaciones') { const result = await rooms(env); return reply(env, session, layout('Habitaciones', `<section><div class="container"><div class="section-label">Alojamiento</div><h1 class="section-title" style="margin-bottom:32px">Nuestras habitaciones</h1><div class="room-grid">${result.results.map((r) => card(r, '<a class="btn btn-clay" href="/reserva">Reservar</a>')).join('')}</div></div></section>`, session)); }
  if (url.pathname === '/contacto' && request.method === 'GET') return reply(env, session, layout('Contacto', `<section><div class="container grid-2"><div><div class="section-label">Contacto</div><h1 class="section-title">Hablemos de tu estadía</h1><p>La Unión, Huánuco, Perú</p></div><div class="card"><form method="post">${formToken(session)}<div class="field"><label>Nombre</label><input name="nombre" required maxlength="120"></div><div class="field"><label>Correo</label><input type="email" name="email" required></div><div class="field"><label>Teléfono</label><input name="telefono" maxlength="20"></div><div class="field"><label>Mensaje</label><textarea name="mensaje" required maxlength="1000"></textarea></div><button class="btn btn-clay">Enviar mensaje</button></form></div></div></section>`, session));
  if (url.pathname === '/contacto' && request.method === 'POST') { const f = await readForm(request, session); if (!f.nombre || !f.email || !f.mensaje) throw new Error('Datos inválidos'); await env.DB.prepare('INSERT INTO MensajesContacto(nombre,email,telefono,mensaje) VALUES(?,?,?,?)').bind(f.nombre.trim(), f.email.trim(), f.telefono?.trim() || null, f.mensaje.trim()).run(); session.flash = { type: 'success', text: 'Mensaje enviado. Te responderemos pronto.' }; return reply(env, session, '', 303, { Location: '/contacto' }); }
  if (url.pathname === '/reserva' && request.method === 'GET') return reply(env, session, layout('Reservar', `<section class="section-tight"><div class="container" style="max-width:640px"><div class="card"><div class="section-label">Paso 1 de 3</div><h1 class="section-title">Reserva tu estadía</h1><form method="post" action="/reserva/buscar">${formToken(session)}<div class="field"><label>Check-in</label><input type="date" name="checkin" required></div><div class="field"><label>Check-out</label><input type="date" name="checkout" required></div><div class="field"><label>Huéspedes</label><input type="number" name="huespedes" min="1" max="12" value="2" required></div><button class="btn btn-clay">Buscar disponibilidad</button></form></div></div></section>`, session));
  if (url.pathname === '/reserva/buscar' && request.method === 'POST') { const f = await readForm(request, session); const g = Number(f.huespedes); if (!dateOk(f.checkin) || !dateOk(f.checkout) || nights(f.checkin, f.checkout) < 1 || !Number.isInteger(g) || g < 1 || g > 12) throw new Error('Fechas o huéspedes inválidos'); const result = await rooms(env, g, f.checkin, f.checkout); const choose = (r) => card(r, `<a class="btn btn-clay" href="/reserva/datos?habitacion_id=${r.id}&checkin=${f.checkin}&checkout=${f.checkout}&huespedes=${g}">Elegir esta habitación</a>`); return reply(env, session, layout('Disponibilidad', `<section><div class="container"><div class="section-label">Paso 2 de 3</div><h1 class="section-title">Habitaciones disponibles</h1><p>${escape(f.checkin)} → ${escape(f.checkout)} · ${g} huésped(es)</p><div class="room-grid">${result.results.map(choose).join('') || '<div class="card">No hay habitaciones disponibles para esas fechas.</div>'}</div></div></section>`, session)); }
  if (url.pathname === '/reserva/datos') { const q = Object.fromEntries(url.searchParams); if (!dateOk(q.checkin) || !dateOk(q.checkout) || !Number(q.habitacion_id)) return redirect('/reserva'); return reply(env, session, layout('Datos de reserva', `<section><div class="container" style="max-width:640px"><div class="card"><div class="section-label">Paso 3 de 3</div><h1 class="section-title">Tus datos</h1><form method="post" action="/reserva/confirmar">${formToken(session)}<input type="hidden" name="habitacion_id" value="${escape(q.habitacion_id)}"><input type="hidden" name="checkin" value="${escape(q.checkin)}"><input type="hidden" name="checkout" value="${escape(q.checkout)}"><input type="hidden" name="huespedes" value="${escape(q.huespedes)}"><div class="modal-form"><div class="field"><label>Nombres</label><input name="nombres" required></div><div class="field"><label>Apellidos</label><input name="apellidos" required></div><div class="field"><label>Documento</label><input name="numero_documento" required></div><div class="field"><label>Correo</label><input name="email" type="email" required></div><div class="field"><label>Teléfono</label><input name="telefono" required></div></div><button class="btn btn-clay">Confirmar reserva</button></form></div></div></section>`, session)); }
  if (url.pathname === '/reserva/confirmar' && request.method === 'POST') { const f = await readForm(request, session); const g = Number(f.huespedes), roomId = Number(f.habitacion_id); if (![f.nombres,f.apellidos,f.numero_documento,f.email,f.telefono].every(Boolean) || !dateOk(f.checkin) || !dateOk(f.checkout) || nights(f.checkin,f.checkout)<1) throw new Error('Datos de reserva inválidos'); const available = await rooms(env,g,f.checkin,f.checkout); const room = available.results.find((r) => r.id === roomId); if (!room) throw new Error('La habitación ya no está disponible'); let guest = await env.DB.prepare('SELECT id FROM Huespedes WHERE tipo_documento=? AND numero_documento=?').bind('DNI',f.numero_documento).first(); if (!guest) { const x = await env.DB.prepare('INSERT INTO Huespedes(nombres,apellidos,tipo_documento,numero_documento,email,telefono) VALUES(?,?,?,?,?,?)').bind(f.nombres,f.apellidos,'DNI',f.numero_documento,f.email,f.telefono).run(); guest={id:x.meta.last_row_id}; } const total=room.precio_base*nights(f.checkin,f.checkout), code=`HCB-${new Date().getFullYear()}-${Math.floor(100000+Math.random()*900000)}`; const r = await env.DB.prepare('INSERT INTO Reservas(codigo,huesped_id,estado_id,fecha_checkin,fecha_checkout,num_huespedes,total) VALUES(?,?,1,?,?,?,?)').bind(code,guest.id,f.checkin,f.checkout,g,total).run(); await env.DB.prepare('INSERT INTO DetalleReserva(reserva_id,habitacion_id,precio_noche,noches,subtotal) VALUES(?,?,?,?,?)').bind(r.meta.last_row_id,roomId,room.precio_base,nights(f.checkin,f.checkout),total).run(); return reply(env,session,layout('Reserva confirmada',`<section><div class="container" style="max-width:640px"><div class="card"><div class="section-label">Reserva confirmada</div><h1 class="section-title">¡Gracias!</h1><p>Código: <strong>${code}</strong></p><p>Total: <strong>${money(total)}</strong></p></div></div></section>`,session)); }
  return null;
}

export default { async fetch(request, env) { const url = new URL(request.url); if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/img/')) return env.ASSETS.fetch(request); const session = await sessionFor(request,env); try { const publicResponse = await publicRoute(request,env,session,url); if (publicResponse) return publicResponse; return reply(env,session,layout('No encontrado','<section><div class="container"><h1 class="section-title">Página no encontrada</h1></div></section>',session),404); } catch (error) { session.flash={type:'error',text:error.message==='CSRF'?'El formulario venció. Inténtalo nuevamente.':error.message||'Ocurrió un error.'}; return reply(env,session,'',303,{Location:request.headers.get('Referer') || '/'}); } } };
