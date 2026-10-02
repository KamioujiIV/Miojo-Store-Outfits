// Gera miniaturas leves (WebP, 640px de largura), usadas na grade e na lista:
//   img/            -> thumbs/
//   Drawables/      -> thumbs_drawables/
//   Drawables_Shop/ -> thumbs_shop/
// Só gera as que ainda não existem (ou cuja imagem original mudou) e apaga as de imagens removidas.
// Precisa do ffmpeg instalado (no PATH).
// Uso (na pasta do site): node js/gerar-miniaturas.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const raiz = path.join(__dirname, "..");
const PASTAS = [
  ["img", "thumbs"],
  ["Drawables", "thumbs_drawables"],
  ["Drawables_Shop", "thumbs_shop"],
];
const LARGURA = 640;
const QUALIDADE = 72;

const nomeThumb = (f) => f.replace(/\.[^.]+$/, ".webp");

// Lista o trabalho de todas as pastas
const pendentes = [];
for (const [origem, destino] of PASTAS) {
  const dirImg = path.join(raiz, origem);
  const dirThumbs = path.join(raiz, destino);
  if (!fs.existsSync(dirImg)) { console.log(`${origem}/: pasta não encontrada, pulando`); continue; }
  fs.mkdirSync(dirThumbs, { recursive: true });

  const imagens = fs.readdirSync(dirImg).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const esperadas = new Set(imagens.map(nomeThumb));
  let removidas = 0;
  for (const t of fs.readdirSync(dirThumbs)) {
    // Remove miniaturas de imagens que não existem mais e sobras (.tmp ou vazias) de uma execução interrompida
    const caminho = path.join(dirThumbs, t);
    if (!esperadas.has(t) || fs.statSync(caminho).size === 0) { fs.unlinkSync(caminho); removidas++; }
  }
  const novas = imagens.filter((f) => {
    const t = path.join(dirThumbs, nomeThumb(f));
    return !fs.existsSync(t) || fs.statSync(t).mtimeMs < fs.statSync(path.join(dirImg, f)).mtimeMs;
  });
  novas.forEach((f) => pendentes.push([path.join(dirImg, f), path.join(dirThumbs, nomeThumb(f)), f]));
  console.log(`${origem}/ -> ${destino}/: ${imagens.length} imagens · ${novas.length} para gerar${removidas ? ` · ${removidas} removidas` : ""}`);
}
if (!pendentes.length) process.exit(0);

const executar = (args) => new Promise((resolve) => {
  try {
    execFile("ffmpeg", args, (err) => resolve(err));
  } catch (err) {
    resolve(err); // no Windows o spawn pode falhar na hora (ex.: "spawn UNKNOWN") com muitos processos
  }
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Grava num arquivo temporário e só renomeia no fim: nunca fica uma miniatura pela metade
const gerar = async ([entrada, saida, nome]) => {
  const temp = saida + ".tmp.webp";
  let err;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    err = await executar([
      "-v", "error", "-y", "-i", entrada,
      "-vf", `scale=${LARGURA}:-2`, "-c:v", "libwebp", "-quality", String(QUALIDADE),
      temp,
    ]);
    if (!err) { fs.renameSync(temp, saida); return null; }
    if (err.code === "ENOENT") break; // ffmpeg não instalado: não adianta tentar de novo
    await espera(500 * tentativa);
  }
  fs.rmSync(temp, { force: true });
  return `${nome}: ${(err.message || String(err)).split("\n")[0]}`;
};

(async () => {
  const erros = [];
  let feitas = 0;
  let prox = 0;
  const inicio = Date.now();
  const trabalhador = async () => {
    while (prox < pendentes.length) {
      const erro = await gerar(pendentes[prox++]);
      if (erro) erros.push(erro);
      if (++feitas % 500 === 0 || feitas === pendentes.length)
        process.stdout.write(`\r  ${feitas}/${pendentes.length} (${Math.round((Date.now() - inicio) / 1000)}s)`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, os.cpus().length) }, trabalhador));
  console.log(`\nPronto. ${erros.length ? `${erros.length} erro(s):` : "Sem erros."}`);
  erros.slice(0, 20).forEach((e) => console.log("  " + e));
  if (erros.some((e) => /ENOENT/.test(e))) console.log("\nO ffmpeg não foi encontrado. Instale com: winget install ffmpeg");
})();
