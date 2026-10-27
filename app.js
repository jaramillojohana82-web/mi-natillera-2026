const STORAGE_KEY_URL = 'NATILLERA_2026_API_URL';
let ESTADO_GLOBAL = {
  dashboard: {},
  socios: [],
  prestamos: [],
  rifas: []
};

let CONCEPTO_ACTUAL = 'Ahorro';
let MEDIO_ACTUAL = 'Efectivo';
let ULTIMO_RECIBO_WA = { telefono: '', mensaje: '' };

const fmtCOP = (val) => '$' + Math.round(Number(val) || 0).toLocaleString('es-CO');

document.addEventListener('DOMContentLoaded', () => {
  configurarNavegacion();
  configurarEventosCaja();
  configurarCalculadoraPrestamos();
  configurarFiltros();

  const urlGuardada = localStorage.getItem(STORAGE_KEY_URL);
  if (!urlGuardada) {
    document.getElementById('modal-url').classList.remove('hidden');
  } else {
    document.getElementById('input-api-url').value = urlGuardada;
    sincronizarDatos();
  }

  document.getElementById('btn-config-url').addEventListener('click', () => {
    document.getElementById('modal-url').classList.remove('hidden');
  });

  document.getElementById('btn-guardar-url').addEventListener('click', () => {
    const url = document.getElementById('input-api-url').value.trim();
    if (!url.startsWith('https://script.google.com')) {
      alert('Por favor pega la URL válida de Google Apps Script (empieza por https://script.google.com...)');
      return;
    }
    localStorage.setItem(STORAGE_KEY_URL, url);
    document.getElementById('modal-url').classList.add('hidden');
    sincronizarDatos();
  });

  document.getElementById('btn-sync').addEventListener('click', sincronizarDatos);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

async function sincronizarDatos() {
  const apiUrl = localStorage.getItem(STORAGE_KEY_URL);
  if (!apiUrl) return;
  const sub = document.getElementById('subtitulo-estado');
  sub.textContent = '⏳ Sincronizando con Google Sheets...';

  try {
    const resp = await fetch(apiUrl);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || 'Error al leer datos');
    ESTADO_GLOBAL = json.data;
    renderizarTodo();
    sub.textContent = '✅ Conectado en tiempo real • 41 Activos';
  } catch (err) {
    sub.textContent = '⚠️ Sin conexión o verifica la URL en ⚙️';
  }
}

function renderizarTodo() {
  const d = ESTADO_GLOBAL.dashboard || {};
  document.getElementById('kpi-disponible').textContent = fmtCOP(d.totalDisponible);
  document.getElementById('kpi-efectivo').textContent = fmtCOP(d.efectivo);
  document.getElementById('kpi-nequi').textContent = fmtCOP(d.nequi);
  document.getElementById('kpi-bancolombia').textContent = fmtCOP(d.bancolombia);
  document.getElementById('kpi-cartera').textContent = fmtCOP(d.carteraViva);
  document.getElementById('kpi-ahorro').textContent = fmtCOP(d.capitalAhorrado);
  document.getElementById('kpi-utilidades-brutas').textContent = fmtCOP(d.utilidadesBrutas);
  document.getElementById('kpi-detalle-bolsa').textContent =
    `Int: ${fmtCOP(d.interesesRecaudados)} | Polla: ${fmtCOP(d.utilidadPolla)} | Rifas: ${fmtCOP(d.utilidadRifas)}`;
  document.getElementById('kpi-comision').textContent = fmtCOP(d.comisionAdmin);
  document.getElementById('kpi-ganancia-socio').textContent = fmtCOP(d.gananciaPorSocio);
  document.getElementById('kpi-utilidad-neta').textContent = `Utilidad Neta a Repartir: ${fmtCOP(d.utilidadNeta)}`;

  poblarSelectorClientesCaja('');
  renderizarListaPrestamos('');
  renderizarSemaforoRifas();
  renderizarListaSocios('');
}

function poblarSelectorClientesCaja(filtro) {
  const select = document.getElementById('select-cliente-caja');
  const q = (filtro || '').toLowerCase();
  select.innerHTML = '<option value="">-- Selecciona Socio o Deudor --</option>';

  ESTADO_GLOBAL.socios.forEach(s => {
    if (!q || s.nombre.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) {
      const opt = document.createElement('option');
      opt.value = `SOCIO|${s.id}|${s.nombre}`;
      opt.textContent = `${s.nombre} (${s.estado} • Ahorro: ${fmtCOP(s.ahorro)})`;
      select.appendChild(opt);
    }
  });

  const externosUnicos = [...new Set(
    ESTADO_GLOBAL.prestamos.filter(p => p.idSocio === 'EXTERNO').map(p => p.deudor)
  )];
  externosUnicos.forEach(nombreExt => {
    if (!q || nombreExt.toLowerCase().includes(q)) {
      const opt = document.createElement('option');
      opt.value = `EXTERNO|EXTERNO|${nombreExt}`;
      opt.textContent = `🤝 [Particular] ${nombreExt}`;
      select.appendChild(opt);
    }
  });
}

function configurarEventosCaja() {
  document.getElementById('buscador-cliente-caja').addEventListener('input', (e) => {
    poblarSelectorClientesCaja(e.target.value);
  });

  document.getElementById('select-cliente-caja').addEventListener('change', actualizarContextoClienteCaja);

  document.querySelectorAll('#grupo-conceptos .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#grupo-conceptos .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CONCEPTO_ACTUAL = btn.dataset.concepto;

      const inputMonto = document.getElementById('input-monto-caja');
      if (CONCEPTO_ACTUAL === 'Pago Polla') inputMonto.value = 5000;
      if (CONCEPTO_ACTUAL === 'Pago Rifa Mensual') inputMonto.value = 9000;

      document.getElementById('bloque-mes-rifa').classList.toggle('hidden', CONCEPTO_ACTUAL !== 'Pago Rifa Mensual');
      const esPrestamo = CONCEPTO_ACTUAL === 'Pago Interés Préstamo' || CONCEPTO_ACTUAL === 'Abono Capital Préstamo';
      document.getElementById('bloque-prestamo-ref').classList.toggle('hidden', !esPrestamo);
      actualizarContextoClienteCaja();
    });
  });

  document.querySelectorAll('#grupo-medios .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#grupo-medios .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      MEDIO_ACTUAL = btn.dataset.medio;
    });
  });

  document.getElementById('input-monto-caja').addEventListener('input', calcularImpactoAbonoCapital);
  document.getElementById('select-prestamo-caja').addEventListener('change', calcularImpactoAbonoCapital);
  document.getElementById('btn-guardar-pago').addEventListener('click', guardarPagoEnSheets);

  document.getElementById('btn-enviar-whatsapp').addEventListener('click', () => {
    const tel = ULTIMO_RECIBO_WA.telefono ? ULTIMO_RECIBO_WA.telefono.replace(/\D/g, '') : '';
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(ULTIMO_RECIBO_WA.mensaje)}`;
    window.open(url, '_blank');
  });
}

function actualizarContextoClienteCaja() {
  const val = document.getElementById('select-cliente-caja').value;
  const badge = document.getElementById('resumen-cliente-seleccionado');
  const selectPre = document.getElementById('select-prestamo-caja');
  selectPre.innerHTML = '';

  if (!val) {
    badge.classList.add('hidden');
    return;
  }

  const [tipo, idSocio, nombre] = val.split('|');
  const socioObj = ESTADO_GLOBAL.socios.find(s => s.id === idSocio);
  const prestamosCliente = ESTADO_GLOBAL.prestamos.filter(p =>
    p.estado === 'Activo' && (
      (idSocio !== 'EXTERNO' && p.idSocio === idSocio) ||
      p.deudor.toLowerCase() === nombre.toLowerCase()
    )
  );

  const deudaTotal = prestamosCliente.reduce((acc, p) => acc + p.saldoActual, 0);
  const interesMes = prestamosCliente.reduce((acc, p) => acc + p.cuotaInteres, 0);

  badge.classList.remove('hidden');
  badge.innerHTML = socioObj
    ? `<strong>${nombre}</strong> • Ahorro: <strong>${fmtCOP(socioObj.ahorro)}</strong> • Polla: ${fmtCOP(socioObj.polla)}<br>Deuda Préstamos: <strong>${fmtCOP(deudaTotal)}</strong> (Interés mes: ${fmtCOP(interesMes)})`
    : `<strong>${nombre} (Particular)</strong> • Deuda Viva: <strong>${fmtCOP(deudaTotal)}</strong> (Interés mes: ${fmtCOP(interesMes)})`;

  prestamosCliente.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.id} • Saldo: ${fmtCOP(p.saldoActual)} • Cuota Interés (${(p.tasa*100).toFixed(0)}%): ${fmtCOP(p.cuotaInteres)}`;
    selectPre.appendChild(opt);
  });

  if (CONCEPTO_ACTUAL === 'Pago Interés Préstamo' && prestamosCliente.length > 0) {
    document.getElementById('input-monto-caja').value = prestamosCliente[0].cuotaInteres;
  }
  calcularImpactoAbonoCapital();
}

