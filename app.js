const DIAS_RECORDATORIO = 20;

// Estado en memoria
let productos = [];
let ventas = [];
let clientes = [];
let movimientos = [];

let imagenProductoTemporal = "";
let clienteCuentaAbierta = null;

// Referencias a colecciones de Firebase Firestore
const colProductos = db.collection("productos");
const colVentas = db.collection("ventas");
const colClientes = db.collection("clientes");
const colMovimientos = db.collection("movimientos");

// Iniciar conexión y sincronización en tiempo real
iniciarSincronizacionFirestore();

async function iniciarSincronizacionFirestore() {
  await migrarDatosLocalesAFirebase();

  colProductos.onSnapshot((snapshot) => {
    productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    normalizarDatos();
    actualizarTodo();
  }, (err) => console.error("Error al sincronizar productos:", err));

  colVentas.onSnapshot((snapshot) => {
    ventas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Ordenar de más reciente a más antigua
    ventas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    normalizarDatos();
    actualizarTodo();
  }, (err) => console.error("Error al sincronizar ventas:", err));

  colClientes.onSnapshot((snapshot) => {
    clientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    normalizarDatos();
    actualizarTodo();
  }, (err) => console.error("Error al sincronizar clientes:", err));

  colMovimientos.onSnapshot((snapshot) => {
    movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    renderInventario();
  }, (err) => console.error("Error al sincronizar movimientos:", err));
}

// Migra datos existentes en localStorage hacia Firebase la primera vez
async function migrarDatosLocalesAFirebase() {
  if (localStorage.getItem("cfragancias_migrado_firestore")) return;

  const localProd = JSON.parse(localStorage.getItem("productos") || "[]");
  const localVent = JSON.parse(localStorage.getItem("ventas") || "[]");
  const localCli = JSON.parse(localStorage.getItem("clientes") || "[]");
  const localMov = JSON.parse(localStorage.getItem("movimientos") || "[]");

  if (!localProd.length && !localVent.length && !localCli.length && !localMov.length) {
    localStorage.setItem("cfragancias_migrado_firestore", "true");
    return;
  }

  try {
    const batch = db.batch();

    localProd.forEach(p => {
      const ref = colProductos.doc(String(p.id));
      batch.set(ref, p, { merge: true });
    });

    localCli.forEach(c => {
      const ref = colClientes.doc(String(c.id));
      batch.set(ref, c, { merge: true });
    });

    localVent.forEach(v => {
      const ref = colVentas.doc(String(v.id));
      batch.set(ref, v, { merge: true });
    });

    localMov.forEach(m => {
      const ref = colMovimientos.doc(String(m.id));
      batch.set(ref, m, { merge: true });
    });

    await batch.commit();
    localStorage.setItem("cfragancias_migrado_firestore", "true");
    console.log("Datos locales migrados con éxito a Firebase Firestore.");
  } catch (error) {
    console.warn("No se pudo completar la migración inicial:", error);
  }
}

function normalizarDatos() {
  productos = Array.isArray(productos) ? productos : [];
  ventas = Array.isArray(ventas) ? ventas : [];
  clientes = Array.isArray(clientes) ? clientes : [];
  movimientos = Array.isArray(movimientos) ? movimientos : [];

  ventas.forEach(v => {
    if (v.totalPagado === undefined) v.totalPagado = Number(v.total) || 0;
    if (v.saldo === undefined) v.saldo = 0;
    if (!v.estadoPago) v.estadoPago = "pagado";
    if (!Array.isArray(v.cuotas)) v.cuotas = [];
    if (!Array.isArray(v.abonos)) v.abonos = [];
  });

  clientes.forEach(c => {
    if (c.ultimaCompra === undefined) c.ultimaCompra = null;
    if (c.proximoRecordatorio === undefined) c.proximoRecordatorio = null;
    if (c.ultimaCompraProducto === undefined) c.ultimaCompraProducto = "";
    if (c.recordatorioAtendido === undefined) c.recordatorioAtendido = false;
    if (!Array.isArray(c.perfumes)) c.perfumes = c.perfume ? [c.perfume] : [];
  });
}

function dinero(valor) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(valor) || 0);
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fechaTexto(fecha) {
  if (!fecha) return "Sin fecha";
  return new Date(fecha).toLocaleDateString("es-CO");
}

function fechaHoraTexto(fecha) {
  if (!fecha) return "Sin fecha";
  return new Date(fecha).toLocaleString("es-CO");
}

function hoyEs(fecha) {
  const a = new Date(fecha);
  const b = new Date();
  return a.toDateString() === b.toDateString();
}

function normalizarWhatsapp(numero) {
  let n = String(numero || "").replace(/\D/g, "");
  if (n.startsWith("57")) return n;
  if (n.length === 10 && n.startsWith("3")) return "57" + n;
  return n;
}

function abrirWhatsApp(cliente) {
  if (!cliente) return;
  const numero = normalizarWhatsapp(cliente.whatsapp);
  if (!numero) {
    alert("Este cliente no tiene un número de WhatsApp válido.");
    return;
  }

  const mensaje = `Hola ${cliente.nombre}, ¿cómo estás? Te escribo de CFragancias.`;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
}

function mostrarSeccion(nombre) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  const section = document.getElementById(nombre);
  if (section) section.classList.add("active");

  const btn = document.querySelector(`.nav-btn[data-section="${nombre}"]`);
  if (btn) btn.classList.add("active");

  const titulos = {
    inicio: "Inicio",
    productos: "Productos",
    inventario: "Inventario",
    ventas: "Ventas",
    clientes: "Clientes",
    recordatorios: "Recordatorios",
    finanzas: "Finanzas"
  };

  document.getElementById("pageTitle").textContent = titulos[nombre] || nombre;

  if (nombre === "clientes") {
    renderClientes();
  }

  actualizarTodo();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => mostrarSeccion(btn.dataset.section));
});

