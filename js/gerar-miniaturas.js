// Gera miniaturas leves (WebP, 640px de largura) de /img em /thumbs, usadas na grade e na lista.
// Só gera as que ainda não existem (ou cuja imagem original mudou).
// Precisa do ffmpeg instalado (no PATH).
// Uso (na pasta do site): node js/gerar-miniaturas.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const raiz = path.join(__dirname, "..");
const dirImg = path.join(raiz, "img");
const dirThumbs = path.join(raiz, "thumbs");
const LARGURA = 640;
const QUALIDADE = 72;

fs.mkdirSync(dirThumbs, { recursive: true });

const nomeThumb = (f) => f.replace(/\.[^.]+$/, ".webp");
const imagens = fs.readdirSync(dirImg).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

// Remove miniaturas de imagens que não existem mais
const esperadas = new Set(imagens.map(nomeThumb));
let removidas = 0;
for (const t of fs.readdirSync(dirThumbs)) {
  if (!esperadas.has(t)) { fs.unlinkSync(path.join(dirThumbs, t)); removidas++; }
}

const pendentes = imagens.filter((f) => {
  const t = path.join(dirThumbs, nomeThumb(f));
  return !fs.existsSync(t) || fs.statSync(t).mtimeMs < fs.statSync(path.join(dirImg, f)).mtimeMs;
});

console.log(`${imagens.length} imagens · ${pendentes.length} miniaturas para gerar${removidas ? ` · ${removidas} removidas` : ""}`);
if (!pendentes.length) process.exit(0);

const gerar = (f) => new Promise((resolve) => {
  execFile("ffmpeg", [
    "-v", "error", "-y", "-i", path.join(dirImg, f),
    "-vf", `scale=${LARGURA}:-2`, "-c:v", "libwebp", "-quality", String(QUALIDADE),
    path.join(dirThumbs, nomeThumb(f)),
  ], (err) => resolve(err ? `${f}: ${err.message.split("\n")[0]}` : null));
});

(async () => {
  const erros = [];
  let feitas = 0;
  let prox = 0;
  const inicio = Date.now();
  const trabalhador = async () => {
    while (prox < pendentes.length) {
      const erro = await gerar(pendentes[prox++]);
      if (erro) erros.push(erro);
      if (++feitas % 250 === 0 || feitas === pendentes.length)
        process.stdout.write(`\r  ${feitas}/${pendentes.length} (${Math.round((Date.now() - inicio) / 1000)}s)`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, os.cpus().length) }, trabalhador));
  console.log(`\nPronto. ${erros.length ? `${erros.length} erro(s):` : "Sem erros."}`);
  erros.slice(0, 20).forEach((e) => console.log("  " + e));
  if (erros.some((e) => /ENOENT/.test(e))) console.log("\nO ffmpeg não foi encontrado. Instale com: winget install ffmpeg");
})();
