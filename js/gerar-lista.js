// Gera:
//   js/imagens.js            -> lista de arquivos da pasta /img + modelos que têm XML
//   js/lista-drawables.js    -> lista de arquivos da pasta /Drawables      (aba Drawables)
//   js/lista-shop.js         -> lista de arquivos da pasta /Drawables_Shop (aba Outfits Shop)
//   dados/<MODELO>.js        -> itens de <explicitAssets> de cada outfit, lidos de /ymts
//   dados_drawables/<xx>.js  -> para cada drawable, as variações de <Item> encontradas nos /ymts
//                               (dividido em 256 arquivos pelo hash do nome, carregados sob demanda)
// Uso (na pasta do site): node js/gerar-lista.js
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const dirImg = path.join(raiz, "img");
const dirYmt = path.join(raiz, "ymts");
const dirDados = path.join(raiz, "dados");

// ---------- Imagens ----------
const imagens = fs
  .readdirSync(dirImg)
  .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const qtdImagens = {};
for (const f of imagens) {
  const m = f.split("-")[0].toUpperCase();
  qtdImagens[m] = (qtdImagens[m] || 0) + 1;
}

// ---------- YMTs ----------
// "a_f_m_sdchinatown_01_ymt_dehashed.xml", "cs_dutch.ymt.xml", "x.ymt.pso.xml" -> "A_F_M_SDCHINATOWN_01"
const nomeModelo = (f) =>
  f.replace(/\.xml$/i, "").replace(/_ymt_dehashed$/i, "").replace(/\.pso$/i, "").replace(/\.ymt$/i, "").toUpperCase();

// Remove a indentação comum do bloco
const dedent = (txt) => {
  const linhas = txt.split(/\r?\n/);
  // A 1ª linha começa já no "<Item>", então a indentação é medida pelas demais
  const ind = Math.min(...linhas.slice(1).filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  return [linhas[0].trim(), ...linhas.slice(1).map((l) => l.slice(ind))].join("\n");
};

const arquivos = {};
for (const f of fs.readdirSync(dirYmt).filter((f) => /\.xml$/i.test(f))) {
  const m = nomeModelo(f);
  // Prefere o arquivo "limpo" (sem _ymt_dehashed); os dois têm o mesmo conteúdo
  if (!arquivos[m] || /_ymt_dehashed/i.test(arquivos[m])) arquivos[m] = f;
}

fs.rmSync(dirDados, { recursive: true, force: true });
fs.mkdirSync(dirDados);

// Texto entre as tags em minúsculas; tags e atributos ficam como no original (igual ao site)
const minusculas = (xml) => xml.replace(/>([^<]+)</g, (_, t) => ">" + t.toLowerCase() + "<");

// Índice das peças: DRAWABLE -> (xml da variação -> modelos que usam)
const porDrawable = new Map();

const comXml = [];
const avisos = [];
for (const [modelo, f] of Object.entries(arquivos)) {
  const xml = fs.readFileSync(path.join(dirYmt, f), "utf8");
  const outfits = [];
  const re = /<explicitAssets\s*\/>|<explicitAssets>([\s\S]*?)<\/explicitAssets>/g;
  let m;
  while ((m = re.exec(xml))) {
    const itens = m[1] ? (m[1].match(/<Item>[\s\S]*?<\/Item>/g) || []).map(dedent) : [];
    outfits.push(itens);
    for (const it of itens) {
      const d = (it.match(/<drawable>([^<]*)/) || [])[1];
      if (!d) continue;
      const k = d.toUpperCase();
      if (!porDrawable.has(k)) porDrawable.set(k, new Map());
      const variacoes = porDrawable.get(k);
      const x = minusculas(it);
      if (!variacoes.has(x)) variacoes.set(x, new Set());
      variacoes.get(x).add(modelo);
    }
  }
  if (!outfits.length) continue;

  const total = (xml.match(/<fullOutfit\b/g) || []).length;
  if (total && total !== outfits.length) avisos.push(`${modelo}: ${outfits.length} explicitAssets para ${total} outfits`);
  if (qtdImagens[modelo] && qtdImagens[modelo] !== outfits.length)
    avisos.push(`${modelo}: ${qtdImagens[modelo]} imagens, ${outfits.length} outfits no XML`);

  fs.writeFileSync(
    path.join(dirDados, modelo + ".js"),
    `__ymt(${JSON.stringify(modelo)},${JSON.stringify({ arquivo: f, outfits })});\n`
  );
  comXml.push(modelo);
}

comXml.sort();
fs.writeFileSync(
  path.join(__dirname, "imagens.js"),
  "window.IMAGENS = " + JSON.stringify(imagens) + ";\n" +
  "window.YMTS = " + JSON.stringify(comXml) + ";\n"
);

// ---------- Drawables (abas Outfits Shop e Drawables) ----------
const listarPasta = (pasta) => {
  const dir = path.join(raiz, pasta);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};
const listaDrawables = listarPasta("Drawables");
const listaShop = listarPasta("Drawables_Shop");
fs.writeFileSync(path.join(__dirname, "lista-drawables.js"), "window.LISTA_DRAWABLES = " + JSON.stringify(listaDrawables) + ";\n");
fs.writeFileSync(path.join(__dirname, "lista-shop.js"), "window.LISTA_SHOP = " + JSON.stringify(listaShop) + ";\n");

// Mesmo cálculo do site (js/app.js -> baldeDrawable): FNV-1a do nome em maiúsculas, 256 baldes
const balde = (nome) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < nome.length; i++) h = Math.imul(h ^ nome.charCodeAt(i), 0x01000193) >>> 0;
  return (h & 0xff).toString(16).padStart(2, "0");
};
const dirDraw = path.join(raiz, "dados_drawables");
fs.rmSync(dirDraw, { recursive: true, force: true });
fs.mkdirSync(dirDraw);
const indiceModelo = new Map(comXml.map((m, i) => [m, i]));
const baldes = {};
for (const [drawable, variacoes] of porDrawable) {
  // [xml, [índices em window.YMTS dos modelos que usam essa variação]]
  (baldes[balde(drawable)] ||= {})[drawable] =
    [...variacoes].map(([x, modelos]) => [x, [...modelos].map((m) => indiceModelo.get(m)).sort((a, b) => a - b)]);
}
for (const [b, conteudo] of Object.entries(baldes))
  fs.writeFileSync(path.join(dirDraw, b + ".js"), `__drw(${JSON.stringify(b)},${JSON.stringify(conteudo)});\n`);

const achados = (lista) => lista.filter((f) => porDrawable.has(f.split("-")[0].toUpperCase())).length;

const semXml = Object.keys(qtdImagens).filter((m) => !arquivos[m]);
console.log(`imagens.js gerado com ${imagens.length} imagens.`);
console.log(`dados/ gerado com ${comXml.length} modelos (${semXml.length} modelos com imagem não têm XML).`);
console.log(`dados_drawables/ gerado com ${porDrawable.size} drawables.`);
console.log(`Drawables: ${listaDrawables.length} imagens (${achados(listaDrawables)} com XML).`);
console.log(`Outfits Shop: ${listaShop.length} imagens (${achados(listaShop)} com XML).`);
if (avisos.length) {
  console.log(`\n${avisos.length} aviso(s):`);
  avisos.slice(0, 30).forEach((a) => console.log("  " + a));
  if (avisos.length > 30) console.log(`  … e mais ${avisos.length - 30}`);
}