/* =========================
   PRODUCTOS
========================= */

document.getElementById("productoImagen").addEventListener("change", e => {
  const archivo = e.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = () => {
    imagenProductoTemporal = lector.result;
    document.getElementById("previewImagen").classList.remove("hidden");
    document.getElementById("previewImagen").innerHTML =
      `<img src="${imagenProductoTemporal}" alt="Vista previa">`;
  };
  lector.readAsDataURL(archivo);
});

document.getElementById("productoForm").addEventListener("submit", async e => {
  e.preventDefault();

  const id = document.getElementById("productoId").value;
  const nombre = document.getElementById("productoNombre").value.trim();
  const marca = document.getElementById("productoMarca").value.trim();
  const categoria = document.getElementById("productoCategoria").value;
  const ml = Number(document.getElementById("productoMl").value) || 0;
  const costo = Number(document.getElementById("productoCosto").value) || 0;
  const precio = Number(document.getElementById("productoPrecio").value) || 0;
  const stock = Number(document.getElementById("productoStock").value) || 0;

  if (!nombre) return alert("Escribe el nombre del producto.");
  if (precio < costo) {
    const continuar = confirm("El precio de venta es menor que el costo. ¿Quieres continuar?");
    if (!continuar) return;
  }

  try {
    if (id) {
      const updateData = { nombre, marca, categoria, ml, costo, precio, stock };
      if (imagenProductoTemporal) updateData.imagen = imagenProductoTemporal;

      await colProductos.doc(String(id)).update(updateData);
      alert("Producto actualizado.");
    } else {
      const nuevoId = String(Date.now());
      await colProductos.doc(nuevoId).set({
        id: nuevoId,
        nombre,
        marca,
        categoria,
        ml,
        costo,
        precio,
        stock,
        imagen: imagenProductoTemporal || ""
      });
      alert("Producto guardado.");
    }
    limpiarFormularioProducto();
  } catch (err) {
    alert("Error al guardar el producto en la nube: " + err.message);
  }
});

document.getElementById("cancelarProducto").addEventListener("click", limpiarFormularioProducto);

function limpiarFormularioProducto() {
  document.getElementById("productoForm").reset();
  document.getElementById("productoId").value = "";
  document.getElementById("tituloProductoForm").textContent = "Agregar producto";
  document.getElementById("cancelarProducto").classList.add("hidden");
  document.getElementById("previewImagen").classList.add("hidden");
  document.getElementById("previewImagen").innerHTML = "";
  imagenProductoTemporal = "";
}