function calcularImpactoAbonoCapital() {
  const aviso = document.getElementById('aviso-nuevo-interes');
  if (CONCEPTO_ACTUAL !== 'Abono Capital Préstamo') {
    aviso.classList.add('hidden');
    return;
  }
  const idPre = document.getElementById('select-prestamo-caja').value;
  const p = ESTADO_GLOBAL.prestamos.find(x => x.id === idPre);
  const abono = Number(document.getElementById('input-monto-caja').value) || 0;
  if (!p || abono <= 0) {
    aviso.classList.add('hidden');
    return;
  }
  const nuevoSaldo = Math.max(0, p.saldoActual - abono);
  const nuevoInteres = nuevoSaldo * p.tasa;
  aviso.classList.remove('hidden');
  aviso.innerHTML = `📉 Con este abono de <strong>${fmtCOP(abono)}</strong>, su saldo baja a <strong>${fmtCOP(nuevoSaldo)}</strong> y el interés del próximo mes (${(p.tasa*100).toFixed(0)}%) queda en <strong>${fmtCOP(nuevoInteres)}</strong>.`;
}

async function guardarPagoEnSheets() {
  const apiUrl = localStorage.getItem(STORAGE_KEY_URL);
  const valCliente = document.getElementById('select-cliente-caja').value;
  const monto = Number(document.getElementById('input-monto-caja').value);

  if (!valCliente || !monto || monto <= 0) {
    alert('Selecciona el cliente e ingresa un monto válido.');
    return;
  }

  const [tipo, idSocio, nombre] = valCliente.split('|');
  const btn = document.getElementById('btn-guardar-pago');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando en Google Sheets...';

  try {
    let archivoBase64 = '';
    let nombreArchivo = '';
    let mimeType = '';
    const fileInput = document.getElementById('input-comprobante');
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      mimeType = file.type;
      nombreArchivo = `Comprobante_${nombre.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      archivoBase64 = await convertirArchivoABase64(file);
    }

    const payload = {
      accion: 'REGISTRAR_MOVIMIENTO',
      idSocio: idSocio,
      nombre: nombre,
      concepto: CONCEPTO_ACTUAL,
      monto: monto,
      medioPago: MEDIO_ACTUAL,
      observaciones: document.getElementById('input-obs-caja').value.trim(),
      idPrestamo: document.getElementById('select-prestamo-caja').value || '',
      mesRifa: CONCEPTO_ACTUAL === 'Pago Rifa Mensual' ? document.getElementById('select-mes-rifa').value : '',
      archivoBase64,
      nombreArchivo,
      mimeType
    };

    const resp = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || 'Error al guardar');

    ESTADO_GLOBAL = json.data;
    renderizarTodo();

    const socioAct = ESTADO_GLOBAL.socios.find(s => s.id === idSocio);
    const prestamosAct = ESTADO_GLOBAL.prestamos.filter(p =>
      p.estado === 'Activo' && ((idSocio !== 'EXTERNO' && p.idSocio === idSocio) || p.deudor.toLowerCase() === nombre.toLowerCase())
    );
    const saldoDeuda = prestamosAct.reduce((a, b) => a + b.saldoActual, 0);
    const interesProx = prestamosAct.reduce((a, b) => a + b.cuotaInteres, 0);
    const ahorroAcum = socioAct ? socioAct.ahorro : 0;

    let msg = `Hola ${nombre}, se registró tu pago de ${fmtCOP(monto)} (${MEDIO_ACTUAL}) por concepto de ${CONCEPTO_ACTUAL}. Tu ahorro acumulado es de ${fmtCOP(ahorroAcum)} y el saldo actual de tu préstamo es ${fmtCOP(saldoDeuda)}.`;
    if (CONCEPTO_ACTUAL === 'Abono Capital Préstamo') {
      msg += ` Tu cuota de interés para el próximo mes queda en ${fmtCOP(interesProx)}.`;
    }

    ULTIMO_RECIBO_WA = {
      telefono: socioAct ? String(socioAct.telefono || '') : '',
      mensaje: msg
    };

    document.getElementById('texto-preview-recibo').textContent = msg;
    document.getElementById('card-recibo-whatsapp').classList.remove('hidden');
    document.getElementById('input-monto-caja').value = '';
    document.getElementById('input-obs-caja').value = '';
    fileInput.value = '';
  } catch (err) {
    alert('Error al guardar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Guardar Pago en Google Sheets';
  }
}

function configurarCalculadoraPrestamos() {
  const inpMonto = document.getElementById('input-monto-prestamo');
  const selTasa = document.getElementById('select-tasa-prestamo');
  const divSim = document.getElementById('resultado-simulacion-prestamo');

  const actualizarSim = () => {
    const m = Number(inpMonto.value) || 0;
    const t = Number(selTasa.value) || 0.06;
    divSim.innerHTML = `Cuota de interés mensual (${(t*100).toFixed(0)}% sobre saldo): <strong>${fmtCOP(m * t)} / mes</strong>`;
  };
  inpMonto.addEventListener('input', actualizarSim);
  selTasa.addEventListener('change', actualizarSim);

  document.getElementById('btn-crear-prestamo').addEventListener('click', async () => {
    const apiUrl = localStorage.getItem(STORAGE_KEY_URL);
    const deudor = document.getElementById('input-deudor-nuevo').value.trim();
    const montoInicial = Number(inpMonto.value);
    const tasaMensual = Number(selTasa.value);
    const medioPago = document.getElementById('select-medio-desembolso').value;

    if (!deudor || !montoInicial || montoInicial <= 0) {
      alert('Ingresa el nombre del deudor y el monto a prestar.');
      return;
    }

    const socioMatch = ESTADO_GLOBAL.socios.find(s => s.nombre.toLowerCase() === deudor.toLowerCase());
    const resp = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        accion: 'CREAR_PRESTAMO',
        deudor,
        idSocio: socioMatch ? socioMatch.id : 'EXTERNO',
        montoInicial,
        tasaMensual,
        medioPago
      })
    });
    const json = await resp.json();
    if (json.ok) {
      ESTADO_GLOBAL = json.data;
      renderizarTodo();
      alert('✅ Préstamo registrado y descontado del arqueo de ' + medioPago);
      document.getElementById('input-deudor-nuevo').value = '';
      inpMonto.value = '';
    }
  });
}

function renderizarListaPrestamos(filtro) {
  const cont = document.getElementById('lista-prestamos');
  const q = (filtro || '').toLowerCase();
  cont.innerHTML = '';

  ESTADO_GLOBAL.prestamos
    .filter(p => p.estado === 'Activo' && (!q || p.deudor.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)))
    .forEach(p => {
      const div = document.createElement('div');
      div.className = 'item-row';
      div.innerHTML = `
        <div>
          <strong>${p.deudor}</strong> <small>(${p.id} • ${(p.tasa*100).toFixed(0)}%)</small><br>
          <small>Inicial: ${fmtCOP(p.montoInicial)} | Abonado: ${fmtCOP(p.abonosCapital)}</small>
        </div>
        <div style="text-align:right">
          <strong class="text-amber">${fmtCOP(p.saldoActual)}</strong><br>
          <small>Int/mes: ${fmtCOP(p.cuotaInteres)}</small>
        </div>
      `;
      cont.appendChild(div);
    });
}

function renderizarSemaforoRifas() {
  const mesIdx = Number(document.getElementById('select-mes-semaforo').value) || 0;
  const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const cont = document.getElementById('lista-semaforo-rifas');
  cont.innerHTML = '';

  let pagadas = 0;
  let pendientes = 0;

  ESTADO_GLOBAL.rifas.forEach(r => {
    const estadoMes = r.meses[mesIdx];
    if (estadoMes === 'No Aplica') return;
    if (estadoMes === 'Pagado') pagadas++;
    else pendientes++;

    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
      <div>
        <strong>${r.nombre}</strong> <small>(${r.boleta})</small>
      </div>
      <div>
        ${estadoMes === 'Pagado'
          ? '<span class="badge-pagado">✅ Pagado</span>'
          : `<span class="badge-pendiente">🔴 Pendiente</span>
             <button class="btn-mini" onclick="recordarRifaWhatsApp('${r.nombre}', '${nombresMes[mesIdx]}')">📲 Cobrar</button>`
        }
      </div>
    `;
    cont.appendChild(div);
  });

  document.getElementById('resumen-mes-rifa').innerHTML =
    `Mes: <strong>${nombresMes[mesIdx]}</strong> • ✅ Pagadas: <strong>${pagadas}</strong> (${fmtCOP(pagadas * 9000)}) • 🔴 Pendientes: <strong>${pendientes}</strong>`;
}

