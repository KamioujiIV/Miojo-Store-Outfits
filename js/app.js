(() => {
  const PAGE = 120;

  // Categorias pelo prefixo do nome do modelo
  const CATEGORIAS = [
    ["A_C_", "Animais"],
    ["MP_A_C_", "Animais (MP)"],
    ["A_M_", "Ambiente (masc.)"],
    ["A_F_", "Ambiente (fem.)"],
    ["G_M_", "Gangues"],
    ["G_F_", "Gangues"],
    ["S_M_", "Story (masc.)"],
    ["S_F_", "Story (fem.)"],
    ["U_M_", "Únicos (masc.)"],
    ["U_F_", "Únicos (fem.)"],
    ["CS_", "Cutscene"],
    ["RE_", "Eventos aleatórios"],
    ["MP_", "Multiplayer"],
    ["PLAYER", "Player"],
  ];
  const categoriaDe = (model) => {
    let best = null;
    for (const [p, nome] of CATEGORIAS)
      if (model.toUpperCase().startsWith(p) && (!best || p.length > best[0].length)) best = [p, nome];
    return best ? best[1] : "Outros";
  };

  // Formato: MODELO-INDICE[-NOME_OUTFIT].jpg
  const itens = (window.IMAGENS || []).map((file) => {
    const base = file.replace(/\.[^.]+$/, "");
    const parts = base.split("-");
    const model = parts[0];
    const outfit = parts[1] ?? "";
    const nome = parts.slice(2).join("-");
    return {
      file, model, outfit, nome,
      cat: categoriaDe(model),
      busca: base.toLowerCase(),
    };
  });

  const $ = (id) => document.getElementById(id);
  const container = $("container");
  const sentinel = $("sentinel");
  const busca = $("busca");
  const selCat = $("categoria");
  const selOrdem = $("ordem");
  const tamanho = $("tamanho");

  const modelos = new Set(itens.map((i) => i.model));
  $("total").textContent = `${itens.length.toLocaleString("pt-BR")} imagens · ${modelos.size.toLocaleString("pt-BR")} modelos`;

  // Preenche filtro de categorias com contagem
  const contagem = {};
  itens.forEach((i) => (contagem[i.cat] = (contagem[i.cat] || 0) + 1));
  selCat.innerHTML =
    `<option value="">Todas as categorias</option>` +
    Object.keys(contagem).sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((c) => `<option value="${c}">${c} (${contagem[c]})</option>`).join("");

  // Preferências salvas
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { } };
  let modo = pref("outfits.modo") || "grade";
  tamanho.value = pref("outfits.tamanho") || 300;
  document.documentElement.style.setProperty("--thumb", tamanho.value + "px");

  let filtrados = [];
  let renderizados = 0;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const src = (i) => "img/" + encodeURIComponent(i.file);
  // Miniatura leve gerada por js/gerar-miniaturas.js (se faltar, o onerror volta para a original)
  const thumb = (i) => "thumbs/" + encodeURIComponent(i.file.replace(/\.[^.]+$/, ".webp"));
  const imgThumb = (i) =>
    `<img loading="lazy" decoding="async" src="${thumb(i)}" data-orig="${src(i)}" onerror="if(this.dataset.orig){this.src=this.dataset.orig;this.dataset.orig=''}" alt="">`;

  function filtrar() {
    const termos = busca.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cat = selCat.value;
    filtrados = itens.filter((i) =>
      (!cat || i.cat === cat) && termos.every((t) => i.busca.includes(t))
    );
    if (selOrdem.value === "nome-desc") filtrados.reverse();
    renderizados = 0;
    container.innerHTML = "";
    $("info").textContent = filtrados.length === itens.length
      ? `Mostrando todas as ${itens.length.toLocaleString("pt-BR")} imagens`
      : `${filtrados.length.toLocaleString("pt-BR")} resultado(s)`;
    if (!filtrados.length) container.innerHTML = `<div class="empty">Nenhuma imagem encontrada.</div>`;
    maisItens();
    salvarUrl();
  }

  // Troca o filtro e rola animado de volta ao começo dos resultados (logo abaixo do banner)
  let animTopo = 0;
  function filtrarEIrParaTopo() {
    const main = document.querySelector("main");
    const inicio = scrollY;
    // Segura a altura da página: a lista nova pode ser menor e o navegador "pularia" a rolagem
    main.style.minHeight = main.offsetHeight + "px";
    filtrar();
    const alvo = main.getBoundingClientRect().top + scrollY
      - document.querySelector("header").offsetHeight - $("info").offsetHeight - 10;
    if (inicio <= alvo) { main.style.minHeight = ""; return; }

    const dist = inicio - alvo;
    const duracao = Math.min(900, 350 + dist / 12); // mais longe, um pouco mais demorado
    const t0 = performance.now();
    const suave = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const id = ++animTopo;
    const passo = (agora) => {
      if (id !== animTopo) return; // outra troca começou uma nova animação
      const k = Math.min(1, (agora - t0) / duracao);
      scrollTo({ top: inicio - dist * suave(k), behavior: "instant" });
      if (k < 1) requestAnimationFrame(passo);
      else main.style.minHeight = "";
    };
    requestAnimationFrame(passo);
    // Garantia: se a animação não terminar a tempo (aba em segundo plano etc.), finaliza direto
    setTimeout(() => {
      if (id !== animTopo || !main.style.minHeight) return;
      animTopo++;
      scrollTo({ top: alvo, behavior: "instant" });
      main.style.minHeight = "";
    }, duracao + 400);
  }
  // Se o usuário rolar durante a animação, ela para e a página fica onde ele deixou
  const pararAnimTopo = () => { if (document.querySelector("main").style.minHeight) { animTopo++; document.querySelector("main").style.minHeight = ""; } };
  addEventListener("wheel", pararAnimTopo, { passive: true });
  addEventListener("touchstart", pararAnimTopo, { passive: true });

  // ---------- Estado na URL (#...) para o F5 voltar ao mesmo lugar ----------
  // Ex.: index.html#img=CS_DUTCH-0-META_OUTFIT_COLD_WEATHER.jpg&parte=cabeca&cat=Cutscene
  function salvarUrl() {
    const p = new URLSearchParams();
    if (busca.value.trim()) p.set("q", busca.value.trim());
    if (selCat.value) p.set("cat", selCat.value);
    if (selOrdem.value !== "nome") p.set("ordem", selOrdem.value);
    if (atual >= 0 && filtrados[atual]) {
      p.set("img", filtrados[atual].file);
      if (verFull) p.set("full", "1");
      else if (parteSel) p.set("parte", parteSel);
    }
    const hash = p.toString();
    history.replaceState(null, "", hash ? "#" + hash : location.pathname + location.search);
  }

  function htmlItem(i, idx) {
    const nome = i.nome ? esc(i.nome) : "—";
    if (modo === "grade") {
      return `<div class="card" data-idx="${idx}" title="${esc(i.file)}">
        <div class="ph">${imgThumb(i)}</div>
        <div class="meta"><div class="model">${esc(i.model)}</div>
        <div class="sub">Outfit ${esc(i.outfit)}${i.nome ? " · " + nome : ""}</div></div></div>`;
    }
    return `<div class="row" data-idx="${idx}">
      <div class="ph">${imgThumb(i)}</div>
      <div>
        <div class="model">${esc(i.model)} <span class="tag">${esc(i.cat)}</span></div>
        <div class="cols sub">
          <span><b>Outfit:</b>${esc(i.outfit)}</span>
          <span><b>Nome:</b>${nome}</span>
          <span><b>Arquivo:</b>${esc(i.file)}</span>
        </div>
      </div>
      <div class="acoes">
        <button class="btn" data-copy-model="${idx}">Copiar modelo</button>
        <button class="btn destaque" data-full="${idx}">Ver Outfit Full</button>
      </div>
    </div>`;
  }

  function maisItens() {
    if (renderizados >= filtrados.length) return;
    const fim = Math.min(renderizados + PAGE, filtrados.length);
    let html = "";
    for (let k = renderizados; k < fim; k++) html += htmlItem(filtrados[k], k);
    container.insertAdjacentHTML("beforeend", html);
    renderizados = fim;
    // Se a página ainda não encheu a tela, carrega mais
    requestAnimationFrame(() => {
      if (sentinel.getBoundingClientRect().top < innerHeight + 800) maisItens();
    });
  }

  new IntersectionObserver((e) => { if (e[0].isIntersecting) maisItens(); }, { rootMargin: "800px" })
    .observe(sentinel);

  function aplicarModo() {
    container.className = modo === "grade" ? "grid" : "list";
    $("btn-grade").classList.toggle("active", modo === "grade");
    $("btn-lista").classList.toggle("active", modo === "lista");
    $("tamanho").parentElement.style.visibility = modo === "grade" ? "" : "hidden";
    pref("outfits.modo", modo);
    filtrar();
  }
  $("btn-grade").onclick = () => { modo = "grade"; aplicarModo(); };
  $("btn-lista").onclick = () => { modo = "lista"; aplicarModo(); };

  tamanho.oninput = () => {
    document.documentElement.style.setProperty("--thumb", tamanho.value + "px");
    pref("outfits.tamanho", tamanho.value);
  };

  let t;
  busca.oninput = () => { clearTimeout(t); t = setTimeout(filtrar, 180); };
  selCat.onchange = filtrarEIrParaTopo;
  selOrdem.onchange = filtrarEIrParaTopo;

  // ---------- Copiar ----------
  const toast = $("toast");
  let tt;
  function copiar(texto, rotulo = texto) {
    const ok = () => { toast.textContent = `Copiado: ${rotulo}`; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), 1400); };
    if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(texto).then(ok);
    else {
      const ta = document.createElement("textarea");
      ta.value = texto; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); ok();
    }
  }

  // ---------- Partes do corpo / XML ----------
  const PARTES = [
    // x/y = ponto no corpo; lx/ly = etiqueta clicável, numa área vazia para não tapar o ped
    { id: "cabeca", nome: "Cabeça", x: 31.5, y: 20.0, lx: 19.0, ly: 13.0 },
    { id: "cabelo", nome: "Cabelo", x: 67.9, y: 17.0, lx: 80.0, ly: 11.0 },
    { id: "torso",  nome: "Torso",  x: 32.5, y: 38.0, lx: 49.5, ly: 24.0 },
    { id: "mao",    nome: "Mãos",   x: 18.3, y: 47.5, lx: 9.0,  ly: 58.0 },
    { id: "perna",  nome: "Pernas", x: 29.2, y: 70.0, lx: 16.0, ly: 72.0 },
    { id: "pe",     nome: "Pés",    x: 28.2, y: 90.0, lx: 16.0, ly: 92.0 },
    { id: "outros", nome: "Outros" }, // sem marcador, só no painel
  ];
  const NOME_PARTE = Object.fromEntries(PARTES.map((p) => [p.id, p.nome]));

  // Classifica o item pelo nome do drawable (ex.: HEAD_FR1_4004 -> cabeça)
  const REGRAS = [
    ["cabelo", ["HAIR", "MUSTACHE", "MOUSTACHE", "SIDEBURN"]],
    ["cabeca", ["EARRING", "EYEBROW", "BEARD", "HEAD", "EYE", "TEETH", "HAT", "SHAWL", "MASK", "FACE", "HELMET", "BONNET", "MOUTH", "TONGUE", "GLASSES"]],
    ["mao",    ["GLOV", "RING", "HAND", "BRACELET", "GAUNTLET", "WRIST"]],
    ["pe",     ["BOOT", "SPUR", "SHOE", "FEET", "FOOT", "SPAT"]],
    ["perna",  ["PANT", "LOWR", "LOWER", "SKIRT", "CHAP", "LEG", "BELT", "HOLSTER", "TROUSER", "OVERALL", "KNEE"]],
    ["torso",  ["COAT", "VEST", "SHIRT", "UPPR", "UPPER", "TORSO", "TIE", "NECK", "SCARF", "BADGE", "SUSPENDER",
                "PONCHO", "APRON", "DRESS", "CLOAK", "TUX", "UNIONSUIT", "JACKET", "CORSET", "GOWN", "BLOUSE", "SWEATER",
                "COMBO", "OUTFIT", "NUDE", "BODY", "CHEST", "ARM", "SLEEVE", "SASH", "BANDOLIER", "ACCS", "CHEMISE", "MANTLE"]],
  ];
  function classificar(nome) {
    const up = nome.toUpperCase();
    let t = up.replace(/^(PLAYER_(ZERO|ONE|THREE)|MP)_/, "").split("_");
    // CS_DUTCH_MS1_HAT_000 -> considera só o que vem depois do tipo de corpo (evita "MATTHEWS" -> HAT)
    const k = t.findIndex((x) => /^[MF][RS]\d$/.test(x));
    if (k >= 0 && /^(CS|PLAYER)/.test(up)) t = t.slice(k + 1);
    for (const [parte, chaves] of REGRAS)
      if (t.some((x) => !/^\d+$/.test(x) && chaves.some((c) => x.includes(c)))) return parte;
    return "outros";
  }
  function parteDoItem(xml) {
    const drawable = (xml.match(/<drawable>([^<]*)/) || [])[1] || "";
    const albedo = (xml.match(/<albedo>([^<]*)/) || [])[1] || "";
    // UPPERTORSO é o corpo (braços/mãos); o albedo diz se é a textura da mão
    if (/^UPPERTORSO/i.test(drawable)) return /HAND/i.test(albedo) ? "mao" : "torso";
    const p = classificar(drawable);
    return p !== "outros" || !albedo ? p : classificar(albedo); // drawable em hash (0x...) -> tenta o albedo
  }

  const ehAnimal = (model) => /(^|_)A_C_|HORSE/i.test(model);

  // Carrega dados/<MODELO>.js sob demanda (funciona abrindo o index.html direto, sem servidor)
  const TEM_XML = new Set(window.YMTS || []);
  const cacheXml = {};
  const esperando = {};
  window.__ymt = (model, dados) => {
    const minusculas = (xml) => xml.replace(/>([^<]+)</g, (_, t) => ">" + t.toLowerCase() + "<");
    dados.outfits = dados.outfits.map((itens) => itens.map((xml) => ({ xml: minusculas(xml), parte: parteDoItem(xml) })));
    cacheXml[model] = dados;
    (esperando[model] || []).forEach((r) => r(dados));
    delete esperando[model];
  };
  function carregarXml(model) {
    if (!TEM_XML.has(model)) return Promise.resolve(null);
    if (cacheXml[model]) return Promise.resolve(cacheXml[model]);
    return new Promise((resolve) => {
      if (esperando[model]) return esperando[model].push(resolve);
      esperando[model] = [resolve];
      const s = document.createElement("script");
      s.src = "dados/" + encodeURIComponent(model) + ".js";
      s.onerror = () => { (esperando[model] || []).forEach((r) => r(null)); delete esperando[model]; };
      document.head.appendChild(s);
    });
  }

  const realcarXml = (xml) =>
    esc(xml).replace(/(&lt;\/?)([\w:]+)(.*?)(\/?&gt;)/g, (_, a, tag, attrs, b) =>
      `<span class="t">${a}${tag}</span>` +
      attrs.replace(/([\w:]+)=(&quot;.*?&quot;)/g, '<span class="a">$1</span>=<span class="v">$2</span>') +
      `<span class="t">${b}</span>`);

  // ---------- Visualizador ----------
  const lb = $("lightbox");
  const pBody = $("p-body");
  let atual = -1;
  let parteSel = null;   // parte do corpo selecionada (mantida ao trocar de imagem)
  let verFull = false;   // painel mostrando o outfit completo
  let itensAtuais = null;

  function abrir(idx, full = false) {
    atual = idx;
    if (full) { verFull = true; parteSel = null; }
    const i = filtrados[idx];
    // Mostra a miniatura na hora e troca pela original quando ela terminar de carregar
    const lbImg = $("lb-img");
    lbImg.src = thumb(i);
    lbImg.onerror = () => { lbImg.onerror = null; lbImg.src = src(i); };
    const original = new Image();
    original.onload = () => { if (atual === idx) { lbImg.onerror = null; lbImg.src = original.src; } };
    original.src = src(i);
    $("lb-open").href = src(i);
    $("lb-model").textContent = i.model;
    $("lb-sub").textContent = `Outfit ${i.outfit}${i.nome ? " · " + i.nome : ""} · ${i.cat} · ${idx + 1}/${filtrados.length}`;
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
    itensAtuais = null;
    renderPainel(true);
    salvarUrl();
    carregarXml(i.model).then((dados) => {
      if (atual !== idx) return; // usuário já navegou para outra imagem
      itensAtuais = dados ? dados.outfits[+i.outfit] || [] : null;
      renderPainel();
    });
  }
  const fechar = () => { lb.classList.remove("open"); document.body.style.overflow = ""; atual = -1; salvarUrl(); };
  const navegar = (d) => { if (atual < 0) return; abrir((atual + d + filtrados.length) % filtrados.length); };

  function renderPainel(carregando = false) {
    const i = filtrados[atual];
    const porParte = {};
    (itensAtuais || []).forEach((it) => (porParte[it.parte] = porParte[it.parte] || []).push(it));

    // Marcadores (◎ normal, ◉ selecionado): etiqueta fora do corpo + linha até um ponto na parte
    const comMarcador = ehAnimal(i.model) ? [] : PARTES.filter((p) => p.x != null);
    const estado = (p) => {
      const n = (porParte[p.id] || []).length;
      return [parteSel === p.id ? "sel" : "", itensAtuais && !n ? "vazio" : ""].join(" ");
    };
    $("lb-marcadores").innerHTML =
      `<svg class="guias" viewBox="0 0 100 100" preserveAspectRatio="none">` +
      comMarcador.map((p) => `<line class="${estado(p)}" x1="${p.x}" y1="${p.y}" x2="${p.lx}" y2="${p.ly}"/>`).join("") +
      `</svg>` +
      comMarcador.map((p) => `<span class="ponto ${estado(p)}" style="left:${p.x}%;top:${p.y}%"></span>`).join("") +
      comMarcador.map((p) => {
        const n = (porParte[p.id] || []).length;
        return `<button class="marcador ${estado(p)}" data-parte="${p.id}" style="left:${p.lx}%;top:${p.ly}%">
          <span class="ic">${parteSel === p.id ? "◉" : "◎"}</span>${p.nome}${itensAtuais ? ` <span class="n">${n}</span>` : ""}</button>`;
      }).join("");

    // Atalhos das partes no painel
    $("p-partes").innerHTML = PARTES.map((p) => {
      const n = (porParte[p.id] || []).length;
      if (p.id === "outros" && !n) return "";
      return `<button class="chip ${parteSel === p.id ? "sel" : ""}" data-parte="${p.id}" ${itensAtuais && !n ? "disabled" : ""}>
        <span class="ic">${parteSel === p.id ? "◉" : "◎"}</span>${p.nome}${itensAtuais ? ` <span class="n">${n}</span>` : ""}</button>`;
    }).join("");
    $("lb-full").classList.toggle("ativo", verFull);

    const titulo = $("p-titulo");
    const btnCopiar = $("p-copiar");
    btnCopiar.style.display = "none";

    if (carregando) {
      titulo.textContent = "Carregando XML…";
      pBody.innerHTML = "";
      return;
    }
    if (!itensAtuais) {
      titulo.textContent = "XML não encontrado";
      pBody.innerHTML = `<div class="dica">Não há arquivo em <b>/ymts</b> para <br>${esc(i.model)}.</div>`;
      return;
    }
    if (!itensAtuais.length) {
      titulo.textContent = `Outfit ${i.outfit}`;
      pBody.innerHTML = `<div class="dica">Este outfit não tem itens em &lt;explicitAssets&gt;.</div>`;
      return;
    }

    if (verFull) {
      titulo.innerHTML = `Outfit Full <span class="qtd">· Outfit ${esc(i.outfit)} · ${itensAtuais.length} itens</span>`;
      pBody.innerHTML = blocosXml(itensAtuais, true);
      btnCopiar.style.display = "";
      btnCopiar.textContent = "Copiar tudo";
      return;
    }
    if (parteSel) {
      const itens = porParte[parteSel] || [];
      titulo.innerHTML = `${NOME_PARTE[parteSel]} <span class="qtd">· Outfit ${esc(i.outfit)} · ${itens.length} ${itens.length === 1 ? "item" : "itens"}</span>`;
      pBody.innerHTML = itens.length ? blocosXml(itens)
        : `<div class="dica">Nenhum item de ${NOME_PARTE[parteSel].toLowerCase()} neste outfit.</div>`;
      if (itens.length) { btnCopiar.style.display = ""; btnCopiar.textContent = "Copiar tudo"; }
      return;
    }
    titulo.innerHTML = `Outfit ${esc(i.outfit)} <span class="qtd">· ${itensAtuais.length} itens</span>`;
    pBody.innerHTML = `<div class="dica">Clique em um <b>◎</b> na imagem (ou em uma parte acima)<br>para ver o XML daquela parte do corpo.<br><br>
      Ou use <b style="font-size:inherit">Ver Outfit Full</b> para ver todos os itens.</div>`;
  }

  const juntarXml = (itens) => itens.map((it) => it.xml).join("\n");

  // head_, eyes_, teeth_, eyebrows_, eye_cap_ e eyelashes_ (base do rosto) ficam num bloco separado do resto.
  // Só o início do nome conta: "p_eyes_mr1_000" vai para o resto.
  // Nos peds de cutscene/player o nome vem depois do nome do ped: "cs_dutch_ms1_head_000", "player_zero_eyebrows_003".
  const BASE_ROSTO = "head|eyes|teeth|eyebrows?|eye_?caps?|eyelash(es)?";
  const reBaseRosto = new RegExp(`^(${BASE_ROSTO})_`);
  const reBaseRostoPed = new RegExp(`^(cs|mp_cs|player)_.*_(${BASE_ROSTO})(_|$)`);
  const ehBaseRosto = (it) => {
    const drawable = ((it.xml.match(/<drawable>([^<]*)/) || [])[1] || "").toLowerCase();
    return reBaseRosto.test(drawable) || reBaseRostoPed.test(drawable);
  };
  let blocosAtuais = []; // texto de cada bloco, para o botão "Copiar" de cada um
  // separarCabelo: no Outfit Full o cabelo ganha um bloco próprio
  const blocosXml = (itens, separarCabelo = false) => {
    const base = itens.filter(ehBaseRosto);
    const cabelo = separarCabelo ? itens.filter((it) => !ehBaseRosto(it) && it.parte === "cabelo") : [];
    const resto = itens.filter((it) => !ehBaseRosto(it) && !cabelo.includes(it));
    const grupos = [];
    if (base.length) grupos.push(["Head / Eyes / Teeth / Eyebrows / Eye cap / Eyelashes", base]);
    if (cabelo.length) grupos.push(["Cabelo", cabelo]);
    if (resto.length) grupos.push(["Demais itens", resto]);
    blocosAtuais = grupos.map(([, its]) => juntarXml(its));
    return grupos.map(([nome, its], k) =>
      (grupos.length > 1 ? `<div class="grupo-titulo">${nome} <span class="qtd">· ${its.length}</span></div>` : "") +
      `<pre class="xml"><button class="btn destaque copiar-item" data-bloco="${k}">Copiar</button>${realcarXml(blocosAtuais[k])}</pre>`
    ).join("");
  };

  function selecionarParte(id) {
    verFull = false;
    parteSel = parteSel === id ? null : id; // clicar de novo desmarca
    renderPainel();
    salvarUrl();
  }

  lb.addEventListener("click", (e) => {
    const p = e.target.closest("[data-parte]");
    if (p) return selecionarParte(p.dataset.parte);
    const c = e.target.closest(".copiar-item");
    if (c) {
      const k = +c.dataset.bloco;
      const n = (blocosAtuais[k].match(/<Item>/g) || []).length;
      return copiar(blocosAtuais[k], `${n} ${n === 1 ? "item" : "itens"}`);
    }
  });
  $("lb-full").onclick = () => { verFull = !verFull; if (verFull) parteSel = null; renderPainel(); salvarUrl(); };
  $("p-copiar").onclick = () => {
    if (!itensAtuais) return;
    if (verFull) copiar(juntarXml(itensAtuais), `Outfit Full (${itensAtuais.length} itens)`);
    else if (parteSel) {
      const itens = itensAtuais.filter((it) => it.parte === parteSel);
      copiar(juntarXml(itens), `${NOME_PARTE[parteSel]} (${itens.length} ${itens.length === 1 ? "item" : "itens"})`);
    }
  };

  container.addEventListener("click", (e) => {
    const cm = e.target.closest("[data-copy-model]");
    if (cm) { copiar(filtrados[+cm.dataset.copyModel].model); return; }
    const full = e.target.closest("[data-full]");
    if (full) { abrir(+full.dataset.full, true); return; }
    const el = e.target.closest("[data-idx]");
    if (el) abrir(+el.dataset.idx);
  });
  $("lb-close").onclick = fechar;
  $("lb-prev").onclick = () => navegar(-1);
  $("lb-next").onclick = () => navegar(1);
  lb.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => {
    const i = filtrados[atual];
    copiar(b.dataset.copy === "model" ? i.model : b.dataset.copy === "outfit" ? i.outfit : i.file);
  });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) {
      if (e.key === "/" && document.activeElement !== busca) { e.preventDefault(); busca.focus(); }
      return;
    }
    if (e.key === "Escape") fechar();
    if (e.key === "ArrowLeft") navegar(-1);
    if (e.key === "ArrowRight") navegar(1);
  });

  // Restaura filtros e a imagem aberta a partir da URL (F5 / recarregar)
  const inicial = new URLSearchParams(location.hash.slice(1));
  busca.value = inicial.get("q") || "";
  if ([...selCat.options].some((o) => o.value === inicial.get("cat"))) selCat.value = inicial.get("cat");
  if (inicial.get("ordem") === "nome-desc") selOrdem.value = "nome-desc";

  aplicarModo();

  const imgInicial = inicial.get("img");
  if (imgInicial) {
    let idx = filtrados.findIndex((i) => i.file === imgInicial);
    if (idx < 0) { // a imagem não está nos filtros salvos: limpa os filtros e procura de novo
      busca.value = ""; selCat.value = "";
      filtrar();
      idx = filtrados.findIndex((i) => i.file === imgInicial);
    }
    if (idx >= 0) {
      verFull = inicial.get("full") === "1";
      parteSel = !verFull && NOME_PARTE[inicial.get("parte")] ? inicial.get("parte") : null;
      abrir(idx);
    } else salvarUrl();
  }
})();