function editarProducto(id) {
  const p = productos.find(x => String(x.id) === String(id));
  if (!p) return;

  document.getElementById("productoId").value = p.id;
  document.getElementById("productoNombre").value = p.nombre;
  document.getElementById("productoMarca").value = p.marca || "";
  document.getElementById("productoCategoria").value = p.categoria || "Hombre";
  document.getElementById("productoMl").value = p.ml || "";
  document.getElementById("productoCosto").value = p.costo || 0;
  document.getElementById("productoPrecio").value = p.precio || 0;
  document.getElementById("productoStock").value = p.stock || 0;

  imagenProductoTemporal = p.imagen || "";

  if (p.imagen) {
    document.getElementById("previewImagen").classList.remove("hidden");
    document.getElementById("previewImagen").innerHTML =
      `<img src="${p.imagen}" alt="Imagen del producto">`;
  }

  document.getElementById("tituloProductoForm").textContent = "Editar producto";
  document.getElementById("cancelarProducto").classList.remove("hidden");
  mostrarSeccion("productos");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function eliminarProducto(id) {
  const ventasDelProducto = ventas.some(v => String(v.productoId) === String(id));
  const mensaje = ventasDelProducto
    ? "Este producto tiene ventas registradas. ¿Seguro que quieres eliminarlo?"
    : "¿Quieres eliminar este producto?";

  if (!confirm(mensaje)) return;

  try {
    await colProductos.doc(String(id)).delete();
  } catch (err) {
    alert("Error al eliminar de Firebase: " + err.message);
  }
}

function renderProductos() {
  const contenedor = document.getElementById("productosGrid");
  const busqueda = document.getElementById("buscarProducto").value.toLowerCase().trim();

  const filtrados = productos.filter(p =>
    `${p.nombre} ${p.marca || ""} ${p.categoria || ""}`.toLowerCase().includes(busqueda)
  );

  if (!filtrados.length) {
    contenedor.innerHTML = `<div class="empty">No hay productos para mostrar.</div>`;
    return;
  }

  contenedor.innerHTML = filtrados.map(p => {
    const ganancia = (Number(p.precio) || 0) - (Number(p.costo) || 0);
    const margen = p.precio ? (ganancia / p.precio) * 100 : 0;

    let estado = "stock-ok";
    let textoEstado = `${p.stock} unidades`;

    if (p.stock <= 0) {
      estado = "stock-empty";
      textoEstado = "Agotado";
    } else if (p.stock <= 3) {
      estado = "stock-low";
      textoEstado = `Solo ${p.stock} unidades`;
    }

    return `
      <article class="product-card">
        <div class="product-image">
          ${p.imagen
        ? `<img src="${p.imagen}" alt="${escaparHTML(p.nombre)}">`
        : `<span class="no-image">Sin imagen</span>`}
        </div>
        <div class="card-body">
          <h3>${escaparHTML(p.nombre)}</h3>
          <div class="muted">${escaparHTML(p.marca || "Sin marca")} · ${escaparHTML(p.categoria || "")} ${p.ml ? `· ${p.ml} ml` : ""}</div>
          <div class="product-price">${dinero(p.precio)}</div>
          <div class="product-meta">
            Costo: ${dinero(p.costo)}<br>
            Ganancia: ${dinero(ganancia)} · Margen: ${margen.toFixed(1)}%<br>
            <span class="${estado}">${textoEstado}</span>
          </div>
          <div class="card-actions">
            <button class="small-btn" onclick="editarProducto('${p.id}')">Editar</button>
            <button class="danger-btn" onclick="eliminarProducto('${p.id}')">Eliminar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

document.getElementById("buscarProducto").addEventListener("input", renderProductos);

/* =========================
   INVENTARIO
========================= */

function cargarSelects() {
  const ventaProducto = document.getElementById("ventaProducto");
  const movProducto = document.getElementById("movProducto");
  const ventaCliente = document.getElementById("ventaCliente");
  const clientePerfumeLista = document.getElementById("clientePerfumeLista");

  const perfumeMarcados = clientePerfumeLista
    ? Array.from(clientePerfumeLista.querySelectorAll("input[type=checkbox]:checked")).map(i => i.value)
    : [];

  if (ventaProducto) {
    ventaProducto.innerHTML = `<option value="">Selecciona un producto</option>` +
      productos.map(p =>
        `<option value="${p.id}">${escaparHTML(p.nombre)} — ${dinero(p.precio)} — Stock: ${p.stock}</option>`
      ).join("");
  }

  if (movProducto) {
    movProducto.innerHTML = `<option value="">Selecciona un producto</option>` +
      productos.map(p =>
        `<option value="${p.id}">${escaparHTML(p.nombre)} — Stock: ${p.stock}</option>`
      ).join("");
  }

  if (ventaCliente) {
    ventaCliente.innerHTML = `<option value="">Sin cliente</option>` +
      clientes.map(c =>
        `<option value="${c.id}">${escaparHTML(c.nombre)}</option>`
      ).join("");
  }

  if (clientePerfumeLista) {
    clientePerfumeLista.innerHTML = productos.length
      ? productos.map(p =>
        `<label class="perfume-check"><input type="checkbox" value="${escaparHTML(p.nombre)}" ${perfumeMarcados.includes(p.nombre) ? "checked" : ""}> ${escaparHTML(p.nombre)}${p.marca ? ` — ${escaparHTML(p.marca)}` : ""}</label>`
      ).join("")
      : `<div class="perfume-vacio">Agrega productos para poder marcarlos aquí.</div>`;
  }
}

async function registrarMovimiento() {
  const productoId = document.getElementById("movProducto").value;
  const tipo = document.getElementById("movTipo").value;
  const cantidad = Number(document.getElementById("movCantidad").value);
  const nota = document.getElementById("movNota").value.trim();

  const producto = productos.find(p => String(p.id) === String(productoId));

  if (!producto) return alert("Selecciona un producto.");
  if (!cantidad || cantidad <= 0) return alert("Escribe una cantidad válida.");

  if (tipo === "salida" && producto.stock < cantidad) {
    return alert("No hay suficiente stock.");
  }

  const nuevoStock = producto.stock + (tipo === "entrada" ? cantidad : -cantidad);

  try {
    const movId = String(Date.now());
    const batch = db.batch();

    batch.update(colProductos.doc(String(producto.id)), { stock: nuevoStock });
    batch.set(colMovimientos.doc(movId), {
      id: movId,
      productoId: String(producto.id),
      producto: producto.nombre,
      tipo,
      cantidad,
      nota,
      fecha: new Date().toISOString()
    });

    await batch.commit();

    document.getElementById("movCantidad").value = 1;
    document.getElementById("movNota").value = "";
  } catch (err) {
    alert("Error al registrar movimiento: " + err.message);
  }
}

function renderInventario() {
  const tbody = document.getElementById("inventarioTabla");

  if (!productos.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">No hay productos.</td></tr>`;
  } else {
    tbody.innerHTML = productos.map(p => {
      let estado = "stock-ok";
      let texto = "Normal";

      if (p.stock <= 0) {
        estado = "stock-empty";
        texto = "Agotado";
      } else if (p.stock <= 3) {
        estado = "stock-low";
        texto = "Stock bajo";
      }

      return `
        <tr>
          <td>${escaparHTML(p.nombre)}</td>
          <td>${p.stock}</td>
          <td class="${estado}">${texto}</td>
          <td>
            <button class="small-btn" onclick="prepararMovimiento('${p.id}', 'entrada')">+ Entrada</button>
            <button class="small-btn" onclick="prepararMovimiento('${p.id}', 'salida')">- Salida</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  const lista = document.getElementById("movimientosLista");

  if (!movimientos.length) {
    lista.innerHTML = `<div class="empty">Todavía no hay movimientos.</div>`;
    return;
  }

  lista.innerHTML = movimientos.slice(0, 30).map(m => `
    <div class="list-item">
      <strong>${m.tipo === "entrada" ? "Entrada" : "Salida"} · ${escaparHTML(m.producto)}</strong>
      <div class="muted">${m.cantidad} unidades · ${fechaHoraTexto(m.fecha)}${m.nota ? ` · ${escaparHTML(m.nota)}` : ""}</div>
    </div>
  `).join("");
}

function prepararMovimiento(productoId, tipo) {
  document.getElementById("movProducto").value = productoId;
  document.getElementById("movTipo").value = tipo;
  document.getElementById("movCantidad").focus();
  window.scrollTo({ top: document.getElementById("movProducto").getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
}

/* =========================
   CLIENTES
========================= */

document.getElementById("clienteForm").addEventListener("submit", async e => {
  e.preventDefault();

  const id = document.getElementById("clienteId").value;
  const nombre = document.getElementById("clienteNombre").value.trim();
  const whatsapp = document.getElementById("clienteWhatsapp").value.trim();
  const notas = document.getElementById("clienteNotas").value.trim();
  const perfumes = Array.from(document.querySelectorAll("#clientePerfumeLista input[type=checkbox]:checked")).map(i => i.value);

  if (!nombre) return alert("Escribe el nombre del cliente.");

  try {
    if (id) {
      await colClientes.doc(String(id)).update({
        nombre,
        whatsapp,
        notas,
        perfumes,
        perfume: perfumes[0] || ""
      });
      alert("Cliente actualizado.");
    } else {
      const nuevoId = String(Date.now());
      await colClientes.doc(nuevoId).set({
        id: nuevoId,
        nombre,
        whatsapp,
        notas,
        perfumes,
        perfume: perfumes[0] || "",
        ultimaCompra: null,
        proximoRecordatorio: null,
        ultimaCompraProducto: "",
        recordatorioAtendido: false
      });
      alert("Cliente guardado.");
    }
    limpiarFormularioCliente();
  } catch (err) {
    alert("Error al guardar cliente: " + err.message);
  }
});

document.getElementById("cancelarCliente").addEventListener("click", limpiarFormularioCliente);

function limpiarFormularioCliente() {
  document.getElementById("clienteForm").reset();
  document.querySelectorAll("#clientePerfumeLista input[type=checkbox]:checked").forEach(box => { box.checked = false; });
  document.getElementById("clienteId").value = "";
  document.getElementById("tituloClienteForm").textContent = "Agregar cliente";
  document.getElementById("cancelarCliente").classList.add("hidden");
}

function editarCliente(id) {
  const c = clientes.find(x => String(x.id) === String(id));
  if (!c) return;

  document.getElementById("clienteId").value = c.id;
  document.getElementById("clienteNombre").value = c.nombre;
  document.getElementById("clienteWhatsapp").value = c.whatsapp || "";
  document.getElementById("clienteNotas").value = c.notas || "";
  document.querySelectorAll("#clientePerfumeLista input[type=checkbox]").forEach(box => {
    box.checked = (c.perfumes || (c.perfume ? [c.perfume] : [])).includes(box.value);
  });

  document.getElementById("tituloClienteForm").textContent = "Editar cliente";
  document.getElementById("cancelarCliente").classList.remove("hidden");

  mostrarSeccion("clientes");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function eliminarCliente(id) {
  if (!confirm("¿Quieres eliminar este cliente? Sus ventas históricas se conservarán.")) return;

  try {
    await colClientes.doc(String(id)).delete();
  } catch (err) {
    alert("Error al eliminar cliente: " + err.message);
  }
}

function obtenerVentasCliente(clienteId) {
  return ventas.filter(v => String(v.clienteId) === String(clienteId));
}

function renderClientes() {
  const contenedor = document.getElementById("clientesGrid");
  const busqueda = document.getElementById("buscarCliente").value.toLowerCase().trim();

  const filtrados = clientes.filter(c =>
    `${c.nombre} ${c.whatsapp || ""}`.toLowerCase().includes(busqueda)
  );

  if (!filtrados.length) {
    contenedor.innerHTML = `<div class="empty">No hay clientes para mostrar.</div>`;
    return;
  }

  contenedor.innerHTML = filtrados.map(c => {
    const ventasCliente = obtenerVentasCliente(c.id);
    const total = ventasCliente.reduce((s, v) => s + Number(v.total || 0), 0);
    const pagado = ventasCliente.reduce((s, v) => s + Number(v.totalPagado || 0), 0);
    const deuda = ventasCliente.reduce((s, v) => s + Number(v.saldo || 0), 0);

    return `
      <article class="customer-card">
        <div class="card-body">
          <h3>${escaparHTML(c.nombre)}</h3>
          <div class="customer-meta">
            WhatsApp: ${escaparHTML(c.whatsapp || "No registrado")}<br>
            ${(() => {
        const perfumesCliente = Array.isArray(c.perfumes) ? c.perfumes : (c.perfume ? [c.perfume] : []);
        return perfumesCliente.length ? `Perfumes: <strong>${escaparHTML(perfumesCliente.join(", "))}</strong><br>` : "";
      })()}
            Compras: ${ventasCliente.length}<br>
            Total comprado: ${dinero(total)}<br>
            Pagado: ${dinero(pagado)}<br>
            <strong class="${deuda > 0 ? "stock-low" : "stock-ok"}">Debe: ${dinero(deuda)}</strong>
          </div>

          <div class="card-actions">
            <button class="small-btn" onclick="verCuentaCliente('${c.id}')">Ver cuenta</button>
            ${c.whatsapp ? `<button class="small-btn" onclick="abrirWhatsApp(clientes.find(x => String(x.id) === '${c.id}'))">WhatsApp</button>` : ""}
            <button class="small-btn" onclick="editarCliente('${c.id}')">Editar</button>
            <button class="danger-btn" onclick="eliminarCliente('${c.id}')">Eliminar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

document.getElementById("buscarCliente").addEventListener("input", renderClientes);

function verCuentaCliente(id) {
  clienteCuentaAbierta = id;
  const cliente = clientes.find(c => String(c.id) === String(id));
  if (!cliente) return;

  const ventasCliente = obtenerVentasCliente(id);
  const total = ventasCliente.reduce((s, v) => s + Number(v.total || 0), 0);
  const pagado = ventasCliente.reduce((s, v) => s + Number(v.totalPagado || 0), 0);
  const deuda = ventasCliente.reduce((s, v) => s + Number(v.saldo || 0), 0);

  const panel = document.getElementById("cuentaCliente");
  panel.classList.remove("hidden");

  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Cuenta de ${escaparHTML(cliente.nombre)}</h2>
        <p>${escaparHTML(cliente.whatsapp || "Sin WhatsApp")}</p>
      </div>
      <div class="card-actions">
        ${cliente.whatsapp ? `<button class="small-btn" onclick="abrirWhatsApp(clientes.find(x => String(x.id) === '${cliente.id}'))">WhatsApp</button>` : ""}
        <button class="ghost-btn" onclick="cerrarCuentaCliente()">Cerrar</button>
      </div>
    </div>

    <div class="account-summary">
      <div><span>Compras</span><strong>${ventasCliente.length}</strong></div>
      <div><span>Total comprado</span><strong>${dinero(total)}</strong></div>
      <div><span>Total pagado</span><strong>${dinero(pagado)}</strong></div>
      <div><span>Debe</span><strong class="${deuda > 0 ? "stock-low" : "stock-ok"}">${dinero(deuda)}</strong></div>
    </div>

    ${ventasCliente.length ? ventasCliente.map(v => renderVentaCuenta(v)).join("") :
      `<div class="empty">Este cliente todavía no tiene ventas.</div>`}
  `;

  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarCuentaCliente() {
  clienteCuentaAbierta = null;
  document.getElementById("cuentaCliente").classList.add("hidden");
  document.getElementById("cuentaCliente").innerHTML = "";
}

function renderVentaCuenta(v) {
  const cuotasHTML = Array.isArray(v.cuotas) && v.cuotas.length
    ? `
      <div class="installments">
        ${v.cuotas.map(c => `
          <div class="installment ${c.pagada ? "paid" : ""}">
            <div>
              <strong>Cuota ${c.numero}</strong><br>
              <span class="muted">${dinero(c.monto)} ·${c.pagada ? `Pagada ${fechaTexto(c.fechaPago)}` : "Pendiente"}</span>
            </div>
            ${!c.pagada && v.saldo > 0
        ? `<button class="small-btn" onclick="pagarCuota('${v.id}', ${c.numero})">Pagar cuota</button>`
        : ""}
          </div>
        `).join("")}
      </div>
    `
    : "";

  const abonosHTML = v.abonos && v.abonos.length
    ? `
      <div class="list" style="margin-top:12px">
        ${v.abonos.slice().reverse().map(a => `
          <div class="list-item">
            <strong>Abono: ${dinero(a.monto)}</strong>
            <div class="muted">${fechaHoraTexto(a.fecha)}${a.cuota ? ` · Cuota ${a.cuota}` : ""}</div>
          </div>
        `).join("")}
      </div>
    `
    : "";

  return `
    <div class="account-sale">
      <div class="sale-top">
        <div>
          <div class="sale-title">${escaparHTML(v.producto)} × ${v.cantidad}</div>
          <div class="sale-date">${fechaHoraTexto(v.fecha)}</div>
        </div>
        ${estadoPagoHTML(v)}
      </div>

      <div class="sale-grid">
        <div><span>Total</span><strong>${dinero(v.total)}</strong></div>
        <div><span>Pagado</span><strong>${dinero(v.totalPagado)}</strong></div>
        <div><span>Saldo</span><strong>${dinero(v.saldo)}</strong></div>
        <div><span>Ganancia</span><strong>${dinero(v.ganancia)}</strong></div>
      </div>

      ${v.saldo > 0 ? `
        <div class="card-actions">
          <button class="small-btn" onclick="registrarAbono('${v.id}')">+ Registrar abono</button>
        </div>
      ` : ""}

      ${cuotasHTML}
      ${abonosHTML}
    </div>
  `;
}

/* =========================
   VENTAS Y PAGOS
========================= */

document.getElementById("ventaProducto").addEventListener("change", actualizarResumenVenta);
document.getElementById("ventaCantidad").addEventListener("input", actualizarResumenVenta);
document.getElementById("ventaEstadoPago").addEventListener("change", cambiarFormaPago);
document.getElementById("ventaPrecioFinal").addEventListener("input", actualizarResumenVenta);
document.getElementById("ventaAbonoInicial").addEventListener("input", actualizarResumenVenta);
document.getElementById("ventaCuotaInicial").addEventListener("input", actualizarResumenVenta);
document.getElementById("ventaNumeroCuotas").addEventListener("input", actualizarResumenVenta);

function cambiarFormaPago() {
  const estado = document.getElementById("ventaEstadoPago").value;

  document.getElementById("opcionesAbono").classList.toggle("hidden", estado !== "abono");
  document.getElementById("opcionesCuotas").classList.toggle("hidden", estado !== "cuotas");

  actualizarResumenVenta();
}

function obtenerDatosFormularioPago(total) {
  const estado = document.getElementById("ventaEstadoPago").value;

  let totalPagado = 0;
  let numeroCuotas = 0;

  if (estado === "pagado") {
    totalPagado = total;
  }

  if (estado === "abono") {
    totalPagado = Number(document.getElementById("ventaAbonoInicial").value) || 0;
  }

  if (estado === "cuotas") {
    totalPagado = Number(document.getElementById("ventaCuotaInicial").value) || 0;
    numeroCuotas = Number(document.getElementById("ventaNumeroCuotas").value) || 0;
  }

  totalPagado = Math.max(0, Math.min(totalPagado, total));

  if (estado === "pendiente") {
    totalPagado = 0;
  }

  const saldo = Math.max(0, total - totalPagado);

  return { estado, totalPagado, saldo, numeroCuotas };
}

function obtenerTotalVenta() {
  const productoId = document.getElementById("ventaProducto").value;
  const cantidad = Number(document.getElementById("ventaCantidad").value) || 0;
  const producto = productos.find(p => String(p.id) === String(productoId));

  if (!producto) return 0;

  const totalNormal = (Number(producto.precio) || 0) * cantidad;
  const precioFinal = Number(document.getElementById("ventaPrecioFinal").value) || 0;

  if (precioFinal > 0) return precioFinal;
  return totalNormal;
}

function actualizarResumenVenta() {
  const total = obtenerTotalVenta();
  const datos = obtenerDatosFormularioPago(total);

  document.getElementById("ventaTotal").textContent = dinero(total);
  document.getElementById("ventaPagado").textContent = dinero(datos.totalPagado);
  document.getElementById("ventaSaldo").textContent = dinero(datos.saldo);
}

async function registrarVenta() {
  const productoId = document.getElementById("ventaProducto").value;
  const cantidad = Number(document.getElementById("ventaCantidad").value);
  const clienteIdValor = document.getElementById("ventaCliente").value;
  const producto = productos.find(p => String(p.id) === String(productoId));
  const cliente = clienteIdValor ? clientes.find(c => String(c.id) === String(clienteIdValor)) : null;

  if (!producto) return alert("Selecciona un producto.");
  if (!cantidad || cantidad <= 0) return alert("La cantidad debe ser mayor que cero.");
  if (producto.stock < cantidad) return alert(`Solo tienes ${producto.stock} unidades disponibles.`);

  const total = obtenerTotalVenta();
  const pago = obtenerDatosFormularioPago(total);

  if (!total || total <= 0) {
    return alert("Indica en cuánto dinero se lo deja (o el precio del producto).");
  }

  if (pago.totalPagado > total) {
    return alert("El valor pagado no puede superar el total.");
  }

  if (pago.estado === "cuotas" && pago.saldo > 0 && pago.numeroCuotas < 1) {
    return alert("Indica cuántas cuotas tendrá el saldo.");
  }

  const nuevoStock = producto.stock - cantidad;
  let estadoPagoFinal = pago.saldo === 0 ? "pagado" : pago.estado;

  const ventaId = String(Date.now());
  const venta = {
    id: ventaId,
    productoId: String(producto.id),
    producto: producto.nombre,
    cantidad,
    clienteId: cliente ? String(cliente.id) : null,
    cliente: cliente ? cliente.nombre : "Sin cliente",
    total,
    costo: (Number(producto.costo) || 0) * cantidad,
    ganancia: total - ((Number(producto.costo) || 0) * cantidad),
    fecha: new Date().toISOString(),
    estadoPago: estadoPagoFinal,
    totalPagado: pago.totalPagado,
    saldo: pago.saldo,
    numeroCuotas: pago.numeroCuotas,
    cuotas: [],
    abonos: []
  };

  if (pago.totalPagado > 0) {
    venta.abonos.push({
      id: Date.now() + 1,
      monto: pago.totalPagado,
      fecha: new Date().toISOString(),
      cuota: null
    });
  }

  if (pago.estado === "cuotas" && pago.saldo > 0) {
    venta.cuotas = generarCuotas(pago.saldo, pago.numeroCuotas);
  }

  try {
    const batch = db.batch();

    // 1. Guardar la venta
    batch.set(colVentas.doc(ventaId), venta);

    // 2. Descontar stock
    batch.update(colProductos.doc(String(producto.id)), { stock: nuevoStock });

    // 3. Crear movimiento de inventario
    const movId = String(Date.now() + 2);
    batch.set(colMovimientos.doc(movId), {
      id: movId,
      productoId: String(producto.id),
      producto: producto.nombre,
      tipo: "salida",
      cantidad,
      nota: `Venta${cliente ? ` a ${cliente.nombre}` : ""}`,
      fecha: new Date().toISOString()
    });

    // 4. Actualizar recordatorio de cliente
    if (cliente) {
      batch.update(colClientes.doc(String(cliente.id)), {
        ultimaCompra: venta.fecha,
        ultimaCompraProducto: producto.nombre,
        proximoRecordatorio: sumarDias(venta.fecha, DIAS_RECORDATORIO),
        recordatorioAtendido: false
      });
    }

    await batch.commit();

    limpiarFormularioVenta();
    alert(pago.saldo > 0
      ? `Venta registrada. Quedan ${dinero(pago.saldo)} por cobrar.`
      : "Venta registrada y pagada completamente.");
  } catch (err) {
    alert("Error al registrar venta en Firebase: " + err.message);
  }
}

function generarCuotas(saldo, cantidad) {
  const n = Math.max(1, Math.floor(cantidad));
  const base = Math.floor(saldo / n);
  const resto = saldo - base * n;

  return Array.from({ length: n }, (_, index) => ({
    numero: index + 1,
    monto: base + (index < resto ? 1 : 0),
    pagada: false,
    fechaPago: null
  }));
}

function limpiarFormularioVenta() {
  document.getElementById("ventaProducto").value = "";
  document.getElementById("ventaCantidad").value = 1;
  document.getElementById("ventaCliente").value = "";
  document.getElementById("ventaEstadoPago").value = "pagado";
  document.getElementById("ventaPrecioFinal").value = "";
  document.getElementById("ventaAbonoInicial").value = 0;
  document.getElementById("ventaCuotaInicial").value = 0;
  document.getElementById("ventaNumeroCuotas").value = 2;
  cambiarFormaPago();
  actualizarResumenVenta();
}

function estadoPagoHTML(v) {
  const mapa = {
    pagado: ["Pagado", "status-paid"],
    abono: ["Abono", "status-abono"],
    cuotas: ["A cuotas", "status-installments"],
    pendiente: ["Pendiente", "status-pending"]
  };

  const [texto, clase] = mapa[v.estadoPago] || ["Pendiente", "status-pending"];
  return `<span class="payment-status ${clase}">${texto}</span>`;
}

function renderVentas() {
  const contenedor = document.getElementById("ventasLista");

  if (!ventas.length) {
    contenedor.innerHTML = `<div class="empty">Todavía no hay ventas.</div>`;
    return;
  }

  contenedor.innerHTML = ventas.map(v => `
    <article class="sale-card">
      <div class="sale-top">
        <div>
          <div class="sale-title">${escaparHTML(v.producto)} × ${v.cantidad}</div>
          <div class="sale-date">${fechaHoraTexto(v.fecha)} · ${escaparHTML(v.cliente || "Sin cliente")}</div>
        </div>
        ${estadoPagoHTML(v)}
      </div>

      <div class="sale-grid">
        <div><span>Total</span><strong>${dinero(v.total)}</strong></div>
        <div><span>Pagado</span><strong>${dinero(v.totalPagado)}</strong></div>
        <div><span>Saldo</span><strong class="${v.saldo > 0 ? "stock-low" : "stock-ok"}">${dinero(v.saldo)}</strong></div>
        <div><span>Ganancia</span><strong>${dinero(v.ganancia)}</strong></div>
      </div>

      ${v.saldo > 0 ? `
        <div class="card-actions">
          <button class="small-btn" onclick="registrarAbono('${v.id}')">+ Registrar abono</button>
        </div>
      ` : ""}

      ${Array.isArray(v.cuotas) && v.cuotas.length ? `
        <div class="installments">
          ${v.cuotas.map(c => `
            <div class="installment ${c.pagada ? "paid" : ""}">
              <div>
                <strong>Cuota ${c.numero}</strong><br>
                <span class="muted">${dinero(c.monto)} · ${c.pagada ? `Pagada ${fechaTexto(c.fechaPago)}` : "Pendiente"}</span>
              </div>
              ${!c.pagada && v.saldo > 0
      ? `<button class="small-btn" onclick="pagarCuota('${v.id}',${c.numero})">Pagar cuota</button>`
      : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${v.abonos && v.abonos.length ? `
        <div class="list" style="margin-top:13px">
          ${v.abonos.slice().reverse().map(a => `
            <div class="list-item">
              <strong>Abono registrado: ${dinero(a.monto)}</strong>
              <div class="muted">${fechaHoraTexto(a.fecha)}${a.cuota ? ` · Cuota ${a.cuota}` : ""}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </article>
  `).join("");
}

async function registrarAbono(ventaId) {
  const venta = ventas.find(v => String(v.id) === String(ventaId));
  if (!venta || venta.saldo <= 0) return;

  const valorTexto = prompt(`Saldo pendiente: ${dinero(venta.saldo)}\n¿Cuánto abonó?`);
  if (valorTexto === null) return;

  const monto = Number(valorTexto.replace(/[^\d]/g, ""));
  if (!Number.isFinite(monto) || monto <= 0) {
    return alert("Escribe un valor de abono válido.");
  }

  if (monto > venta.saldo) {
    return alert("El abono no puede ser mayor que el saldo pendiente.");
  }

  const nuevoTotalPagado = (Number(venta.totalPagado) || 0) + monto;
  const nuevoSaldo = Math.max(0, (Number(venta.saldo) || 0) - monto);
  const nuevosAbonos = Array.isArray(venta.abonos) ? [...venta.abonos] : [];

  nuevosAbonos.push({
    id: Date.now(),
    monto,
    fecha: new Date().toISOString(),
    cuota: null
  });

  let nuevoEstado = "abono";
  if (nuevoSaldo <= 0) {
    nuevoEstado = "pagado";
  } else if (Array.isArray(venta.cuotas) && venta.cuotas.length) {
    nuevoEstado = "cuotas";
  }

  try {
    await colVentas.doc(String(venta.id)).update({
      totalPagado: nuevoTotalPagado,
      saldo: nuevoSaldo,
      estadoPago: nuevoEstado,
      abonos: nuevosAbonos
    });
    alert("Abono registrado.");
  } catch (err) {
    alert("Error al guardar abono: " + err.message);
  }
}

async function pagarCuota(ventaId, numeroCuota) {
  const venta = ventas.find(v => String(v.id) === String(ventaId));
  if (!venta) return;

  const cuotas = Array.isArray(venta.cuotas) ? [...venta.cuotas] : [];
  const cuota = cuotas.find(c => c.numero === numeroCuota);
  if (!cuota || cuota.pagada) return;

  if (cuota.monto > venta.saldo) {
    return alert("La cuota supera el saldo pendiente. Registra primero un abono.");
  }

  cuota.pagada = true;
  cuota.fechaPago = new Date().toISOString();

  const nuevoTotalPagado = (Number(venta.totalPagado) || 0) + cuota.monto;
  const nuevoSaldo = Math.max(0, (Number(venta.saldo) || 0) - cuota.monto);
  const nuevosAbonos = Array.isArray(venta.abonos) ? [...venta.abonos] : [];

  nuevosAbonos.push({
    id: Date.now(),
    monto: cuota.monto,
    fecha: new Date().toISOString(),
    cuota: numeroCuota
  });

  const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "cuotas";

  try {
    await colVentas.doc(String(venta.id)).update({
      totalPagado: nuevoTotalPagado,
      saldo: nuevoSaldo,
      estadoPago: nuevoEstado,
      cuotas,
      abonos: nuevosAbonos
    });
    alert(`Cuota ${numeroCuota} registrada como pagada.`);
  } catch (err) {
    alert("Error al registrar cuota: " + err.message);
  }
}

/* =========================
   RECORDATORIOS
========================= */

function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

function renderRecordatorios() {
  const contenedor = document.getElementById("recordatoriosLista");

  const pendientes = clientes
    .filter(c => c.proximoRecordatorio && !c.recordatorioAtendido)
    .sort((a, b) => new Date(a.proximoRecordatorio) - new Date(b.proximoRecordatorio));

  if (!pendientes.length) {
    contenedor.innerHTML = `<div class="empty">No hay recordatorios pendientes.</div>`;
    return;
  }

  contenedor.innerHTML = pendientes.map(c => {
    const dias = Math.ceil((new Date(c.proximoRecordatorio) - new Date()) / 86400000);
    const atrasado = dias < 0;

    return `
      <article class="reminder-card">
        <div class="card-body">
          <h3>${escaparHTML(c.nombre)}</h3>
          <div class="customer-meta">
            Última compra: ${fechaTexto(c.ultimaCompra)}<br>
            Producto: ${escaparHTML(c.ultimaCompraProducto || "No registrado")}<br>
            ${atrasado ? `Atrasado ${Math.abs(dias)} días` : `En ${dias} días`}
          </div>

          <div class="card-actions">
            ${c.whatsapp ? `<button class="small-btn" onclick="abrirWhatsApp(clientes.find(x => String(x.id) === '${c.id}'))">Contactar</button>` : ""}
            <button class="small-btn" onclick="marcarRecordatorio('${c.id}')">Marcar atendido</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function marcarRecordatorio(clienteId) {
  try {
    await colClientes.doc(String(clienteId)).update({ recordatorioAtendido: true });
  } catch (err) {
    alert("Error al actualizar recordatorio: " + err.message);
  }
}

async function reactivarRecordatorio(clienteId) {
  try {
    await colClientes.doc(String(clienteId)).update({
      recordatorioAtendido: false,
      proximoRecordatorio: new Date().toISOString()
    });
  } catch (err) {
    alert("Error al reactivar recordatorio: " + err.message);
  }
}

/* =========================
   DASHBOARD
========================= */

function renderDashboard() {
  const ventasHoy = ventas.filter(v => hoyEs(v.fecha));

  const totalHoy = ventasHoy.reduce((s, v) => s + Number(v.total || 0), 0);
  const gananciaHoy = ventasHoy.reduce((s, v) => s + Number(v.ganancia || 0), 0);
  const porCobrar = ventas.reduce((s, v) => s + Number(v.saldo || 0), 0);
  const stockTotal = productos.reduce((s, p) => s + Number(p.stock || 0), 0);

  document.getElementById("ventasHoy").textContent = dinero(totalHoy);
  document.getElementById("gananciaHoy").textContent = dinero(gananciaHoy);
  document.getElementById("dineroPorCobrar").textContent = dinero(porCobrar);
  document.getElementById("cantidadProductos").textContent = productos.length;
  document.getElementById("stockTotal").textContent = stockTotal;
  document.getElementById("cantidadClientes").textContent = clientes.length;

  const recordatorios = clientes
    .filter(c => c.proximoRecordatorio && !c.recordatorioAtendido)
    .sort((a, b) => new Date(a.proximoRecordatorio) - new Date(b.proximoRecordatorio))
    .slice(0, 5);

  const rec = document.getElementById("dashboardRecordatorios");

  rec.innerHTML = recordatorios.length
    ? recordatorios.map(c => `
        <div class="list-item">
          <strong>${escaparHTML(c.nombre)}</strong>
          <div class="muted">
            ${escaparHTML(c.ultimaCompraProducto || "Sin producto")} · ${fechaTexto(c.proximoRecordatorio)}
          </div>
        </div>
      `).join("")
    : `<div class="empty">No hay clientes pendientes.</div>`;

  const recientes = document.getElementById("ventasRecientes");

  recientes.innerHTML = ventas.length
    ? ventas.slice(0, 5).map(v => `
        <div class="list-item">
          <strong>${escaparHTML(v.producto)} × ${v.cantidad}</strong>
          <div class="muted">
            ${escaparHTML(v.cliente || "Sin cliente")} · ${dinero(v.total)}
            · ${v.saldo > 0 ? `Debe ${dinero(v.saldo)}` : "Pagado"}
          </div>
        </div>
      `).join("")
    : `<div class="empty">No hay ventas todavía.</div>`;
}

/* =========================
   FINANZAS
========================= */

function renderFinanzas() {
  const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
  const recibido = ventas.reduce((s, v) => s + Number(v.totalPagado || 0), 0);
  const pendiente = ventas.reduce((s, v) => s + Number(v.saldo || 0), 0);
  const ganancia = ventas.reduce((s, v) => s + Number(v.ganancia || 0), 0);

  const gananciaRecibida = ventas.reduce((s, v) => {
    const t = Number(v.total || 0);
    if (t <= 0) return s;
    return s + Number(v.ganancia || 0) * (Number(v.totalPagado || 0) / t);
  }, 0);

  const gananciaPendiente = ganancia - gananciaRecibida;
  const unidades = ventas.reduce((s, v) => s + Number(v.cantidad || 0), 0);
  const margen = totalVentas ? (ganancia / totalVentas) * 100 : 0;

  document.getElementById("finTotalVentas").textContent = dinero(totalVentas);
  document.getElementById("finRecibido").textContent = dinero(recibido);
  document.getElementById("finPendiente").textContent = dinero(pendiente);
  document.getElementById("finGanancia").textContent = dinero(ganancia);
  document.getElementById("finGananciaRecibida").textContent = dinero(gananciaRecibida);
  document.getElementById("finGananciaPendiente").textContent = dinero(gananciaPendiente);
  document.getElementById("finUnidades").textContent = unidades;
  document.getElementById("finMargen").textContent = `${margen.toFixed(1)}%`;

  document.getElementById("finanzasDetalle").innerHTML = `
    <div class="finance-line">
      <span>Valor total de todas las ventas</span>
      <strong>${dinero(totalVentas)}</strong>
    </div>
    <div class="finance-line">
      <span>Dinero que ya recibiste</span>
      <strong>${dinero(recibido)}</strong>
    </div>
    <div class="finance-line">
      <span>Dinero que todavía te deben</span>
      <strong class="${pendiente > 0 ? "stock-low" : "stock-ok"}">${dinero(pendiente)}</strong>
    </div>
    <div class="finance-line">
      <span>Ganancia registrada</span>
      <strong>${dinero(ganancia)}</strong>
    </div>
    <div class="finance-line">
      <span>Ganancia de lo que ya te pagaron</span>
      <strong class="stock-ok">${dinero(gananciaRecibida)}</strong>
    </div>
    <div class="finance-line">
      <span>Ganancia de lo que todavía te deben</span>
      <strong class="${gananciaPendiente > 0 ? "stock-low" : "stock-ok"}">${dinero(gananciaPendiente)}</strong>
    </div>
  `;
}

/* =========================
   ACTUALIZACIÓN GENERAL
========================= */

function actualizarTodo() {
  cargarSelects();
  renderProductos();
  renderInventario();
  renderVentas();
  renderClientes();
  renderRecordatorios();
  renderFinanzas();
  renderDashboard();

  if (clienteCuentaAbierta) {
    verCuentaCliente(clienteCuentaAbierta);
  }

  actualizarResumenVenta();
}

cambiarFormaPago();