window.recordarRifaWhatsApp = function(nombre, mes) {
  const msg = `Hola ${nombre}, te recuerdo con cariño el pago de la boleta de la Rifa de ${mes} ($9.000) de nuestra Natillera 2026. ¡Gracias!`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
};

function renderizarListaSocios(filtro) {
  const cont = document.getElementById('lista-socios');
  const q = (filtro || '').toLowerCase();
  cont.innerHTML = '';

  ESTADO_GLOBAL.socios
    .filter(s => !q || s.nombre.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
    .forEach(s => {
      const div = document.createElement('div');
      div.className = 'item-row';
      div.innerHTML = `
        <div>
          <strong>${s.nombre}</strong> <small>(${s.id} • ${s.estado})</small><br>
          <small>Ahorro: ${fmtCOP(s.ahorro)} | Polla: ${fmtCOP(s.polla)} | Deuda: ${fmtCOP(s.deudaCapital)}</small>
        </div>
        <div style="text-align:right">
          <strong class="text-emerald">${fmtCOP(s.netoEntregar)}</strong><br>
          <small>Neto Dic.</small>
        </div>
      `;
      cont.appendChild(div);
    });
}

function configurarFiltros() {
  document.getElementById('buscador-prestamos').addEventListener('input', e => renderizarListaPrestamos(e.target.value));
  document.getElementById('select-mes-semaforo').addEventListener('change', renderizarSemaforoRifas);
  document.getElementById('buscador-socios').addEventListener('input', e => renderizarListaSocios(e.target.value));
}

function configurarNavegacion() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });
}

function convertirArchivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
